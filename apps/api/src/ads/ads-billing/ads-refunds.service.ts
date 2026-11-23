import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import * as DOMPurify from 'isomorphic-dompurify'
import type { AdRefund, AdRefundStatus } from '@prisma/client'
import type { AdRefundQueueItem, AdRefundView } from '@votz/shared-types'
import { AdvertiserNotifier } from './advertiser-notifier'
import { AdsBillingRepository } from './ads-billing.repository'
import { AdsRefundsRepository } from './ads-refunds.repository'
import { toView } from './refund-view'
import type { RequestAdRefundDto, ResolveAdRefundDto } from './dto/ads-refunds.dto'

const clean = (text: string) => DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).replace(/\s+/g, ' ').trim()
const QUEUE_SIZE = 100

/**
 * Devolução do saldo que sobrou. O anunciante pede; o valor sai do saldo na hora (para não ser gasto enquanto espera) e a
 * equipe do Votz devolve o dinheiro por fora (Pix ou transferência) e marca como paga, ou recusa e o valor volta ao saldo.
 * Só se devolve o que foi pago em recargas: crédito dado pelo Votz não entra.
 */
@Injectable()
export class AdsRefundsService {
  constructor(
    private readonly repo: AdsRefundsRepository,
    private readonly billing: AdsBillingRepository,
    private readonly notifier: AdvertiserNotifier,
  ) {}

  async request(companyId: string, accountId: string, userId: string, dto: RequestAdRefundDto): Promise<AdRefundView> {
    await this.ownedAccount(companyId, accountId)
    const reason = dto.reason ? clean(dto.reason) || null : null
    const result = await this.repo.createRefund(accountId, dto.amountCents, reason, userId)
    if (!result.ok) throw new BadRequestException(result.problem)
    return toView((await this.repo.find(result.refundId))!)
  }

  /** O anunciante desiste de um pedido que ainda não foi pago: o valor volta ao saldo. */
  async cancel(companyId: string, refundId: string, userId: string): Promise<AdRefundView> {
    const refund = await this.repo.find(refundId)
    if (!refund || refund.adAccount.companyId !== companyId) throw new NotFoundException('Pedido de devolução não encontrado.')
    if (refund.status !== 'REQUESTED') throw new BadRequestException('Só dá para cancelar um pedido que ainda não foi resolvido.')
    if (!(await this.repo.resolveRefund(refundId, 'CANCELED', { userId }))) throw new ConflictException('Este pedido mudou agora há pouco. Atualize a tela.')
    return toView((await this.repo.find(refundId))!)
  }

  // ─── Equipe do Votz ──────────────────────────────────────────────────────────────────────────────

  async queue(status: AdRefundStatus = 'REQUESTED'): Promise<AdRefundQueueItem[]> {
    const rows = await this.repo.queue(status, QUEUE_SIZE)
    return rows.map((row) => ({
      ...toView(row),
      accountId: row.adAccount.id,
      accountName: row.adAccount.name,
      companyId: row.adAccount.company.id,
      companyName: row.adAccount.company.tradeName,
      companyCnpj: row.adAccount.company.cnpj,
    }))
  }

  /** Marca como devolvida (o dinheiro já saiu) ou recusa. Duas pessoas ao mesmo tempo não se atropelam. */
  async resolve(refundId: string, actorId: string, dto: ResolveAdRefundDto): Promise<AdRefundView> {
    const refund = await this.repo.find(refundId)
    if (!refund) throw new NotFoundException('Pedido de devolução não encontrado.')
    const note = dto.note ? clean(dto.note) : null
    if (dto.decision === 'REJECTED' && (!note || note.length < 10)) throw new BadRequestException('Explique o motivo da recusa em pelo menos 10 letras.')
    const done = await this.repo.resolveRefund(refundId, dto.decision, { userId: actorId, note, externalId: dto.externalId?.trim() || null })
    if (!done) throw new ConflictException('Este pedido já foi resolvido por outra pessoa.')
    await this.notifier.notify(refund.adAccount.companyId, dto.decision === 'PAID' ? 'AD_REFUND_PAID' : 'AD_REFUND_REJECTED', {
      accountId: refund.adAccountId,
      accountName: refund.adAccount.name,
      amountCents: refund.amountCents,
      ...(dto.decision === 'REJECTED' ? { reason: note } : {}),
    })
    return toView((await this.repo.find(refundId))!)
  }

  private async ownedAccount(companyId: string, accountId: string) {
    const account = await this.billing.findAccount(accountId)
    if (!account || account.companyId !== companyId) throw new NotFoundException('Conta de anúncios não encontrada.')
    return account
  }
}
