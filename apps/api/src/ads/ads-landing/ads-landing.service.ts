import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Queue } from 'bullmq'
import { NotificationsService } from '../../notifications/notifications.service'
import { AdsLandingRepository } from './ads-landing.repository'
import { LandingFetcher } from './landing-fetcher'
import { LANDING, actionAfterCheck, type LandingStatus } from './landing-rules'

export const ADS_LANDING_QUEUE = 'ads-landing'
export type LandingTrigger = 'SUBMIT' | 'WEEKLY' | 'RETRY'
export type LandingOutcome = 'skipped' | 'recorded' | 'retry-scheduled' | 'paused'

const HOUR_MS = 3600_000
const DAY_MS = 24 * HOUR_MS

/**
 * Confere a página para onde o botão do anúncio leva (plano, seção 5.3):
 * - **Ao enviar:** só registra o resultado, que a moderação vê ao lado do anúncio (um site fora do ar por um minuto não
 *   deve barrar ninguém).
 * - **Toda semana, nos anúncios no ar:** página bloqueada pausa a campanha na hora; página que não abre é conferida
 *   de novo em 6 horas e, se falhar outra vez, pausa a campanha e avisa o anunciante (ele paga clique para uma página
 *   morta). O anunciante religa a campanha depois de consertar.
 */
@Injectable()
export class AdsLandingService {
  private readonly logger = new Logger(AdsLandingService.name)

  constructor(
    @InjectQueue(ADS_LANDING_QUEUE) private readonly queue: Queue,
    private readonly repo: AdsLandingRepository,
    private readonly fetcher: LandingFetcher,
    private readonly notifications: NotificationsService,
  ) {}

  /** Põe a conferência na fila. Nunca lança: falhar aqui não pode impedir o envio do anúncio. */
  async enqueue(adId: string, trigger: LandingTrigger, delayMs = 0): Promise<void> {
    try {
      await this.queue.add('check', { adId, trigger }, { delay: delayMs, attempts: 2, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: true, removeOnFail: 100 })
    } catch (error) {
      this.logger.warn(`Não foi possível enfileirar a conferência da página do anúncio ${adId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Todo dia às 4h: enfileira os anúncios no ar que estão há 7 dias (ou mais) sem conferência. */
  @Cron('0 4 * * *')
  async scheduleWeekly(now = new Date()): Promise<number> {
    try {
      const due = await this.repo.dueForRecheck(new Date(now.getTime() - LANDING.RECHECK_DAYS * DAY_MS), 500)
      await Promise.all(due.map((adId) => this.enqueue(adId, 'WEEKLY')))
      return due.length
    } catch (error) {
      this.logger.error(`Agendamento das conferências de página falhou: ${error instanceof Error ? error.message : String(error)}`)
      return 0
    }
  }

  /** Chamado pelo processador da fila. */
  async check(adId: string, trigger: LandingTrigger, now = new Date()): Promise<LandingOutcome> {
    const ad = await this.repo.findAdForCheck(adId)
    if (!ad) return 'skipped'

    const result = await this.fetcher.fetch(ad.creative.destinationUrl)
    const previous = await this.repo.previousCheck(adId, now)
    await this.repo.saveCheck(adId, trigger, result, now)
    if (trigger === 'SUBMIT') return 'recorded'

    // Só quem está no ar sofre consequência: anúncio parado ou campanha desligada só tem o registro.
    const campaign = ad.adSet.campaign
    const live = ad.reviewStatus === 'APPROVED' && ad.status !== 'PAUSED' && ad.status !== 'ARCHIVED' && campaign.status === 'ACTIVE'
    if (!live) return 'recorded'

    const action = actionAfterCheck(result.status, (previous?.status as LandingStatus | undefined) ?? null)
    if (action === 'NONE') return 'recorded'
    if (action === 'RETRY_LATER') {
      await this.enqueue(adId, 'RETRY', LANDING.RETRY_AFTER_HOURS * HOUR_MS)
      return 'retry-scheduled'
    }

    const paused = await this.repo.pauseCampaign(campaign.id)
    if (paused) await this.notifyAdvertiser(campaign.account.companyId, { adId, campaignName: campaign.name, status: result.status, host: result.finalHost })
    return paused ? 'paused' : 'recorded'
  }

  /** O aviso é secundário: a campanha já foi pausada e o resultado já está gravado. */
  private async notifyAdvertiser(companyId: string, info: { adId: string; campaignName: string; status: LandingStatus; host: string | null }) {
    try {
      const userIds = await this.repo.findAdvertiserUserIds(companyId)
      await Promise.all(userIds.map((userId) => this.notifications.notify({ userId, type: 'AD_LANDING_PAGE', metadata: info })))
    } catch (error) {
      this.logger.warn(`Não consegui avisar o anunciante da página do anúncio ${info.adId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
