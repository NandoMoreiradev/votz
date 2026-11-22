import { Injectable } from '@nestjs/common'
import type { AdFraudLevel, AdFraudStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { AdsBillingRepository } from '../ads-billing/ads-billing.repository'
import { applyCreditToPending, creditMillicents, type IvtVerdict } from './ivt-rules'

export interface DayFacts {
  adId: string
  adSetId: string
  day: Date
  viewable: number
  clicks: number
  grossSpendMillicentsNow: number
  adName: string
  adStatus: string
  campaignName: string
  chargeOn: 'CLICK' | 'VIEWABLE_IMPRESSION'
  accountId: string
  companyId: string
}

export interface FindingResult {
  flagId: string
  created: boolean
  level: AdFraudLevel
  /** Total já devolvido por este caso, em milésimos de centavo. */
  creditedMillicents: number
  /** Devolvido agora, nesta passada. */
  creditedNowMillicents: number
  pausedNow: boolean
}

const FLAG_INCLUDE = {
  ad: {
    select: {
      id: true,
      name: true,
      status: true,
      creative: { select: { headline: true } },
      adSet: { select: { campaign: { select: { name: true, objective: true, account: { select: { id: true, name: true, company: { select: { id: true, tradeName: true } } } } } } } },
    },
  },
} satisfies Prisma.AdFraudFlagInclude

export type FraudFlagRecord = Prisma.AdFraudFlagGetPayload<{ include: typeof FLAG_INCLUDE }>

/** Só tabelas de anúncio e a equipe da empresa que anuncia. Contagem por anúncio e dia, nunca pessoa. */
@Injectable()
export class AdsFraudRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: AdsBillingRepository,
  ) {}

  /** Contagem dos dias pedidos dos anúncios com cliques suficientes para julgar. */
  async candidateDays(days: Date[], minClicks: number): Promise<DayFacts[]> {
    const rows = await this.prisma.adDailyStat.findMany({
      where: { day: { in: days }, clicks: { gte: minClicks } },
      select: {
        adId: true,
        adSetId: true,
        day: true,
        viewableImpressions: true,
        clicks: true,
        spendMillicents: true,
        ad: {
          select: {
            name: true,
            status: true,
            adSet: { select: { campaign: { select: { name: true, objective: true, accountId: true, account: { select: { companyId: true } } } } } },
          },
        },
      },
    })
    return rows.map((row) => {
      const campaign = row.ad.adSet.campaign
      return {
        adId: row.adId,
        adSetId: row.adSetId,
        day: row.day,
        viewable: row.viewableImpressions,
        clicks: row.clicks,
        grossSpendMillicentsNow: row.spendMillicents,
        adName: row.ad.name,
        adStatus: row.ad.status,
        campaignName: campaign.name,
        chargeOn: campaign.objective === 'TRAFFIC' ? 'CLICK' : 'VIEWABLE_IMPRESSION',
        accountId: campaign.accountId,
        companyId: campaign.account.companyId,
      }
    })
  }

  /** Cliques de exibições que nunca foram vistas, por anúncio, dentro do intervalo. */
  async clicksWithoutView(adIds: string[], from: Date, to: Date): Promise<Map<string, number>> {
    if (!adIds.length) return new Map()
    const rows = await this.prisma.adImpression.groupBy({
      by: ['adId'],
      where: { adId: { in: adIds }, clickedAt: { gte: from, lt: to }, viewableAt: null },
      _count: { _all: true },
    })
    return new Map(rows.map((row) => [row.adId, row._count._all]))
  }

  /**
   * Grava o caso do anúncio no dia e aplica o que ficou decidido: crédito (só a diferença do que já foi devolvido),
   * e, no caso extremo, a pausa. Caso já resolvido pela moderação não é mexido. Pode rodar em duas instâncias:
   * o crédito só passa para quem trocar o total devolvido primeiro.
   */
  applyFinding(day: DayFacts, verdict: IvtVerdict, clicksWithoutView: number): Promise<FindingResult | null> {
    return this.prisma.$transaction(async (tx) => {
      let flag = await tx.adFraudFlag.findUnique({ where: { adId_day: { adId: day.adId, day: day.day } } })
      // Descartado pela moderação: era tráfego normal, nada mais a fazer. Confirmado: continua devolvendo o que passar do plausível, sem pausar de novo.
      if (flag?.status === 'DISMISSED') return null
      const confirmed = flag?.status === 'CONFIRMED'
      const created = !flag

      const base = {
        accountId: day.accountId,
        signals: verdict.signals,
        viewable: day.viewable,
        clicks: day.clicks,
        clicksWithoutView,
        invalidClicks: verdict.invalidClicks,
      }
      if (!flag) {
        flag = await tx.adFraudFlag.create({ data: { adId: day.adId, day: day.day, level: verdict.level, ...base } })
      } else {
        // O nível só sobe; sinal que sumiu depois não rebaixa o caso.
        flag = await tx.adFraudFlag.update({ where: { id: flag.id }, data: { ...base, level: verdict.level === 'EXTREME' ? 'EXTREME' : flag.level } })
      }

      let creditedNow = 0
      const gross = day.grossSpendMillicentsNow + flag.creditedMillicents
      const target = creditMillicents({ chargeOn: day.chargeOn, grossSpendMillicents: gross, clicks: day.clicks, invalidClicks: verdict.invalidClicks })
      const delta = target - flag.creditedMillicents
      if (delta > 0) {
        const claimed = await tx.adFraudFlag.updateMany({ where: { id: flag.id, creditedMillicents: flag.creditedMillicents }, data: { creditedMillicents: target } })
        if (claimed.count === 1) {
          await this.creditAccount(tx, day, delta)
          creditedNow = delta
          flag = { ...flag, creditedMillicents: target }
        }
      }

      let pausedNow = false
      if (!confirmed && flag.level === 'EXTREME' && !flag.pausedAd) {
        // Anúncio criado pelo passo a passo nasce como rascunho (DRAFT) e já entrega: pausa qualquer um que não esteja parado ou arquivado.
        const paused = await tx.ad.updateMany({ where: { id: day.adId, status: { notIn: ['PAUSED', 'ARCHIVED'] } }, data: { status: 'PAUSED' } })
        if (paused.count === 1) {
          await tx.adFraudFlag.update({ where: { id: flag.id }, data: { pausedAd: true } })
          pausedNow = true
        }
      }
      return { flagId: flag.id, created, level: flag.level, creditedMillicents: flag.creditedMillicents, creditedNowMillicents: creditedNow, pausedNow }
    })
  }

  /** Reduz o gasto do dia e devolve ao anunciante: primeiro do gasto ainda não lançado, depois como crédito no livro-caixa. */
  private async creditAccount(tx: Prisma.TransactionClient, day: DayFacts, millicents: number) {
    const stat = await tx.adDailyStat.findUnique({ where: { adId_day: { adId: day.adId, day: day.day } }, select: { spendMillicents: true } })
    const fromStat = Math.min(millicents, stat?.spendMillicents ?? 0)
    if (fromStat > 0) await tx.adDailyStat.update({ where: { adId_day: { adId: day.adId, day: day.day } }, data: { spendMillicents: { decrement: fromStat } } })

    // Troca otimista do gasto pendente: se uma cobrança entrou no meio, lê de novo.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const account = await tx.adAccount.findUniqueOrThrow({ where: { id: day.accountId }, select: { pendingSpendMillicents: true } })
      const { newPendingMillicents, refundCents } = applyCreditToPending(account.pendingSpendMillicents, millicents)
      const swapped = await tx.adAccount.updateMany({
        where: { id: day.accountId, pendingSpendMillicents: account.pendingSpendMillicents },
        data: { pendingSpendMillicents: newPendingMillicents },
      })
      if (swapped.count !== 1) continue
      if (refundCents > 0) {
        await this.billing.postLedger(tx, {
          adAccountId: day.accountId,
          type: 'REFUND',
          description: 'Crédito por tráfego inválido',
          lines: [
            { ledger: 'AD_REVENUE', side: 'DEBIT', amountCents: refundCents },
            { ledger: 'CUSTOMER_BALANCE', side: 'CREDIT', amountCents: refundCents },
          ],
        })
      }
      return
    }
    throw new Error('Não consegui aplicar o crédito de tráfego inválido: o gasto da conta mudou várias vezes seguidas.')
  }

  // ── Fila da moderação ────────────────────────────────────────────────────────────────────────

  async listFlags(status: AdFraudStatus, page: number, take: number) {
    const where = { status }
    const [total, openCount, data] = await Promise.all([
      this.prisma.adFraudFlag.count({ where }),
      this.prisma.adFraudFlag.count({ where: { status: 'OPEN' } }),
      this.prisma.adFraudFlag.findMany({
        where,
        include: FLAG_INCLUDE,
        orderBy: status === 'OPEN' ? [{ level: 'desc' }, { createdAt: 'asc' }] : [{ resolvedAt: 'desc' }],
        skip: (page - 1) * take,
        take,
      }),
    ])
    return { total, openCount, data }
  }

  findFlag(flagId: string) {
    return this.prisma.adFraudFlag.findUnique({ where: { id: flagId }, include: FLAG_INCLUDE })
  }

  /** Fecha o caso (só se ainda aberto). Em qualquer resolução o anúncio que o próprio caso pausou volta: a pausa só segura até uma pessoa olhar. */
  resolveFlag(params: { flagId: string; resolution: 'CONFIRMED' | 'DISMISSED'; resolvedById: string; note: string | null; now: Date }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const flag = await tx.adFraudFlag.findUnique({ where: { id: params.flagId }, select: { adId: true, pausedAd: true } })
      if (!flag) return false
      const closed = await tx.adFraudFlag.updateMany({
        where: { id: params.flagId, status: 'OPEN' },
        data: { status: params.resolution, resolvedById: params.resolvedById, resolvedAt: params.now, resolutionNote: params.note },
      })
      if (closed.count !== 1) return false
      if (flag.pausedAd) await tx.ad.updateMany({ where: { id: flag.adId, status: 'PAUSED' }, data: { status: 'ACTIVE' } })
      return true
    })
  }

  /** Quem da empresa gerencia anúncios (dono e papéis com a permissão). */
  async findAdvertiserUserIds(companyId: string): Promise<string[]> {
    const members = await this.prisma.orgMembership.findMany({
      where: { orgType: 'COMPANY', orgId: companyId, status: 'ACTIVE', role: { permissions: { has: 'MANAGE_ADS' } } },
      select: { userId: true },
    })
    return members.map((member) => member.userId)
  }
}
