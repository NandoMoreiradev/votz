import { Injectable } from '@nestjs/common'
import type { ChargeRequest, ChargeResult, PaymentGateway } from './payment-gateway'

/**
 * Modo de teste local: não chama nenhum serviço externo. Devolve um código falso e o pagamento é "confirmado" por
 * `POST .../topups/:id/confirm-test`, que só existe com `ADS_BILLING_MODE=test`.
 */
@Injectable()
export class TestPaymentGateway implements PaymentGateway {
  readonly provider = 'TEST' as const

  isReady(): boolean {
    return true
  }

  async createCharge(request: ChargeRequest): Promise<ChargeResult> {
    const externalId = `test_${request.topUpId}`
    if (request.method === 'CARD') return { externalId, checkoutUrl: null, paymentCode: null }
    const code = request.method === 'PIX'
      ? `00020126TESTE-NAO-PAGAR-${request.topUpId.slice(0, 8)}`
      : `00000.00000 00000.000000 00000.000000 0 TESTE-${request.topUpId.slice(0, 8)}`
    return { externalId, paymentCode: code, checkoutUrl: null }
  }

  /** Recarga automática de teste: o "cartão" de teste sempre aprova, a não ser que a referência seja `test_card_declined`. */
  supportsSavedMethod(): boolean {
    return true
  }

  async chargeSavedMethod(request: ChargeRequest & { paymentMethodRef: string }): Promise<ChargeResult & { paid: boolean }> {
    if (request.paymentMethodRef === 'test_card_declined') throw new Error('Cartão de teste recusado.')
    return { externalId: `test_${request.topUpId}`, paymentCode: null, checkoutUrl: null, paid: true }
  }
}
