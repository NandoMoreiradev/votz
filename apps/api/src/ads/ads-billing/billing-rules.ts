import { AD_AUTO_TOPUP_LIMITS, AD_REFUND_LIMITS, type AdAutoTopUpView, type SetAdAutoTopUpInput } from '@votz/shared-types'
import { availableCents } from '../ads-alerts/balance-rules'
import { saoPauloDay } from '../ads-delivery/delivery-rules'

// ─── Devolução de saldo ──────────────────────────────────────────────────────────────────────────

export interface RefundFacts {
  balanceCents: number
  pendingSpendMillicents: number
  /** Soma das recargas pagas da conta (crédito dado pelo Votz não entra: só se devolve o que o anunciante pagou). */
  paidTopUpsCents: number
  /** Devoluções já pedidas ou pagas (as recusadas e canceladas voltaram ao saldo e não contam). */
  refundedCents: number
}

/** Quanto dá para pedir de volta agora. Nunca passa do saldo disponível (já sem o gasto ainda não lançado) nem do que foi pago. */
export function refundableCents(facts: RefundFacts): number {
  const available = availableCents(facts)
  const unrefundedPayments = facts.paidTopUpsCents - facts.refundedCents
  return Math.max(0, Math.min(available, unrefundedPayments))
}

/** O pedido vale? Devolve a frase do problema, ou `null`. O mínimo não vale quando o pedido é tudo o que dá para devolver. */
export function refundProblem(amountCents: number, refundable: number): string | null {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 'Informe quanto quer de volta.'
  if (refundable <= 0) return 'Não há saldo para devolver agora.'
  if (amountCents > refundable) return 'O valor passa do que dá para devolver agora.'
  if (amountCents < AD_REFUND_LIMITS.MIN_CENTS && amountCents !== refundable) return 'A devolução mínima é de R$ 10,00.'
  return null
}

// ─── Recarga automática ──────────────────────────────────────────────────────────────────────────

export interface AutoTopUpFacts {
  enabled: boolean
  thresholdCents: number
  amountCents: number
  monthlyLimitCents: number
  /** Recargas automáticas já feitas no mês (pagas ou em andamento). */
  usedThisMonthCents: number
  balanceCents: number
  pendingSpendMillicents: number
  hasPaymentMethod: boolean
  consecutiveFailures: number
  lastTriggeredAt: Date | null
  /** Já existe uma recarga automática esperando pagamento. */
  hasPendingAutoTopUp: boolean
  /** Há campanha ligada (sem campanha ligada, saldo baixo não custa nada). */
  hasActiveCampaign: boolean
}

export type AutoTopUpDecision =
  | { action: 'CHARGE' }
  | { action: 'SKIP'; reason: string }
  /** Para e desliga a recarga automática, com o motivo que o anunciante lê. */
  | { action: 'STOP'; reason: string }

/** Decide o que fazer com a conta agora. Função pura: o serviço só executa a decisão. */
export function decideAutoTopUp(facts: AutoTopUpFacts, now: Date): AutoTopUpDecision {
  if (!facts.enabled) return { action: 'SKIP', reason: 'desligada' }
  if (!facts.hasPaymentMethod) return { action: 'STOP', reason: 'Não há cartão salvo para cobrar.' }
  if (facts.consecutiveFailures >= AD_AUTO_TOPUP_LIMITS.MAX_FAILURES) {
    return { action: 'STOP', reason: `A cobrança falhou ${facts.consecutiveFailures} vezes seguidas. Confira o cartão e ligue de novo.` }
  }
  if (!facts.hasActiveCampaign) return { action: 'SKIP', reason: 'sem campanha ligada' }
  if (availableCents(facts) >= facts.thresholdCents) return { action: 'SKIP', reason: 'saldo acima do piso' }
  if (facts.hasPendingAutoTopUp) return { action: 'SKIP', reason: 'já há uma recarga automática esperando' }
  if (facts.lastTriggeredAt && now.getTime() - facts.lastTriggeredAt.getTime() < AD_AUTO_TOPUP_LIMITS.MIN_INTERVAL_MINUTES * 60_000) {
    return { action: 'SKIP', reason: 'recarregou há pouco' }
  }
  if (facts.usedThisMonthCents + facts.amountCents > facts.monthlyLimitCents) {
    return { action: 'STOP', reason: 'O teto de recarga automática deste mês foi atingido. Ela volta no mês que vem ou quando você aumentar o teto.' }
  }
  return { action: 'CHARGE' }
}

/** O que a pessoa pediu para ligar vale? Devolve a frase do problema, ou `null`. */
export function autoTopUpProblem(input: SetAdAutoTopUpInput, limits: { minTopUpCents: number; maxTopUpCents: number }): string | null {
  if (!input.enabled) return null
  if (!input.acceptCharges) return 'Aceite que o cartão seja cobrado sozinho para ligar a recarga automática.'
  const { MIN_THRESHOLD_CENTS, MAX_THRESHOLD_CENTS, MAX_MONTHLY_LIMIT_CENTS } = AD_AUTO_TOPUP_LIMITS
  if (input.thresholdCents < MIN_THRESHOLD_CENTS || input.thresholdCents > MAX_THRESHOLD_CENTS) return 'O piso precisa ficar entre R$ 10,00 e R$ 5.000,00.'
  if (input.amountCents < limits.minTopUpCents || input.amountCents > limits.maxTopUpCents) return 'O valor de cada recarga está fora do permitido.'
  if (input.monthlyLimitCents < input.amountCents) return 'O teto do mês precisa ser pelo menos o valor de uma recarga.'
  if (input.monthlyLimitCents > MAX_MONTHLY_LIMIT_CENTS) return 'O teto do mês passa do máximo permitido (R$ 20.000,00).'
  return null
}

export function autoTopUpView(
  row: {
    enabled: boolean
    thresholdCents: number
    amountCents: number
    monthlyLimitCents: number
    paymentMethodRef: string | null
    stoppedReason: string | null
    consentAt: Date | null
    lastTriggeredAt: Date | null
  },
  usedThisMonthCents: number,
): AdAutoTopUpView {
  return {
    enabled: row.enabled,
    thresholdCents: row.thresholdCents,
    amountCents: row.amountCents,
    monthlyLimitCents: row.monthlyLimitCents,
    usedThisMonthCents,
    hasPaymentMethod: !!row.paymentMethodRef,
    stoppedReason: row.stoppedReason,
    consentAt: row.consentAt?.toISOString() ?? null,
    lastTriggeredAt: row.lastTriggeredAt?.toISOString() ?? null,
  }
}

// ─── Meses (fuso de São Paulo, sem horário de verão desde 2019: UTC-3 fixo) ──────────────────────

export interface MonthRange {
  /** "AAAA-MM-01" e último dia do mês, "AAAA-MM-DD". */
  start: string
  end: string
  /** Instantes UTC: começo do mês (inclusive) e começo do mês seguinte (exclusivo). */
  startAt: Date
  endAt: Date
}

const SAO_PAULO_OFFSET_HOURS = 3

/** O mês (de São Paulo) que contém `now`, deslocado em `monthsBack` meses para trás. */
export function saoPauloMonth(now: Date, monthsBack = 0): MonthRange {
  const [year, month] = saoPauloDay(now).split('-').map(Number)
  const first = new Date(Date.UTC(year, month - 1 - monthsBack, 1))
  const y = first.getUTCFullYear()
  const m = first.getUTCMonth()
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const pad = (value: number) => String(value).padStart(2, '0')
  return {
    start: `${y}-${pad(m + 1)}-01`,
    end: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
    startAt: new Date(Date.UTC(y, m, 1, SAO_PAULO_OFFSET_HOURS)),
    endAt: new Date(Date.UTC(y, m + 1, 1, SAO_PAULO_OFFSET_HOURS)),
  }
}
