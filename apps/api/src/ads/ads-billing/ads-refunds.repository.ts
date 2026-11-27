import { Injectable } from '@nestjs/common'
import { Prisma, type AdRefundStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { AdsBillingRepository, InsufficientBalanceError } from './ads-billing.repository'
import { refundPaidLines, refundRequestLines, refundReturnedLines } from './ledger'
import { refundProblem, refundableCents } from './billing-rules'
import { lockAdBalance, reservedAdBalance } from './spend-reservation'

export type CreateRefundResult = { ok: true; refundId: string } | { ok: false; problem: string }

/** Devoluções de saldo. O dinheiro só se move pelo livro-caixa (`AdsBillingRepository.postLedger`), na mesma transação. */
@Injectable()
export class AdsRefundsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: AdsBillingRepository,
  ) {}

  /** Quanto dá para devolver agora, e o que sustenta a conta. */
  async refundable(accountId: string): Promise<number> {
    const [account, paid, refunded, reserved] = await Promise.all([
      this.prisma.adAccount.findUnique({ where: { id: accountId }, select: { balanceCents: true, pendingSpendMillicents: true } }),
      this.prisma.adTopUp.aggregate({ where: { adAccountId: accountId, status: 'PAID' }, _sum: { amountCents: true } }),
      this.prisma.adRefund.aggregate({ where: { adAccountId: accountId, status: { in: ['REQUESTED', 'PAID'] } }, _sum: { amountCents: true } }),
      reservedAdBalance(this.prisma, accountId, new Date()),
    ])
    if (!account) return 0
    return refundableCents({ ...account, pendingSpendMillicents: account.pendingSpendMillicents + reserved, paidTopUpsCents: paid._sum.amountCents ?? 0, refundedCents: refunded._sum.amountCents ?? 0 })
  }

  /**
   * Pede a devolução: confere o valor, tira do saldo e cria o pedido, tudo numa transação. A conta é travada durante a
   * conferência (dois pedidos ao mesmo tempo não passam juntos do que há) e a retirada do saldo é atômica.
   */
  createRefund(accountId: string, amountCents: number, reason: string | null, userId: string): Promise<CreateRefundResult> {
    return this.prisma
      .$transaction(async (tx) => {
        const account = await lockAdBalance(tx, accountId)
        if (!account) return { ok: false, problem: 'Conta de anúncios não encontrada.' } satisfies CreateRefundResult
        const [paid, refunded, reserved] = await Promise.all([
          tx.adTopUp.aggregate({ where: { adAccountId: accountId, status: 'PAID' }, _sum: { amountCents: true } }),
          tx.adRefund.aggregate({ where: { adAccountId: accountId, status: { in: ['REQUESTED', 'PAID'] } }, _sum: { amountCents: true } }),
          reservedAdBalance(tx, accountId, new Date()),
        ])
        const pendingSpendMillicents = account.pendingSpendMillicents + reserved
        const refundable = refundableCents({ ...account, pendingSpendMillicents, paidTopUpsCents: paid._sum.amountCents ?? 0, refundedCents: refunded._sum.amountCents ?? 0 })
        const problem = refundProblem(amountCents, refundable)
        if (problem) return { ok: false, problem } satisfies CreateRefundResult

        const refund = await tx.adRefund.create({ data: { adAccountId: accountId, amountCents, reason, requestedById: userId } })
        await this.billing.postLedger(tx, {
          adAccountId: accountId,
          type: 'REFUND',
          description: 'Devolução de saldo pedida',
          lines: refundRequestLines(amountCents),
          refundId: refund.id,
          createdById: userId,
          minBalanceBeforeCents: amountCents + Math.ceil(pendingSpendMillicents / 1000),
        })
        return { ok: true, refundId: refund.id } satisfies CreateRefundResult
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
      .catch((error) => {
        if (error instanceof InsufficientBalanceError) return { ok: false, problem: 'O saldo mudou agora há pouco. Atualize a tela e peça de novo.' } satisfies CreateRefundResult
        throw error
      })
  }

  /**
   * Fecha o pedido (só se ainda estiver "pedida"): pago, recusado ou cancelado. Recusado e cancelado devolvem o valor ao
   * saldo. Devolve `false` se o pedido já tinha sido resolvido por outra pessoa.
   */
  resolveRefund(
    refundId: string,
    outcome: Extract<AdRefundStatus, 'PAID' | 'REJECTED' | 'CANCELED'>,
    by: { userId: string; note?: string | null; externalId?: string | null },
    now = new Date(),
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const refund = await tx.adRefund.findUnique({ where: { id: refundId } })
      if (!refund) return false
      const moved = await tx.adRefund.updateMany({
        where: { id: refundId, status: 'REQUESTED' },
        data: { status: outcome, resolvedById: by.userId, resolutionNote: by.note ?? null, externalId: by.externalId ?? null, resolvedAt: now },
      })
      if (moved.count === 0) return false
      await this.billing.postLedger(tx, {
        adAccountId: refund.adAccountId,
        type: 'REFUND',
        description: outcome === 'PAID' ? 'Devolução de saldo paga' : outcome === 'REJECTED' ? 'Devolução recusada: o valor voltou ao saldo' : 'Devolução cancelada: o valor voltou ao saldo',
        lines: outcome === 'PAID' ? refundPaidLines(refund.amountCents) : refundReturnedLines(refund.amountCents),
        refundId,
        createdById: by.userId,
      })
      return true
    })
  }

  find(refundId: string) {
    return this.prisma.adRefund.findUnique({ where: { id: refundId }, include: { adAccount: { select: { companyId: true, name: true } } } })
  }

  list(accountId: string, take: number) {
    return this.prisma.adRefund.findMany({ where: { adAccountId: accountId }, orderBy: { requestedAt: 'desc' }, take })
  }

  /** Fila do Votz: do pedido mais antigo para o mais novo. */
  queue(status: AdRefundStatus, take: number) {
    return this.prisma.adRefund.findMany({
      where: { status },
      orderBy: { requestedAt: 'asc' },
      take,
      include: { adAccount: { select: { id: true, name: true, company: { select: { id: true, tradeName: true, cnpj: true } } } } },
    })
  }
}
