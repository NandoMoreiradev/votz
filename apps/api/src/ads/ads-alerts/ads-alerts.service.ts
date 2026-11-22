import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { NotificationsService } from '../../notifications/notifications.service'
import { AdsAlertsRepository } from './ads-alerts.repository'
import { availableCents, isLowBalance } from './balance-rules'

export interface AdsAlertsRun {
  pausedNotices: number
  lowBalanceNotices: number
  lowBalanceReset: number
}

/**
 * Avisos de saldo ao anunciante (sino do site):
 * - **Campanha pausada:** o saldo acabou e as campanhas ligadas pararam. Um aviso por pausa.
 * - **Saldo baixo:** o que sobra dura menos de um dia do orçamento. Um aviso por vez que isso acontece; só avisa de novo
 *   depois que o saldo se recuperar (recarga) e cair outra vez.
 * Se o aviso falhar, nada do dinheiro é afetado: o anunciante ainda vê o saldo na tela de Faturamento.
 */
@Injectable()
export class AdsAlertsService {
  private readonly logger = new Logger(AdsAlertsService.name)

  constructor(
    private readonly repo: AdsAlertsRepository,
    private readonly notifications: NotificationsService,
  ) {}

  /** A cada 10 minutos. Pode rodar em mais de uma instância: o aviso só sai para quem trocar o carimbo primeiro. */
  @Cron('*/10 * * * *')
  async scheduled(): Promise<void> {
    try {
      await this.run()
    } catch (error) {
      this.logger.error(`Avisos de saldo dos anúncios falharam: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async run(now = new Date()): Promise<AdsAlertsRun> {
    const result: AdsAlertsRun = { pausedNotices: 0, lowBalanceNotices: 0, lowBalanceReset: 0 }

    for (const account of await this.repo.accountsPausedWithoutNotice()) {
      // Cada conta no seu try: uma com problema não impede o aviso das outras.
      try {
        if (!(await this.repo.claimPausedNotice(account.id, account.pausedAlertSentAt, now))) continue
        await this.notify(account.companyId, 'AD_PAUSED_NO_BALANCE', { accountId: account.id, accountName: account.name })
        result.pausedNotices += 1
      } catch (error) {
        this.logger.warn(`Aviso de pausa da conta ${account.id} falhou: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    for (const account of await this.repo.accountsForLowBalanceCheck(now)) {
      try {
        const dailyBudgetsCents = account.campaigns.flatMap((campaign) => campaign.adSets.map((set) => set.dailyBudgetCents))
        const low = isLowBalance({ balanceCents: account.balanceCents, pendingSpendMillicents: account.pendingSpendMillicents, dailyBudgetsCents })
        if (low && !account.lowBalanceAlertedAt) {
          if (!(await this.repo.claimLowBalanceNotice(account.id, now))) continue
          await this.notify(account.companyId, 'AD_LOW_BALANCE', {
            accountId: account.id,
            accountName: account.name,
            availableCents: Math.max(availableCents(account), 0),
          })
          result.lowBalanceNotices += 1
        } else if (!low && account.lowBalanceAlertedAt) {
          await this.repo.resetLowBalanceNotice(account.id)
          result.lowBalanceReset += 1
        }
      } catch (error) {
        this.logger.warn(`Aviso de saldo baixo da conta ${account.id} falhou: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return result
  }

  private async notify(companyId: string, type: 'AD_LOW_BALANCE' | 'AD_PAUSED_NO_BALANCE', metadata: Record<string, unknown>) {
    const userIds = await this.repo.findAdvertiserUserIds(companyId)
    await Promise.all(userIds.map((userId) => this.notifications.notify({ userId, type, metadata })))
  }
}
