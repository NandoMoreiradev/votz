import { Injectable } from '@nestjs/common'
import type { AdChargeOn, AdEventStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { AdsBillingRepository } from '../ads-billing/ads-billing.repository'
import { spendLines } from '../ads-billing/ledger'
import { CREATIVE_WITH_MEDIA } from '../ad-creative-media'
import { dayAsDate, splitSpend } from './delivery-rules'

/** A cada quanto gasto (em millicents) o fechamento lança no livro-caixa: R$ 1,00. O resto fecha de hora em hora. */
export const SETTLE_THRESHOLD_MILLICENTS = 100_000

const CANDIDATE_INCLUDE = {
  creative: CREATIVE_WITH_MEDIA,
  adSet: {
    include: {
      campaign: {
        include: {
          account: { select: { id: true, balanceCents: true, pendingSpendMillicents: true, companyId: true, company: { select: { id: true, tradeName: true, username: true, logoUrl: true } } } },
        },
      },
    },
  },
} satisfies Prisma.AdInclude

export type AdCandidateRecord = Prisma.AdGetPayload<{ include: typeof CANDIDATE_INCLUDE }>

/** Contagem de um anúncio nos últimos dias (nada de pessoa). */
export interface AdStats {
  impressions: number
  viewable: number
  clicks: number
  hides: number
  reports: number
}

/** Uma decisão do modo sombra. */
export interface ShadowDecisionRow {
  experiment: string
  arm: string
  servedAdId: string | null
  shadowAdId: string | null
  agreed: boolean
  /** Valor por mil exibições (centavos) do que cada caminho escolheu. */
  servedEcpmCents: number | null
  shadowEcpmCents: number | null
}

/** Contagem de todos os anúncios de uma empresa nos últimos dias. */
export interface AdvertiserStats {
  impressions: number
  hides: number
  reports: number
}

export interface EventEffect {
  eventId: string
  impressionId: string
  adId: string
  adSetId: string
  accountId: string
  companyId: string
  userId: string
  type: 'IMPRESSION' | 'VIEWABLE_IMPRESSION' | 'CLICK' | 'HIDE' | 'HIDE_ADVERTISER' | 'REPORT'
  occurredAt: Date
  visibleMs: number | null
  status: AdEventStatus
  reason: string | null
  now: Date
  day: string
}

/**
 * Só tabelas de anúncio, as colunas liberadas de `users` (cidade, estado, nascimento, gênero) e o cadastro da empresa.
 * Nada de relatos, votos ou atividade política (teste do muro). O saldo só muda por `AdsBillingRepository.postLedger`.
 */
@Injectable()
export class AdsDeliveryRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: AdsBillingRepository,
  ) {}

  // ── Entrega ──────────────────────────────────────────────────────────────────────────────────

  findViewerFacts(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { city: true, state: true, birthDate: true, gender: true, adPreference: { select: { personalizationConsent: true, interests: true } } },
    })
  }

  async hiddenCompanyIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.adHiddenAdvertiser.findMany({ where: { userId }, select: { companyId: true } })
    return rows.map((row) => row.companyId)
  }

  /** Anúncios que a pessoa escondeu (em qualquer época). Para a cópia da pessoa no Redis. */
  async hiddenAdIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.adImpression.findMany({ where: { userId, hiddenAt: { not: null } }, select: { adId: true }, distinct: ['adId'] })
    return rows.map((row) => row.adId)
  }

  /** Exibições de cada anúncio para a pessoa desde `since`. Para a cópia da pessoa no Redis. */
  async impressionCounts(userId: string, since: Date): Promise<Map<string, number>> {
    const rows = await this.prisma.adImpression.groupBy({ by: ['adId'], where: { userId, servedAt: { gte: since } }, _count: { _all: true } })
    return new Map(rows.map((row) => [row.adId, row._count._all]))
  }

  /** Anúncios que a pessoa escondeu, ou que já passaram do limite de exibições nas últimas 24 horas. */
  async excludedAdIds(userId: string, since: Date, maxPerDay: number): Promise<string[]> {
    const [hidden, counts] = await Promise.all([
      this.prisma.adImpression.findMany({ where: { userId, hiddenAt: { not: null } }, select: { adId: true }, distinct: ['adId'] }),
      this.prisma.adImpression.groupBy({ by: ['adId'], where: { userId, servedAt: { gte: since } }, _count: { _all: true } }),
    ])
    return [...new Set([...hidden.map((row) => row.adId), ...counts.filter((row) => row._count._all >= maxPerDay).map((row) => row.adId)])]
  }

  findCandidates(now: Date, excludeCompanyIds: string[], excludeAdIds: string[], take: number): Promise<AdCandidateRecord[]> {
    return this.prisma.ad.findMany({
      where: {
        reviewStatus: 'APPROVED',
        status: { notIn: ['PAUSED', 'ARCHIVED'] },
        id: { notIn: excludeAdIds },
        // Anúncio com mídia só roda depois de toda foto e vídeo ficarem prontos ("every" vale também para anúncio só de texto): nunca mostramos "preparando" no feed de ninguém.
        creative: { media: { every: { status: 'READY' } } },
        adSet: {
          status: { notIn: ['PAUSED', 'ARCHIVED'] },
          startAt: { lte: now },
          OR: [{ endAt: null }, { endAt: { gt: now } }],
          campaign: { status: 'ACTIVE', account: { balanceCents: { gt: 0 }, companyId: { notIn: excludeCompanyIds } } },
        },
      },
      include: CANDIDATE_INCLUDE,
      take,
    })
  }

  /** Gasto de hoje por conjunto (millicents), para respeitar o orçamento diário. */
  async spentTodayByAdSet(adSetIds: string[], day: string): Promise<Map<string, number>> {
    if (!adSetIds.length) return new Map()
    const rows = await this.prisma.adDailyStat.groupBy({ by: ['adSetId'], where: { adSetId: { in: adSetIds }, day: dayAsDate(day) }, _sum: { spendMillicents: true } })
    return new Map(rows.map((row) => [row.adSetId, row._sum.spendMillicents ?? 0]))
  }

  /** Exibições, exibições vistas, cliques, "esconder" e denúncias por anúncio desde `since` (chance de clique e qualidade). Só contagem, nada de pessoa. */
  async clickStatsByAd(adIds: string[], since: Date): Promise<Map<string, AdStats>> {
    if (!adIds.length) return new Map()
    const rows = await this.prisma.adDailyStat.groupBy({ by: ['adId'], where: { adId: { in: adIds }, day: { gte: since } }, _sum: { impressions: true, viewableImpressions: true, clicks: true, hides: true, reports: true } })
    return new Map(rows.map((row) => [row.adId, { impressions: row._sum.impressions ?? 0, viewable: row._sum.viewableImpressions ?? 0, clicks: row._sum.clicks ?? 0, hides: row._sum.hides ?? 0, reports: row._sum.reports ?? 0 }]))
  }

  /**
   * Exibições, "esconder" e denúncias somados por empresa (todos os anúncios dela) desde `since`: a qualidade do anunciante,
   * que vira o ponto de partida dos anúncios novos dele. Só contagem; nada de pessoa.
   */
  async advertiserStats(companyIds: string[], since: Date): Promise<Map<string, AdvertiserStats>> {
    if (!companyIds.length) return new Map()
    const ads = await this.prisma.ad.findMany({
      where: { adSet: { campaign: { account: { companyId: { in: companyIds } } } } },
      select: { id: true, adSet: { select: { campaign: { select: { account: { select: { companyId: true } } } } } } },
    })
    const companyOf = new Map(ads.map((ad) => [ad.id, ad.adSet.campaign.account.companyId]))
    if (!companyOf.size) return new Map()
    const rows = await this.prisma.adDailyStat.groupBy({ by: ['adId'], where: { adId: { in: [...companyOf.keys()] }, day: { gte: since } }, _sum: { impressions: true, hides: true, reports: true } })
    const totals = new Map<string, AdvertiserStats>()
    for (const row of rows) {
      const companyId = companyOf.get(row.adId)
      if (!companyId) continue
      const current = totals.get(companyId) ?? { impressions: 0, hides: 0, reports: 0 }
      totals.set(companyId, { impressions: current.impressions + (row._sum.impressions ?? 0), hides: current.hides + (row._sum.hides ?? 0), reports: current.reports + (row._sum.reports ?? 0) })
    }
    return totals
  }

  /** Exibições vistas e cliques de toda a plataforma desde `since`: de onde vem a chance de partida dos anúncios novos. */
  async platformClickStats(since: Date): Promise<{ viewable: number; clicks: number }> {
    const total = await this.prisma.adDailyStat.aggregate({ where: { day: { gte: since } }, _sum: { viewableImpressions: true, clicks: true } })
    return { viewable: total._sum.viewableImpressions ?? 0, clicks: total._sum.clicks ?? 0 }
  }

  /** Grava a entrega e conta a exibição do dia, juntas. */
  createImpression(data: { adId: string; adSetId: string; userId: string; surface: string; position: number; chargeOn: AdChargeOn; chargeMillicents: number; clickToken: string; day: string; experiment?: string | null }) {
    const { adSetId, day, ...impression } = data
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.adImpression.create({ data: impression })
      await tx.adDailyStat.upsert({
        where: { adId_day: { adId: data.adId, day: dayAsDate(day) } },
        create: { adId: data.adId, adSetId, day: dayAsDate(day), impressions: 1 },
        update: { impressions: { increment: 1 } },
      })
      return created
    })
  }

  /** Grava o que cada braço de teste teria escolhido (modo sombra). Sem pessoa, sem efeito para ninguém. */
  createShadowDecisions(rows: ShadowDecisionRow[]) {
    return this.prisma.adShadowDecision.createMany({ data: rows })
  }

  // ── Eventos ──────────────────────────────────────────────────────────────────────────────────

  findImpression(impressionId: string) {
    return this.prisma.adImpression.findUnique({
      where: { id: impressionId },
      include: { ad: { select: { id: true, adSetId: true, adSet: { select: { campaign: { select: { accountId: true, account: { select: { companyId: true } } } } } } } } },
    })
  }

  /** Cliques já cobrados da pessoa neste anúncio desde `since` (limite do antifraude). */
  countClicks(userId: string, adId: string, since: Date) {
    return this.prisma.adImpression.count({ where: { userId, adId, clickedAt: { gte: since } } })
  }

  /**
   * Aplica um evento de uma vez só (transação): grava o evento, atualiza as contagens do dia e, se houver cobrança,
   * soma o gasto na conta. Devolve `false` se o `eventId` já tinha sido recebido (nada é aplicado de novo).
   * Cada carimbo (visível, clique, esconder) só passa de nulo para data uma vez, e só quem passa cobra.
   */
  applyEvent(effect: EventEffect): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const day = dayAsDate(effect.day)
      const stat = (data: Prisma.AdDailyStatUpdateInput) =>
        tx.adDailyStat.upsert({
          where: { adId_day: { adId: effect.adId, day } },
          create: { adId: effect.adId, adSetId: effect.adSetId, day },
          update: data,
        })

      const stored = await tx.adEvent.createMany({
        data: [{ eventId: effect.eventId, impressionId: effect.impressionId, adId: effect.adId, type: effect.type, status: effect.status, reason: effect.reason, visibleMs: effect.visibleMs, occurredAt: effect.occurredAt }],
        skipDuplicates: true,
      })
      if (stored.count === 0) return false

      if (effect.status === 'INVALID') {
        await stat({ invalidEvents: { increment: 1 } })
        return true
      }

      const stamp = async (field: 'viewableAt' | 'clickedAt' | 'hiddenAt' | 'reportedAt') => {
        const moved = await tx.adImpression.updateMany({ where: { id: effect.impressionId, [field]: null }, data: { [field]: effect.now } })
        return moved.count === 1
      }

      if (effect.type === 'VIEWABLE_IMPRESSION' && (await stamp('viewableAt'))) {
        await stat({ viewableImpressions: { increment: 1 } })
        const impression = await tx.adImpression.findUniqueOrThrow({ where: { id: effect.impressionId }, select: { chargeOn: true, chargeMillicents: true } })
        if (impression.chargeOn === 'VIEWABLE_IMPRESSION') await this.charge(tx, effect, impression.chargeMillicents, stat)
      } else if (effect.type === 'CLICK' && (await stamp('clickedAt'))) {
        await stat({ clicks: { increment: 1 } })
        const impression = await tx.adImpression.findUniqueOrThrow({ where: { id: effect.impressionId }, select: { chargeOn: true, chargeMillicents: true } })
        if (impression.chargeOn === 'CLICK') await this.charge(tx, effect, impression.chargeMillicents, stat)
      } else if (effect.type === 'REPORT') {
        // Denúncia conta uma vez por pessoa e anúncio no dia, e só de quem viu o anúncio: um concorrente não derruba o outro
        // denunciando em massa o que nunca viu, nem repetindo a mesma denúncia.
        if (await stamp('reportedAt')) {
          const dayAgo = new Date(effect.now.getTime() - 24 * 3600_000)
          const [mine, seen] = await Promise.all([
            tx.adImpression.count({ where: { userId: effect.userId, adId: effect.adId, reportedAt: { gte: dayAgo } } }),
            tx.adImpression.count({ where: { id: effect.impressionId, viewableAt: { not: null } } }),
          ])
          if (mine === 1 && seen === 1) await stat({ reports: { increment: 1 } })
        }
      } else if (effect.type === 'HIDE' || effect.type === 'HIDE_ADVERTISER') {
        if (await stamp('hiddenAt')) await stat({ hides: { increment: 1 } })
        // "Esconder todos desta empresa" vale mesmo se a pessoa já tinha escondido só este anúncio.
        if (effect.type === 'HIDE_ADVERTISER') {
          await tx.adHiddenAdvertiser.upsert({
            where: { userId_companyId: { userId: effect.userId, companyId: effect.companyId } },
            create: { userId: effect.userId, companyId: effect.companyId },
            update: {},
          })
        }
      }
      return true
    })
  }

  /** Soma o gasto na conta e fecha no livro-caixa quando juntar R$ 1,00. Sem saldo, as campanhas da conta pausam. */
  private async charge(tx: Prisma.TransactionClient, effect: EventEffect, millicents: number, stat: (data: Prisma.AdDailyStatUpdateInput) => Promise<unknown>) {
    await stat({ spendMillicents: { increment: millicents } })
    const account = await tx.adAccount.update({
      where: { id: effect.accountId },
      data: { pendingSpendMillicents: { increment: millicents } },
      select: { id: true, balanceCents: true, pendingSpendMillicents: true },
    })
    if (account.pendingSpendMillicents >= SETTLE_THRESHOLD_MILLICENTS) await this.settleSpend(tx, account.id)
    else await this.pauseIfBroke(tx, account.id)
  }

  /** Passa o gasto acumulado (só centavos inteiros) para o livro-caixa. O que passar do saldo é absorvido pelo Votz. */
  private async settleSpend(tx: Prisma.TransactionClient, accountId: string) {
    const account = await tx.adAccount.findUniqueOrThrow({ where: { id: accountId }, select: { balanceCents: true, pendingSpendMillicents: true } })
    const { cents, remainderMillicents } = splitSpend(account.pendingSpendMillicents)
    if (cents <= 0) return this.pauseIfBroke(tx, accountId)
    const debit = Math.min(cents, Math.max(account.balanceCents, 0))
    if (debit > 0) await this.billing.postLedger(tx, { adAccountId: accountId, type: 'SPEND', description: 'Gasto com anúncios', lines: spendLines(debit) })
    await tx.adAccount.update({ where: { id: accountId }, data: { pendingSpendMillicents: remainderMillicents } })
    await this.pauseIfBroke(tx, accountId)
  }

  /** O saldo disponível é o saldo menos o gasto ainda não lançado. Chegou a zero: pausa as campanhas ligadas. */
  private async pauseIfBroke(tx: Prisma.TransactionClient, accountId: string) {
    const account = await tx.adAccount.findUniqueOrThrow({ where: { id: accountId }, select: { balanceCents: true, pendingSpendMillicents: true } })
    if (account.balanceCents * 1000 - account.pendingSpendMillicents > 0) return
    const paused = await tx.adCampaign.updateMany({ where: { accountId, status: 'ACTIVE' }, data: { status: 'PAUSED' } })
    // Marca a pausa na mesma transação: o aviso ao anunciante sai depois (AdsAlertsService), uma vez por pausa.
    if (paused.count > 0) await tx.adAccount.update({ where: { id: accountId }, data: { pausedForBalanceAt: new Date() } })
  }

  // ── Fechamento de hora em hora ───────────────────────────────────────────────────────────────

  accountsWithPendingSpend() {
    return this.prisma.adAccount.findMany({ where: { pendingSpendMillicents: { gte: 1000 } }, select: { id: true } })
  }

  closeSpend(accountId: string) {
    return this.prisma.$transaction((tx) => this.settleSpend(tx, accountId))
  }

  // ── Relatório ────────────────────────────────────────────────────────────────────────────────

  findAccount(accountId: string) {
    return this.prisma.adAccount.findUnique({ where: { id: accountId }, select: { id: true, companyId: true } })
  }

  /** Contagem diária somada dos anúncios da conta. */
  async listAccountDailyStats(accountId: string, since: Date) {
    return this.prisma.adDailyStat.groupBy({
      by: ['day'],
      where: { day: { gte: since }, ad: { adSet: { campaign: { accountId } } } },
      _sum: { impressions: true, viewableImpressions: true, clicks: true, hides: true, spendMillicents: true, conversions: true, conversionValueCents: true },
      orderBy: { day: 'asc' },
    })
  }
}
