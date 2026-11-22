import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import type { ChargeRequest, ChargeResult, PaymentGateway } from './payment-gateway'

/**
 * Asaas (Pix e boleto). O caminho está pronto: falta a conta do dono (chave de API e segredo do webhook) e trocar
 * este corpo pela chamada de `POST /v3/payments`. Quando o webhook de pagamento chegar, ele chama `settleTopUp`.
 * Enquanto não for implementado, `isReady()` é falso e Pix e boleto não aparecem no modo real.
 */
@Injectable()
export class AsaasPaymentGateway implements PaymentGateway {
  readonly provider = 'ASAAS' as const

  isReady(): boolean {
    return false
  }

  async createCharge(_request: ChargeRequest): Promise<ChargeResult> {
    throw new ServiceUnavailableException('Pagamento por Pix e boleto ainda não está ligado.')
  }
}

/** Stripe (cartão). Mesma situação do Asaas: falta a conta do dono e a chamada de Checkout. */
@Injectable()
export class StripePaymentGateway implements PaymentGateway {
  readonly provider = 'STRIPE' as const

  isReady(): boolean {
    return false
  }

  async createCharge(_request: ChargeRequest): Promise<ChargeResult> {
    throw new ServiceUnavailableException('Pagamento por cartão ainda não está ligado.')
  }
}
