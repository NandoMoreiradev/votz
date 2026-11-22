import { randomUUID } from 'crypto'
import { Injectable } from '@nestjs/common'
import type { AdPaymentProvider, AdTopUpMethod, AdLedgerEntryType } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { assertBalanced, customerBalanceDelta, type LedgerLine } from './ledger'

export interface NewTopUpData {
  id: string
  adAccountId: string
  amountCents: number
  method: AdTopUpMethod
  provider: AdPaymentProvider
  externalId: string
  paymentCode: string | null
  checkoutUrl: string | null
  expiresAt: Date
  createdById: string
}

/** Só tabelas de anúncio. O saldo da conta só muda dentro de `postLedger`, junto com o lançamento. */
@Injectable()
export class AdsBillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAccount(accountId: string) {
    return this.prisma.adAccount.findUnique({ where: { id: accountId } })
  }

  /** Recargas que passaram do prazo sem pagamento viram "venceu". */
  expirePending(adAccountId: string, now = new Date()) {
    return this.prisma.adTopUp.updateMany({
      where: { adAccountId, status: 'PENDING', expiresAt: { lt: now } },
      data: { status: 'EXPIRED' },
    })
  }

  createTopUp(data: NewTopUpData) {
    return this.prisma.adTopUp.create({ data })
  }

  findTopUp(topUpId: string) {
    return this.prisma.adTopUp.findUnique({ where: { id: topUpId }, include: { adAccount: { select: { companyId: true } } } })
  }

  listTopUps(adAccountId: string, take: number) {
    return this.prisma.adTopUp.findMany({ where: { adAccountId }, orderBy: { createdAt: 'desc' }, take })
  }

  async cancelTopUp(topUpId: string): Promise<boolean> {
    const result = await this.prisma.adTopUp.updateMany({ where: { id: topUpId, status: 'PENDING' }, data: { status: 'CANCELED' } })
    return result.count > 0
  }

  /** Linhas do extrato do anunciante (só a conta "saldo do cliente"), da mais nova para a mais antiga. */
  listStatement(adAccountId: string, take: number) {
    return this.prisma.adLedgerEntry.findMany({
      where: { adAccountId, ledger: 'CUSTOMER_BALANCE' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    })
  }

  /** Saldo recalculado só pelo livro-caixa (créditos menos débitos do saldo do cliente), para conferir com o da conta. */
  async ledgerBalance(adAccountId: string): Promise<number> {
    const rows = await this.prisma.adLedgerEntry.groupBy({
      by: ['side'],
      where: { adAccountId, ledger: 'CUSTOMER_BALANCE' },
      _sum: { amountCents: true },
    })
    const sum = (side: 'DEBIT' | 'CREDIT') => rows.find((row) => row.side === side)?._sum.amountCents ?? 0
    return sum('CREDIT') - sum('DEBIT')
  }

  /**
   * Marca a recarga como paga, lança no livro-caixa e sobe o saldo, tudo numa transação só. Só passa de PENDING (ou
   * "venceu", se o provedor confirmou depois do prazo) para PAID uma vez: aviso repetido do provedor não credita duas
   * vezes. Devolve `null` se a recarga não existe e `false` se já estava paga ou cancelada.
   */
  settleTopUp(topUpId: string, lines: (amountCents: number) => LedgerLine[], paidAt = new Date()): Promise<boolean | null> {
    return this.prisma.$transaction(async (tx) => {
      const topUp = await tx.adTopUp.findUnique({ where: { id: topUpId } })
      if (!topUp) return null
      const moved = await tx.adTopUp.updateMany({ where: { id: topUpId, status: { in: ['PENDING', 'EXPIRED'] } }, data: { status: 'PAID', paidAt } })
      if (moved.count === 0) return false
      await this.postLedger(tx, {
        adAccountId: topUp.adAccountId,
        type: 'TOPUP',
        description: `Recarga por ${topUp.method === 'PIX' ? 'Pix' : topUp.method === 'BOLETO' ? 'boleto' : 'cartão'}`,
        lines: lines(topUp.amountCents),
        topUpId,
        createdById: topUp.createdById,
      })
      return true
    })
  }

  /** Único caminho que muda `balanceCents`: grava as linhas do lançamento e aplica a diferença no saldo. */
  async postLedger(
    tx: Pick<PrismaService, 'adLedgerEntry' | 'adAccount'>,
    entry: { adAccountId: string; type: AdLedgerEntryType; description: string; lines: LedgerLine[]; topUpId?: string; createdById?: string },
  ) {
    assertBalanced(entry.lines)
    const transactionId = randomUUID()
    await tx.adLedgerEntry.createMany({
      data: entry.lines.map((line) => ({
        adAccountId: entry.adAccountId,
        transactionId,
        ledger: line.ledger,
        side: line.side,
        amountCents: line.amountCents,
        type: entry.type,
        description: entry.description,
        topUpId: entry.topUpId ?? null,
        createdById: entry.createdById ?? null,
      })),
    })
    const delta = customerBalanceDelta(entry.lines)
    if (delta !== 0) await tx.adAccount.update({ where: { id: entry.adAccountId }, data: { balanceCents: { increment: delta } } })
  }
}
