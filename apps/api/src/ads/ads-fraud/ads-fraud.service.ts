import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import * as DOMPurify from 'isomorphic-dompurify'
import type { AdFraudFlagItem, AdFraudQueueResponse, AdFraudSignal } from '@votz/shared-types'
import { NotificationsService } from '../../notifications/notifications.service'
import { dayAsDate, saoPauloDay } from '../ads-delivery/delivery-rules'
import { AdsFraudRepository, type DayFacts, type FraudFlagRecord } from './ads-fraud.repository'
import type { AdFraudResolveDto } from './dto/ads-fraud.dto'
import { IVT, judgeTraffic } from './ivt-rules'

const DAY_MS = 24 * 3600_000

export interface FraudScanRun {
  examined: number
  flagged: number
  creditedMillicents: number
  paused: number
}

/**
 * Antifraude de anúncios (plano, seção 7). De hora em hora olha hoje e ontem e, onde a taxa de cliques ou os cliques
 * sem exibição vista passam do plausível: devolve o clique inválido ao anunciante (só se cobrado por clique), abre um
 * caso na fila da moderação e, só no caso extremo, pausa o anúncio. Todo aviso ao anunciante é secundário: se falhar,
 * o crédito e o caso já valem.
 */
@Injectable()
export class AdsFraudService {
  private readonly logger = new Logger(AdsFraudService.name)

  constructor(
    private readonly repo: AdsFraudRepository,
    private readonly notifications: NotificationsService,
  ) {}

  /** De hora em hora, no minuto 20 (o fechamento do gasto roda no minuto 0). */
  @Cron('20 * * * *')
  async scheduled(): Promise<void> {
    try {
      await this.scan()
    } catch (error) {
      this.logger.error(`Varredura de tráfego inválido falhou: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async scan(now = new Date()): Promise<FraudScanRun> {
    const run: FraudScanRun = { examined: 0, flagged: 0, creditedMillicents: 0, paused: 0 }
    const days = [saoPauloDay(now), saoPauloDay(new Date(now.getTime() - DAY_MS))]
    const facts = await this.repo.candidateDays(days.map(dayAsDate), IVT.MIN_CLICKS)
    if (!facts.length) return run

    // Um dia de São Paulo vai de 00:00 a 24:00 no horário de Brasília (sem horário de verão desde 2019).
    const withoutView = new Map<string, number>()
    for (const day of days) {
      const from = new Date(`${day}T00:00:00-03:00`)
      const counts = await this.repo.clicksWithoutView(
        facts.filter((fact) => fact.day.toISOString().slice(0, 10) === day).map((fact) => fact.adId),
        from,
        new Date(from.getTime() + DAY_MS),
      )
      for (const [adId, count] of counts) withoutView.set(`${adId}:${day}`, count)
    }

    for (const fact of facts) {
      run.examined += 1
      const dayKey = fact.day.toISOString().slice(0, 10)
      const noView = withoutView.get(`${fact.adId}:${dayKey}`) ?? 0
      const verdict = judgeTraffic({ viewable: fact.viewable, clicks: fact.clicks, clicksWithoutView: noView })
      if (!verdict) continue
      // Um anúncio com problema não impede a conferência dos outros.
      try {
        const result = await this.repo.applyFinding(fact, verdict, noView)
        if (!result) continue
        run.flagged += 1
        run.creditedMillicents += result.creditedNowMillicents
        if (result.pausedNow) run.paused += 1
        if (result.created || result.pausedNow) await this.notifyAdvertiser(fact, result.creditedMillicents, result.pausedNow)
      } catch (error) {
        this.logger.error(`Tráfego inválido do anúncio ${fact.adId} (${dayKey}) não foi tratado: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return run
  }

  private async notifyAdvertiser(fact: DayFacts, creditedMillicents: number, paused: boolean) {
    try {
      const userIds = await this.repo.findAdvertiserUserIds(fact.companyId)
      await Promise.all(
        userIds.map((userId) =>
          this.notifications.notify({
            userId,
            type: 'AD_INVALID_TRAFFIC',
            metadata: { adId: fact.adId, campaignName: fact.campaignName, creditCents: Math.round(creditedMillicents / 1000), paused },
          }),
        ),
      )
    } catch (error) {
      this.logger.warn(`Não consegui avisar o anunciante do anúncio ${fact.adId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // ── Fila da moderação ────────────────────────────────────────────────────────────────────────

  async listQueue(status: 'OPEN' | 'CONFIRMED' | 'DISMISSED' = 'OPEN', page = 1, limit = 20): Promise<AdFraudQueueResponse> {
    const take = Math.min(limit, 50)
    const { total, openCount, data } = await this.repo.listFlags(status, page, take)
    return { data: data.map(toItem), meta: { total, openCount, page, limit: take, totalPages: Math.max(1, Math.ceil(total / take)) } }
  }

  async resolve(flagId: string, moderator: { id: string }, dto: AdFraudResolveDto, now = new Date()): Promise<{ id: string; resolution: 'CONFIRMED' | 'DISMISSED' }> {
    const flag = await this.repo.findFlag(flagId)
    if (!flag) throw new NotFoundException('Caso não encontrado.')
    if (flag.status !== 'OPEN') throw new ConflictException('Este caso já foi resolvido.')
    const note = dto.note ? DOMPurify.sanitize(dto.note, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).replace(/\s+/g, ' ').trim() : ''
    const ok = await this.repo.resolveFlag({ flagId, resolution: dto.resolution, resolvedById: moderator.id, note: note || null, now })
    if (!ok) throw new ConflictException('Outra pessoa da moderação resolveu este caso agora há pouco.')
    return { id: flagId, resolution: dto.resolution }
  }
}

function toItem(flag: FraudFlagRecord): AdFraudFlagItem {
  const campaign = flag.ad.adSet.campaign
  return {
    id: flag.id,
    status: flag.status,
    level: flag.level,
    day: flag.day.toISOString().slice(0, 10),
    signals: flag.signals as AdFraudSignal[],
    viewable: flag.viewable,
    clicks: flag.clicks,
    clicksWithoutView: flag.clicksWithoutView,
    invalidClicks: flag.invalidClicks,
    ctrPercent: flag.viewable > 0 ? Math.round((flag.clicks / flag.viewable) * 10_000) / 100 : null,
    creditedCents: Math.round(flag.creditedMillicents / 1000),
    pausedAd: flag.pausedAd,
    ad: { id: flag.ad.id, name: flag.ad.name, headline: flag.ad.creative.headline, status: flag.ad.status },
    campaignName: campaign.name,
    objective: campaign.objective,
    company: { id: campaign.account.company.id, name: campaign.account.company.tradeName },
    resolvedAt: flag.resolvedAt?.toISOString() ?? null,
    resolutionNote: flag.resolutionNote,
    createdAt: flag.createdAt.toISOString(),
  }
}
