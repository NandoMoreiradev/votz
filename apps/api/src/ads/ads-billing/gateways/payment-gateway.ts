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
  /**
   * Recarga automática: cobra na hora o cartão salvo (referência do provedor, nunca o número). Devolve `paid: true` se o
   * provedor aprovou. Quem não faz cobrança sem a pessoa presente não implementa e a recarga automática fica indisponível.
   */
  chargeSavedMethod?(request: ChargeRequest & { paymentMethodRef: string }): Promise<ChargeResult & { paid: boolean }>
  /** Há cartão salvo para cobrar sozinho? */
  supportsSavedMethod?(): boolean
}
