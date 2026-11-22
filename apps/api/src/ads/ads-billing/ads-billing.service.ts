import { randomUUID } from 'crypto'
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AdAccount, AdTopUp } from '@prisma/client'
import {
  AD_BILLING_LIMITS,
  AD_TOPUP_METHODS,
  type AdAccountView,
  type AdBillingMode,
  type AdBillingView,
  type AdStatementLine,
  type AdTopUpMethod,
  type AdTopUpView,
} from '@votz/shared-types'
import { AdsBillingRepository } from './ads-billing.repository'
import { topUpLines } from './ledger'
import type { PaymentGateway } from './gateways/payment-gateway'
import { TestPaymentGateway } from './gateways/test-payment.gateway'
import { AsaasPaymentGateway, StripePaymentGateway } from './gateways/live-gateways'
import type { CreateAdTopUpDto } from './dto/ads-billing.dto'

const RECENT_TOPUPS = 10
const STATEMENT_LINES = 30

/**
 * Saldo pré-pago dos anúncios. O saldo da conta só muda pelo livro-caixa (`AdsBillingRepository.settleTopUp`).
 * Modo de teste (`ADS_BILLING_MODE=test`, padrão fora de produção): sem serviço externo, pagamento confirmado à mão.
 * Modo real: Asaas (Pix e boleto) e Stripe (cartão), que avisam o pagamento chamando `settleTopUp`.
 */
@Injectable()
export class AdsBillingService {
  constructor(
    private readonly repo: AdsBillingRepository,
    private readonly config: ConfigService,
    private readonly testGateway: TestPaymentGateway,
    private readonly asaas: AsaasPaymentGateway,
    private readonly stripe: StripePaymentGateway,
  ) {}

  /** `ADS_BILLING_MODE` manda; sem ele, produção é real e o resto é teste. */
  get mode(): AdBillingMode {
    const configured = this.config.get<string>('ADS_BILLING_MODE')
    if (configured === 'test' || configured === 'live') return configured
    return this.config.get<string>('NODE_ENV') === 'production' ? 'live' : 'test'
  }

  async getBilling(companyId: string, accountId: string): Promise<AdBillingView> {
    const account = await this.ownedAccount(companyId, accountId)
    await this.repo.expirePending(accountId)
    const [topUps, entries, ledgerBalance] = await Promise.all([
      this.repo.listTopUps(accountId, RECENT_TOPUPS),
      this.repo.listStatement(accountId, STATEMENT_LINES),
      this.repo.ledgerBalance(accountId),
    ])

    // O saldo depois de cada linha sai do saldo atual, andando para trás.
    let running = account.balanceCents
    const statement: AdStatementLine[] = entries.map((entry) => {
      const amountCents = entry.side === 'CREDIT' ? entry.amountCents : -entry.amountCents
      const line: AdStatementLine = {
        id: entry.id,
        type: entry.type,
        description: entry.description,
        amountCents,
        balanceAfterCents: running,
        createdAt: entry.createdAt.toISOString(),
      }
      running -= amountCents
      return line
    })

    return {
      account: toAccountView(account),
      mode: this.mode,
      methods: AD_TOPUP_METHODS.filter((method) => this.gatewayFor(method).isReady()),
      limits: { minTopUpCents: AD_BILLING_LIMITS.MIN_TOPUP_CENTS, maxTopUpCents: AD_BILLING_LIMITS.MAX_TOPUP_CENTS },
      topUps: topUps.map(toTopUpView),
      statement,
      reconciled: ledgerBalance === account.balanceCents,
    }
  }

  async createTopUp(companyId: string, accountId: string, userId: string, dto: CreateAdTopUpDto): Promise<AdTopUpView> {
    await this.ownedAccount(companyId, accountId)
    const gateway = this.gatewayFor(dto.method)
    if (!gateway.isReady()) throw new BadRequestException('Esta forma de pagamento ainda não está disponível. Escolha outra.')

    const id = randomUUID()
    const expiresAt = new Date(Date.now() + AD_BILLING_LIMITS.TOPUP_VALID_HOURS * 3600_000)
    // Se o provedor falhar, nada é gravado: não fica recarga pendurada sem cobrança.
    const charge = await gateway.createCharge({ topUpId: id, amountCents: dto.amountCents, method: dto.method, description: 'Recarga de saldo de anúncios no Votz', expiresAt })
    const topUp = await this.repo.createTopUp({
      id,
      adAccountId: accountId,
      amountCents: dto.amountCents,
      method: dto.method,
      provider: gateway.provider,
      externalId: charge.externalId,
      paymentCode: charge.paymentCode ?? null,
      checkoutUrl: charge.checkoutUrl ?? null,
      expiresAt,
      createdById: userId,
    })
    return toTopUpView(topUp)
  }

  /** Modo de teste: finge que o Pix, o boleto ou o cartão foi pago. Não existe no modo real. */
  async confirmTestTopUp(companyId: string, topUpId: string): Promise<AdTopUpView> {
    if (this.mode !== 'test') throw new ForbiddenException('A confirmação de teste só existe no modo de teste.')
    const topUp = await this.ownedTopUp(companyId, topUpId)
    if (topUp.provider !== 'TEST') throw new ForbiddenException('Só recargas de teste podem ser confirmadas assim.')
    await this.settleTopUp(topUpId)
    return toTopUpView((await this.repo.findTopUp(topUpId))!)
  }

  async cancelTopUp(companyId: string, topUpId: string): Promise<AdTopUpView> {
    const topUp = await this.ownedTopUp(companyId, topUpId)
    if (topUp.status !== 'PENDING') throw new BadRequestException('Só dá para cancelar uma recarga que ainda espera pagamento.')
    if (!(await this.repo.cancelTopUp(topUpId))) throw new ConflictException('Esta recarga mudou agora há pouco. Atualize a tela.')
    return toTopUpView((await this.repo.findTopUp(topUpId))!)
  }

  /**
   * Chamado quando um pagamento é confirmado (modo de teste agora; webhook do Asaas e da Stripe depois, sempre depois
   * de conferir a assinatura do aviso). Pode ser chamado mais de uma vez para a mesma recarga: só credita na primeira.
   */
  async settleTopUp(topUpId: string): Promise<{ credited: boolean }> {
    const result = await this.repo.settleTopUp(topUpId, topUpLines)
    if (result === null) throw new NotFoundException('Recarga não encontrada.')
    return { credited: result }
  }

  private gatewayFor(method: AdTopUpMethod): PaymentGateway {
    if (this.mode === 'test') return this.testGateway
    return method === 'CARD' ? this.stripe : this.asaas
  }

  private async ownedAccount(companyId: string, accountId: string) {
    const account = await this.repo.findAccount(accountId)
    if (!account || account.companyId !== companyId) throw new NotFoundException('Conta de anúncios não encontrada.')
    return account
  }

  private async ownedTopUp(companyId: string, topUpId: string) {
    const topUp = await this.repo.findTopUp(topUpId)
    if (!topUp || topUp.adAccount.companyId !== companyId) throw new NotFoundException('Recarga não encontrada.')
    return topUp
  }
}

function toAccountView(account: AdAccount): AdAccountView {
  return {
    id: account.id,
    companyId: account.companyId,
    name: account.name,
    currency: account.currency,
    timezone: account.timezone,
    balanceCents: account.balanceCents,
    createdAt: account.createdAt.toISOString(),
  }
}

function toTopUpView(topUp: AdTopUp): AdTopUpView {
  return {
    id: topUp.id,
    amountCents: topUp.amountCents,
    method: topUp.method,
    status: topUp.status,
    paymentCode: topUp.paymentCode,
    checkoutUrl: topUp.checkoutUrl,
    expiresAt: topUp.expiresAt.toISOString(),
    paidAt: topUp.paidAt?.toISOString() ?? null,
    createdAt: topUp.createdAt.toISOString(),
  }
}
