import type { AdPaymentProvider, AdTopUpMethod } from '@prisma/client'

export interface ChargeRequest {
  topUpId: string
  amountCents: number
  method: AdTopUpMethod
  description: string
  expiresAt: Date
}

export interface ChargeResult {
  /** Identificador da cobrança no provedor. */
  externalId: string
  /** Pix copia e cola ou linha digitável do boleto. */
  paymentCode?: string | null
  /** Link da página de pagamento (cartão). */
  checkoutUrl?: string | null
}

/**
 * Um provedor de pagamento. A tela e o livro-caixa não sabem qual é: só pedem a cobrança e, quando o provedor avisa
 * que foi paga, chamam `AdsBillingService.settleTopUp`. Asaas e Stripe entram aqui sem mudar mais nada.
 */
export interface PaymentGateway {
  readonly provider: AdPaymentProvider
  /** Está configurado e implementado? Só então a forma de pagamento aparece para o anunciante. */
  isReady(): boolean
  createCharge(request: ChargeRequest): Promise<ChargeResult>
}
