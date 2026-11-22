import type { AdLedgerAccount, AdLedgerSide } from '@prisma/client'

/** Uma linha de um lançamento do livro-caixa (partidas dobradas). */
export interface LedgerLine {
  ledger: AdLedgerAccount
  side: AdLedgerSide
  amountCents: number
}

/**
 * Confere as regras de qualquer lançamento: pelo menos duas linhas, valores inteiros e positivos, e débitos
 * somando igual aos créditos. Quem lança sempre passa por aqui, então um lançamento torto nunca chega ao banco.
 */
export function assertBalanced(lines: LedgerLine[]): void {
  if (lines.length < 2) throw new Error('Lançamento precisa de pelo menos duas linhas.')
  if (lines.some((line) => !Number.isInteger(line.amountCents) || line.amountCents <= 0)) {
    throw new Error('Valores do livro-caixa precisam ser inteiros e positivos (em centavos).')
  }
  const sum = (side: AdLedgerSide) => lines.filter((line) => line.side === side).reduce((total, line) => total + line.amountCents, 0)
  if (sum('DEBIT') !== sum('CREDIT')) throw new Error('Lançamento desequilibrado: débitos e créditos precisam ser iguais.')
}

/** Quanto o saldo do anunciante muda com estas linhas. O saldo é passivo: crédito aumenta, débito diminui. */
export function customerBalanceDelta(lines: LedgerLine[]): number {
  return lines
    .filter((line) => line.ledger === 'CUSTOMER_BALANCE')
    .reduce((total, line) => total + (line.side === 'CREDIT' ? line.amountCents : -line.amountCents), 0)
}

/** Recarga paga: o dinheiro entra (débito em "recebido") e o saldo do anunciante sobe (crédito). */
export function topUpLines(amountCents: number): LedgerLine[] {
  return [
    { ledger: 'PAYMENTS_RECEIVED', side: 'DEBIT', amountCents },
    { ledger: 'CUSTOMER_BALANCE', side: 'CREDIT', amountCents },
  ]
}

/** Gasto com anúncios (usado pelo cálculo de cobrança da Etapa 2): o saldo desce e vira receita. */
export function spendLines(amountCents: number): LedgerLine[] {
  return [
    { ledger: 'CUSTOMER_BALANCE', side: 'DEBIT', amountCents },
    { ledger: 'AD_REVENUE', side: 'CREDIT', amountCents },
  ]
}
