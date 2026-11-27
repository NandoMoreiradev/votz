import type { Prisma } from '@prisma/client'

type SpendTransaction = Pick<Prisma.TransactionClient, '$queryRaw' | 'adImpression'>

export interface LockedAdBalance {
  balanceCents: number
  pendingSpendMillicents: number
}

/** Cobrança, autorização, fechamento e devolução compartilham o bloqueio da conta. */
export async function lockAdBalance(tx: SpendTransaction, accountId: string): Promise<LockedAdBalance | null> {
  const [account] = await tx.$queryRaw<LockedAdBalance[]>`
    SELECT balance_cents AS "balanceCents", pending_spend_millicents AS "pendingSpendMillicents"
    FROM ad_accounts WHERE id = ${accountId} FOR NO KEY UPDATE`
  return account ?? null
}

export async function reservedAdBalance(tx: Pick<SpendTransaction, 'adImpression'>, accountId: string, now: Date, excludeImpressionId?: string): Promise<number> {
  const { _sum } = await tx.adImpression.aggregate({
    where: { spendAccountId: accountId, spendReservedUntil: { gt: now }, id: excludeImpressionId ? { not: excludeImpressionId } : undefined },
    _sum: { chargeMillicents: true },
  })
  return _sum.chargeMillicents ?? 0
}
