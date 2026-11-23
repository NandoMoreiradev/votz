import { assertBalanced, customerBalanceDelta, refundPaidLines, refundRequestLines, refundReturnedLines } from './ledger'
import { autoTopUpProblem, decideAutoTopUp, refundProblem, refundableCents, saoPauloMonth, type AutoTopUpFacts } from './billing-rules'

describe('lançamentos da devolução', () => {
  it('pedir tira do saldo, pagar não mexe no saldo, recusar devolve ao saldo (todos equilibrados)', () => {
    for (const lines of [refundRequestLines(5000), refundPaidLines(5000), refundReturnedLines(5000)]) expect(() => assertBalanced(lines)).not.toThrow()
    expect(customerBalanceDelta(refundRequestLines(5000))).toBe(-5000)
    expect(customerBalanceDelta(refundPaidLines(5000))).toBe(0)
    expect(customerBalanceDelta(refundReturnedLines(5000))).toBe(5000)
  })

  it('pedir e recusar se anulam (o saldo volta ao que era)', () => {
    expect(customerBalanceDelta(refundRequestLines(7300)) + customerBalanceDelta(refundReturnedLines(7300))).toBe(0)
  })
})

describe('refundableCents', () => {
  const base = { balanceCents: 10_000, pendingSpendMillicents: 0, paidTopUpsCents: 10_000, refundedCents: 0 }

  it('é o saldo, até o que foi pago em recargas', () => {
    expect(refundableCents(base)).toBe(10_000)
    expect(refundableCents({ ...base, paidTopUpsCents: 4_000 })).toBe(4_000) // crédito do Votz não se devolve
  })

  it('não conta o gasto que ainda não virou centavo (arredonda para o lado seguro)', () => {
    expect(refundableCents({ ...base, pendingSpendMillicents: 1_500 })).toBe(9_998)
  })

  it('desconta devoluções já pedidas ou pagas', () => {
    expect(refundableCents({ ...base, balanceCents: 10_000, refundedCents: 3_000 })).toBe(7_000)
  })

  it('nunca é negativo', () => {
    expect(refundableCents({ ...base, balanceCents: 0 })).toBe(0)
    expect(refundableCents({ ...base, refundedCents: 20_000 })).toBe(0)
  })
})

describe('refundProblem', () => {
  it('aceita um valor dentro do que dá para devolver', () => expect(refundProblem(5_000, 10_000)).toBeNull())
  it('recusa zero, negativo e fracionado', () => {
    expect(refundProblem(0, 10_000)).toMatch(/quanto/)
    expect(refundProblem(-5, 10_000)).toMatch(/quanto/)
    expect(refundProblem(10.5, 10_000)).toMatch(/quanto/)
  })
  it('recusa passar do limite e sem saldo', () => {
    expect(refundProblem(10_001, 10_000)).toMatch(/passa/)
    expect(refundProblem(1_000, 0)).toMatch(/Não há saldo/)
  })
  it('o mínimo de R$ 10 não vale quando é tudo o que dá para devolver', () => {
    expect(refundProblem(500, 10_000)).toMatch(/mínima/)
    expect(refundProblem(500, 500)).toBeNull()
  })
})

describe('decideAutoTopUp', () => {
  const NOW = new Date('2026-11-23T15:00:00Z')
  const facts = (over: Partial<AutoTopUpFacts> = {}): AutoTopUpFacts => ({
    enabled: true,
    thresholdCents: 5_000,
    amountCents: 10_000,
    monthlyLimitCents: 50_000,
    usedThisMonthCents: 0,
    balanceCents: 2_000,
    pendingSpendMillicents: 0,
    hasPaymentMethod: true,
    consecutiveFailures: 0,
    lastTriggeredAt: null,
    hasPendingAutoTopUp: false,
    hasActiveCampaign: true,
    ...over,
  })

  it('cobra quando o saldo está abaixo do piso e há campanha ligada', () => expect(decideAutoTopUp(facts(), NOW)).toEqual({ action: 'CHARGE' }))

  it('conta o gasto ainda não lançado como já gasto', () => {
    expect(decideAutoTopUp(facts({ balanceCents: 5_500, pendingSpendMillicents: 600_000 }), NOW).action).toBe('CHARGE')
  })

  it.each([
    ['desligada', { enabled: false }],
    ['saldo acima do piso', { balanceCents: 5_000 }],
    ['sem campanha ligada', { hasActiveCampaign: false }],
    ['já há uma esperando', { hasPendingAutoTopUp: true }],
    ['recarregou há 30 min', { lastTriggeredAt: new Date(NOW.getTime() - 30 * 60_000) }],
  ])('não cobra: %s', (_label, over) => expect(decideAutoTopUp(facts(over), NOW).action).toBe('SKIP'))

  it('volta a poder cobrar depois de uma hora', () => {
    expect(decideAutoTopUp(facts({ lastTriggeredAt: new Date(NOW.getTime() - 61 * 60_000) }), NOW).action).toBe('CHARGE')
  })

  it('para (e avisa) ao bater o teto do mês, sem cobrar nem um centavo a mais', () => {
    const decision = decideAutoTopUp(facts({ usedThisMonthCents: 45_000 }), NOW)
    expect(decision).toMatchObject({ action: 'STOP' })
    expect((decision as { reason: string }).reason).toMatch(/teto/)
    expect(decideAutoTopUp(facts({ usedThisMonthCents: 40_000 }), NOW).action).toBe('CHARGE') // 40.000 + 10.000 = 50.000, cabe
  })

  it('para depois de 3 falhas seguidas e quando não há cartão', () => {
    expect(decideAutoTopUp(facts({ consecutiveFailures: 3 }), NOW).action).toBe('STOP')
    expect(decideAutoTopUp(facts({ hasPaymentMethod: false }), NOW).action).toBe('STOP')
  })
})

describe('autoTopUpProblem', () => {
  const limits = { minTopUpCents: 2_000, maxTopUpCents: 1_000_000 }
  const input = { enabled: true, thresholdCents: 5_000, amountCents: 10_000, monthlyLimitCents: 50_000, acceptCharges: true }

  it('desligar sempre vale', () => expect(autoTopUpProblem({ ...input, enabled: false, acceptCharges: false, amountCents: 1 }, limits)).toBeNull())
  it('ligar exige aceite', () => expect(autoTopUpProblem({ ...input, acceptCharges: false }, limits)).toMatch(/Aceite/))
  it('aceita um pedido certo', () => expect(autoTopUpProblem(input, limits)).toBeNull())
  it('recusa piso fora da faixa, recarga fora do limite e teto menor que uma recarga', () => {
    expect(autoTopUpProblem({ ...input, thresholdCents: 500 }, limits)).toMatch(/piso/)
    expect(autoTopUpProblem({ ...input, amountCents: 500 }, limits)).toMatch(/recarga/)
    expect(autoTopUpProblem({ ...input, monthlyLimitCents: 9_000 }, limits)).toMatch(/teto/)
    expect(autoTopUpProblem({ ...input, monthlyLimitCents: 3_000_000 }, limits)).toMatch(/máximo/)
  })
})

describe('saoPauloMonth', () => {
  it('o mês é o de São Paulo: 1º de dezembro à 1h UTC ainda é novembro lá', () => {
    const month = saoPauloMonth(new Date('2026-12-01T01:00:00Z'))
    expect(month).toMatchObject({ start: '2026-11-01', end: '2026-11-30' })
    expect(month.startAt.toISOString()).toBe('2026-11-01T03:00:00.000Z')
    expect(month.endAt.toISOString()).toBe('2026-12-01T03:00:00.000Z')
  })

  it('mês anterior, virando o ano e ano bissexto', () => {
    expect(saoPauloMonth(new Date('2027-01-15T12:00:00Z'), 1)).toMatchObject({ start: '2026-12-01', end: '2026-12-31' })
    expect(saoPauloMonth(new Date('2028-03-10T12:00:00Z'), 1)).toMatchObject({ start: '2028-02-01', end: '2028-02-29' })
  })
})
