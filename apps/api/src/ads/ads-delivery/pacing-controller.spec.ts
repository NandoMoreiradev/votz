import {
  DAY_TRAFFIC_WEIGHTS,
  INITIAL_PID_STATE,
  PACING_PID,
  expectedSpendMillicents,
  pacingError,
  pidStep,
  targetSpendFraction,
  viewableRate,
  type PidState,
} from './pacing-controller'

describe('targetSpendFraction (curva do dia)', () => {
  it('começa em 0, termina em 1 e nunca desce', () => {
    expect(targetSpendFraction(0)).toBe(0)
    expect(targetSpendFraction(1)).toBeCloseTo(1, 10)
    let previous = 0
    for (let minute = 0; minute <= 1440; minute += 1) {
      const value = targetSpendFraction(minute / 1440)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })
  it('madrugada gasta pouco e a noite gasta muito, ao contrário de uma reta', () => {
    expect(targetSpendFraction(6 / 24)).toBeLessThan(0.1) // até as 6h só ~4% do dia
    expect(targetSpendFraction(18 / 24) - targetSpendFraction(12 / 24)).toBeGreaterThan(0.2) // 12h às 18h
    expect(targetSpendFraction(22 / 24) - targetSpendFraction(18 / 24)).toBeGreaterThan(0.25) // 18h às 22h, o pico
  })
  it('valores fora do dia são limitados', () => {
    expect(targetSpendFraction(-1)).toBe(0)
    expect(targetSpendFraction(2)).toBeCloseTo(1, 10)
  })
  it('as 24 horas têm peso', () => {
    expect(DAY_TRAFFIC_WEIGHTS).toHaveLength(24)
  })
})

describe('pidStep', () => {
  it('à frente da curva, aperta o freio; atrás, solta', () => {
    const ahead = pidStep({ throttle: 1, e1: 0, e2: 0 }, -0.05)
    expect(ahead.throttle).toBeLessThan(1)
    const behind = pidStep({ throttle: 0.4, e1: 0, e2: 0 }, 0.05)
    expect(behind.throttle).toBeGreaterThan(0.4)
  })
  it('o freio fica sempre entre 0 e 1', () => {
    expect(pidStep({ throttle: 1, e1: 0, e2: 0 }, 0.5).throttle).toBe(1)
    expect(pidStep({ throttle: 0.01, e1: 0, e2: 0 }, -0.19).throttle).toBe(0)
  })
  it('passou muito à frente da curva: para de vez, sem esperar o controlador', () => {
    expect(pidStep({ throttle: 1, e1: 0, e2: 0 }, -PACING_PID.HARD_STOP_AHEAD).throttle).toBe(0)
  })
  it('no fim do dia ninguém é freado, para o que sobrou do orçamento poder sair', () => {
    expect(pidStep({ throttle: 0, e1: -0.1, e2: -0.1 }, -0.1, 1, 0.99).throttle).toBe(1)
  })
  it('o freio muda no máximo MAX_STEP por minuto, mesmo com o erro despencando de uma vez', () => {
    // O erro caiu de +0,6 para -0,15 num minuto: sem o limite o freio iria de 1 para 0.
    const next = pidStep({ throttle: 1, e1: 0.6, e2: 0.6 }, -0.15)
    expect(next.throttle).toBeCloseTo(1 - PACING_PID.MAX_STEP, 10)
    const up = pidStep({ throttle: 0, e1: -0.15, e2: -0.15 }, 0.6)
    expect(up.throttle).toBeCloseTo(PACING_PID.MAX_STEP, 10)
  })
  it('guarda os dois últimos erros', () => {
    const next = pidStep({ throttle: 1, e1: 0.02, e2: 0.01 }, 0.03)
    expect([next.e1, next.e2]).toEqual([0.03, 0.02])
  })
})

describe('pacingError', () => {
  it('curva menos gasto, em fração do orçamento', () => {
    const half = targetSpendFraction(0.5)
    expect(pacingError({ estimatedSpentMillicents: 0, dailyBudgetMillicents: 1000, elapsedFraction: 0.5 })).toBeCloseTo(half, 10)
    expect(pacingError({ estimatedSpentMillicents: 1000 * half, dailyBudgetMillicents: 1000, elapsedFraction: 0.5 })).toBeCloseTo(0, 10)
    expect(pacingError({ estimatedSpentMillicents: 900, dailyBudgetMillicents: 1000, elapsedFraction: 0.1 })).toBeLessThan(-0.5)
  })
  it('sem orçamento, o erro manda parar', () => {
    expect(pacingError({ estimatedSpentMillicents: 0, dailyBudgetMillicents: 0, elapsedFraction: 0.5 })).toBeLessThan(0)
  })
})

describe('gasto esperado da entrega', () => {
  it('por exibição vista: preço vezes a chance de ser vista; por clique: preço vezes a chance de clique', () => {
    expect(expectedSpendMillicents({ chargeMillicents: 1000, chargeOn: 'VIEWABLE_IMPRESSION', viewableRate: 0.6, clickRate: 0.01 })).toBe(600)
    expect(expectedSpendMillicents({ chargeMillicents: 40000, chargeOn: 'CLICK', viewableRate: 0.6, clickRate: 0.02 })).toBe(800)
  })
  it('chances fora de 0 a 1 são limitadas', () => {
    expect(expectedSpendMillicents({ chargeMillicents: 1000, chargeOn: 'VIEWABLE_IMPRESSION', viewableRate: 7, clickRate: 0 })).toBe(1000)
    expect(expectedSpendMillicents({ chargeMillicents: 1000, chargeOn: 'CLICK', viewableRate: 1, clickRate: -1 })).toBe(0)
  })
  it('chance de ser visto: anúncio novo usa a de partida; com muita história, vale a medida', () => {
    expect(viewableRate(0, 0)).toBeCloseTo(0.6, 10)
    expect(viewableRate(100, 1000)).toBeCloseTo((0.6 * 50 + 100) / (50 + 1000), 10)
    expect(viewableRate(5000, 100)).toBeLessThanOrEqual(1) // mais vistas que entregues é dado ruim: limitado
  })
})

/**
 * Simulação do dia inteiro, minuto a minuto: o conjunto "quer" gastar `demand` vezes o orçamento acompanhando o
 * tráfego do dia; o controlador decide a fração que realmente entra. O gasto é emprestado na hora (como o ritmo faz
 * no Redis), então não há atraso de cobrança aqui.
 */
function simulateDay(demand: number, options: { burst?: { fromMinute: number; minutes: number; times: number } } = {}) {
  const budget = 1_000_000
  let spent = 0
  let state: PidState = { ...INITIAL_PID_STATE }
  let worstAhead = 0
  let stoppedAt: number | null = null
  const throttles: number[] = []
  for (let minute = 0; minute < 1440; minute += 1) {
    const elapsed = minute / 1440
    const hourWeight = DAY_TRAFFIC_WEIGHTS[Math.floor(minute / 60)]
    const burst = options.burst && minute >= options.burst.fromMinute && minute < options.burst.fromMinute + options.burst.minutes ? options.burst.times : 1
    // Quanto o conjunto gastaria neste minuto sem freio, se o orçamento fosse infinito.
    const wanted = ((demand * budget * hourWeight) / DAY_TRAFFIC_WEIGHTS.reduce((a, b) => a + b, 0) / 60) * burst
    // O freio vale durante o minuto inteiro; o controlador só recalcula no fim dele.
    const spendNow = Math.min(wanted * state.throttle, budget - spent)
    spent += spendNow
    if (spent >= budget - 1 && stoppedAt === null) stoppedAt = minute
    const error = pacingError({ estimatedSpentMillicents: spent, dailyBudgetMillicents: budget, elapsedFraction: (minute + 1) / 1440 })
    worstAhead = Math.max(worstAhead, -error)
    state = pidStep(state, error, 1, (minute + 1) / 1440)
    throttles.push(state.throttle)
  }
  return { spent: spent / budget, worstAhead, stoppedAt, throttles }
}

/**
 * Conjunto de orçamento pequeno: cada entrega custa uma parte grande do dia (aqui, 2,5%), então o gasto de um minuto
 * é "em blocos" e o erro dá saltos. É o caso que fazia o freio oscilar entre 1 e 0 na prova real.
 */
function simulateLumpyDay(lumpsPerDay: number, demand: number) {
  const budget = 1_000_000
  const lump = budget / lumpsPerDay
  const total = DAY_TRAFFIC_WEIGHTS.reduce((a, b) => a + b, 0)
  let seed = 12345
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  let spent = 0
  let state: PidState = { ...INITIAL_PID_STATE }
  let bigJumps = 0
  let worstAhead = 0
  let previous = state.throttle
  for (let minute = 0; minute < 1440; minute += 1) {
    const wantedLumps = (demand * lumpsPerDay * DAY_TRAFFIC_WEIGHTS[Math.floor(minute / 60)]) / total / 60
    const expected = wantedLumps * state.throttle
    const lumps = Math.floor(expected) + (random() < expected - Math.floor(expected) ? 1 : 0)
    spent = Math.min(spent + lumps * lump, budget)
    const error = pacingError({ estimatedSpentMillicents: spent, dailyBudgetMillicents: budget, elapsedFraction: (minute + 1) / 1440 })
    worstAhead = Math.max(worstAhead, -error)
    state = pidStep(state, error, 1, (minute + 1) / 1440)
    if (Math.abs(state.throttle - previous) > PACING_PID.MAX_STEP + 1e-9 && state.throttle !== 0 && state.throttle !== 1) bigJumps += 1
    previous = state.throttle
  }
  return { spent: spent / budget, bigJumps, worstAhead }
}

describe('simulação do dia (controlador de ritmo)', () => {
  it('orçamento pequeno (40 entregas no dia, demanda 6×): nunca passa do orçamento e o freio não pula de 1 para 0', () => {
    const day = simulateLumpyDay(40, 6)
    expect(day.spent).toBeLessThanOrEqual(1)
    expect(day.spent).toBeGreaterThan(0.8) // usa a maior parte do orçamento
    expect(day.bigJumps).toBe(0)
  })
  it('orçamento minúsculo (10 entregas no dia): ainda gasta e não passa do orçamento', () => {
    const day = simulateLumpyDay(10, 6)
    expect(day.spent).toBeLessThanOrEqual(1)
    expect(day.spent).toBeGreaterThan(0.5)
  })

  it('demanda 4× o orçamento: gasta tudo, mas só no fim do dia, e nunca passa muito da curva', () => {
    const day = simulateDay(4)
    expect(day.spent).toBeGreaterThan(0.97)
    expect(day.spent).toBeLessThanOrEqual(1)
    // O orçamento não acaba de manhã: dura até a última hora do dia.
    expect(day.stoppedAt === null || day.stoppedAt > 1400).toBe(true)
    expect(day.worstAhead).toBeLessThan(0.03)
  })

  it('demanda 20× o orçamento (concorrência baixa, muita sobra de lugar): ainda segura o ritmo', () => {
    const day = simulateDay(20)
    expect(day.spent).toBeGreaterThan(0.95)
    expect(day.worstAhead).toBeLessThan(0.06)
    expect(day.stoppedAt === null || day.stoppedAt > 1380).toBe(true)
  })

  it('demanda de só metade do orçamento: o freio fica solto o dia todo', () => {
    const day = simulateDay(0.5)
    expect(day.spent).toBeCloseTo(0.5, 2)
    expect(Math.min(...day.throttles)).toBeGreaterThan(0.99)
  })

  it('rajada de 30 minutos com 10× o tráfego: o freio contém, sem estourar a curva', () => {
    const day = simulateDay(1.5, { burst: { fromMinute: 600, minutes: 30, times: 10 } })
    expect(day.spent).toBeLessThanOrEqual(1)
    expect(day.worstAhead).toBeLessThan(0.06)
  })

  it('não oscila: depois de estabilizar, o freio muda pouco de um minuto para o outro', () => {
    const { throttles } = simulateDay(4)
    let jumps = 0
    for (let minute = 400; minute < 1300; minute += 1) if (Math.abs(throttles[minute] - throttles[minute - 1]) > 0.25) jumps += 1
    expect(jumps).toBeLessThan(5)
  })
})
