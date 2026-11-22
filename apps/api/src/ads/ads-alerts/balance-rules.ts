/**
 * Regra do aviso de saldo baixo: o saldo que sobra dura menos que um dia do orçamento das campanhas ligadas.
 * Texto e conta ficam aqui, sem banco, para testar com facilidade.
 */
export interface BalanceFacts {
  balanceCents: number
  /** Gasto que ainda não virou centavo no livro-caixa (milésimos de centavo). */
  pendingSpendMillicents: number
  /** Orçamento diário de cada conjunto ligado e dentro do período, em centavos. */
  dailyBudgetsCents: readonly number[]
}

/** Saldo disponível em centavos: o saldo menos o gasto ainda não lançado (arredondado para cima, lado seguro). */
export function availableCents(facts: Pick<BalanceFacts, 'balanceCents' | 'pendingSpendMillicents'>): number {
  return facts.balanceCents - Math.ceil(Math.max(facts.pendingSpendMillicents, 0) / 1000)
}

/** Só avisa quem tem campanha ligada: sem campanha ligada, saldo baixo não custa nada a ninguém. */
export function isLowBalance(facts: BalanceFacts): boolean {
  const dayBudget = facts.dailyBudgetsCents.reduce((total, cents) => total + Math.max(cents, 0), 0)
  if (dayBudget <= 0) return false
  return availableCents(facts) < dayBudget
}
