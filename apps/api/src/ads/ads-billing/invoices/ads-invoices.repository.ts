import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

export interface NewInvoiceData {
  adAccountId: string
  periodStart: Date
  periodEnd: Date
  amountCents: number
  takerName: string
  takerCnpj: string
}

/** Notas fiscais mensais. O valor sai da soma do gasto no livro-caixa. */
@Injectable()
export class AdsInvoicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Gasto do período por conta (só o que saiu do saldo do cliente como gasto com anúncios). */
  async spendByAccount(startAt: Date, endAt: Date): Promise<{ adAccountId: string; cents: number }[]> {
    const rows = await this.prisma.adLedgerEntry.groupBy({
      by: ['adAccountId'],
      where: { type: 'SPEND', ledger: 'CUSTOMER_BALANCE', side: 'DEBIT', createdAt: { gte: startAt, lt: endAt } },
      _sum: { amountCents: true },
    })
    return rows.map((row) => ({ adAccountId: row.adAccountId, cents: row._sum.amountCents ?? 0 })).filter((row) => row.cents > 0)
  }

  /** Dados do tomador de cada conta (nome e CNPJ da empresa no momento). */
  takersOf(accountIds: string[]) {
    return this.prisma.adAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, company: { select: { legalName: true, cnpj: true } } } })
  }

  /** Cria as notas que faltam; a que já existe para a conta e o mês é pulada (a regra única do banco garante). */
  async createMissing(data: NewInvoiceData[]): Promise<number> {
    if (!data.length) return 0
    const result = await this.prisma.adInvoice.createMany({ data, skipDuplicates: true })
    return result.count
  }

  pending(limit: number) {
    return this.prisma.adInvoice.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: { adAccount: { select: { companyId: true, name: true } } },
    })
  }

  /** Reserva a nota para emitir (só uma instância por vez). */
  async claim(invoiceId: string, attempts: number): Promise<boolean> {
    const moved = await this.prisma.adInvoice.updateMany({ where: { id: invoiceId, status: 'PENDING', attempts }, data: { attempts: { increment: 1 } } })
    return moved.count > 0
  }

  markIssued(invoiceId: string, data: { provider: string; externalId: string; number: string; pdfUrl: string | null; xmlUrl: string | null }, now: Date) {
    return this.prisma.adInvoice.update({ where: { id: invoiceId }, data: { ...data, status: 'ISSUED', issuedAt: now, lastError: null } })
  }

  markError(invoiceId: string, error: string, failed: boolean) {
    return this.prisma.adInvoice.update({ where: { id: invoiceId }, data: { lastError: error.slice(0, 500), ...(failed ? { status: 'FAILED' as const } : {}) } })
  }

  list(adAccountId: string, take: number) {
    return this.prisma.adInvoice.findMany({ where: { adAccountId }, orderBy: { periodStart: 'desc' }, take })
  }
}
