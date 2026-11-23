import { randomUUID } from 'crypto'
import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { AD_BILLING_LIMITS, type AdAutoTopUpView, type SetAdAutoTopUpInput } from '@votz/shared-types'
import { AdvertiserNotifier } from './advertiser-notifier'
import { AdsAutoTopUpRepository } from './ads-auto-topup.repository'
import { AdsBillingRepository } from './ads-billing.repository'
import { AdsBillingService } from './ads-billing.service'
import { autoTopUpProblem, autoTopUpView, decideAutoTopUp, saoPauloMonth } from './billing-rules'

export interface AutoTopUpRun {
  charged: number
  stopped: number
  failed: number
}

/** Referência do cartão do modo de teste (o modo real usa a referência que o provedor devolve ao salvar o cartão). */
const TEST_CARD_REF = 'test_card'

/**
 * Recarga automática: quando o saldo disponível cai abaixo do piso e há campanha ligada, o Votz cobra o cartão salvo e soma
 * o valor ao saldo, dentro de um teto mensal. Regras que protegem o dinheiro do anunciante:
 * - só liga com aceite explícito, e o aceite fica gravado (quem e quando);
 * - nunca passa do teto do mês, e no máximo uma cobrança por hora por conta;
 * - desliga sozinha depois de 3 falhas seguidas ou ao bater o teto, e **avisa o anunciante**;
 * - só uma instância cobra por vez (carimbo atômico), mesmo com a tarefa rodando em várias.
 * Guarda só a referência do cartão no provedor, nunca o número.
 */
@Injectable()
export class AdsAutoTopUpService {
  private readonly logger = new Logger(AdsAutoTopUpService.name)

  constructor(
    private readonly repo: AdsAutoTopUpRepository,
    private readonly billingRepo: AdsBillingRepository,
    private readonly billing: AdsBillingService,
    private readonly notifier: AdvertiserNotifier,
  ) {}

  async get(companyId: string, accountId: string, now = new Date()): Promise<AdAutoTopUpView | null> {
    await this.ownedAccount(companyId, accountId)
    return this.viewOf(accountId, now)
  }

  async viewOf(accountId: string, now = new Date()): Promise<AdAutoTopUpView | null> {
    const row = await this.repo.find(accountId)
    if (!row) return null
    return autoTopUpView(row, await this.repo.usedInMonth(accountId, saoPauloMonth(now)))
  }

  async set(companyId: string, accountId: string, userId: string, input: SetAdAutoTopUpInput, now = new Date()): Promise<AdAutoTopUpView> {
    await this.ownedAccount(companyId, accountId)
    if (!input.enabled) {
      await this.repo.disable(accountId)
      return (await this.viewOf(accountId, now)) as AdAutoTopUpView
    }
    const problem = autoTopUpProblem(input, { minTopUpCents: AD_BILLING_LIMITS.MIN_TOPUP_CENTS, maxTopUpCents: AD_BILLING_LIMITS.MAX_TOPUP_CENTS })
    if (problem) throw new BadRequestException(problem)
    const gateway = this.billing.savedMethodGateway()
    if (!gateway) throw new ServiceUnavailableException('A recarga automática ainda não está disponível.')

    const existing = await this.repo.find(accountId)
    await this.repo.upsert(accountId, {
      enabled: true,
      thresholdCents: input.thresholdCents,
      amountCents: input.amountCents,
      monthlyLimitCents: input.monthlyLimitCents,
      provider: gateway.provider,
      // No modo real, a referência vem de salvar o cartão no provedor (fluxo da conta Stripe do dono). No de teste é fixa.
      paymentMethodRef: gateway.provider === 'TEST' ? TEST_CARD_REF : (existing?.paymentMethodRef ?? null),
      consentAt: now,
      consentById: userId,
    })
    return (await this.viewOf(accountId, now)) as AdAutoTopUpView
  }

  /** A cada 5 minutos. Roda em mais de uma instância sem cobrar duas vezes (veja `claim`). */
  @Cron('*/5 * * * *')
  async scheduled(): Promise<void> {
    try {
      await this.run()
    } catch (error) {
      this.logger.error(`Recarga automática dos anúncios falhou: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async run(now = new Date()): Promise<AutoTopUpRun> {
    const result: AutoTopUpRun = { charged: 0, stopped: 0, failed: 0 }
    const month = saoPauloMonth(now)
    for (const config of await this.repo.listEnabled()) {
      // Cada conta no seu try: uma com problema não impede as outras.
      try {
        const account = config.adAccount
        const decision = decideAutoTopUp(
          {
            enabled: config.enabled,
            thresholdCents: config.thresholdCents,
            amountCents: config.amountCents,
            monthlyLimitCents: config.monthlyLimitCents,
            usedThisMonthCents: await this.repo.usedInMonth(account.id, month),
            balanceCents: account.balanceCents,
            pendingSpendMillicents: account.pendingSpendMillicents,
            hasPaymentMethod: !!config.paymentMethodRef,
            consecutiveFailures: config.consecutiveFailures,
            lastTriggeredAt: config.lastTriggeredAt,
            hasPendingAutoTopUp: await this.repo.hasPendingAuto(account.id),
            hasActiveCampaign: account._count.campaigns > 0,
          },
          now,
        )
        if (decision.action === 'SKIP') continue
        if (decision.action === 'STOP') {
          await this.stop(account.companyId, account.id, account.name, decision.reason)
          result.stopped += 1
          continue
        }
        if (!(await this.repo.claim(account.id, config.lastTriggeredAt, now))) continue
        if (await this.charge(config, account, now)) result.charged += 1
        else result.failed += 1
      } catch (error) {
        this.logger.warn(`Recarga automática da conta ${config.adAccountId} falhou: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return result
  }

  /** Faz a cobrança. Falha do provedor conta como tentativa; na terceira seguida a recarga automática desliga. */
  private async charge(
    config: { adAccountId: string; amountCents: number; paymentMethodRef: string | null; consentById: string | null },
    account: { id: string; name: string; companyId: string },
    now: Date,
  ): Promise<boolean> {
    const gateway = this.billing.savedMethodGateway()
    if (!gateway?.chargeSavedMethod || !config.paymentMethodRef) {
      await this.stop(account.companyId, account.id, account.name, 'O cartão salvo não está disponível para cobrar.')
      return false
    }
    const topUpId = randomUUID()
    try {
      const charge = await gateway.chargeSavedMethod({
        topUpId,
        amountCents: config.amountCents,
        method: 'CARD',
        description: 'Recarga automática de saldo de anúncios no Votz',
        expiresAt: new Date(now.getTime() + AD_BILLING_LIMITS.TOPUP_VALID_HOURS * 3600_000),
        paymentMethodRef: config.paymentMethodRef,
      })
      // A recarga é gravada só depois da cobrança aprovada: falha do provedor não deixa pedido pendurado.
      await this.billingRepo.createTopUp({
        id: topUpId,
        adAccountId: account.id,
        amountCents: config.amountCents,
        method: 'CARD',
        provider: gateway.provider,
        externalId: charge.externalId,
        paymentCode: null,
        checkoutUrl: null,
        expiresAt: new Date(now.getTime() + AD_BILLING_LIMITS.TOPUP_VALID_HOURS * 3600_000),
        createdById: config.consentById ?? 'system',
        auto: true,
      })
      if (charge.paid) await this.billing.settleTopUp(topUpId)
      await this.repo.resetFailures(account.id)
      return true
    } catch (error) {
      this.logger.warn(`Cobrança automática da conta ${account.id} não passou: ${error instanceof Error ? error.message : String(error)}`)
      const failures = await this.repo.recordFailure(account.id)
      if (failures >= 3) await this.stop(account.companyId, account.id, account.name, `A cobrança falhou ${failures} vezes seguidas. Confira o cartão e ligue de novo.`)
      return false
    }
  }

  private async stop(companyId: string, accountId: string, accountName: string, reason: string): Promise<void> {
    await this.repo.stop(accountId, reason)
    await this.notifier.notify(companyId, 'AD_AUTO_TOPUP_STOPPED', { accountId, accountName, reason })
  }

  private async ownedAccount(companyId: string, accountId: string) {
    const account = await this.billingRepo.findAccount(accountId)
    if (!account || account.companyId !== companyId) throw new NotFoundException('Conta de anúncios não encontrada.')
    return account
  }
}
