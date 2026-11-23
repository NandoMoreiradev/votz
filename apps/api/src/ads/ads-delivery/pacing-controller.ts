/**
 * Ritmo do orçamento por minuto (Etapa 3 do plano, seção 6.5). Funções puras: o Redis e o relógio ficam em
 * `AdsPacingService`, para o controlador ser testado com simulações exatas.
 *
 * A ideia: para cada conjunto de anúncios existe uma curva de "quanto já deveria ter gasto" ao longo do dia. A cada
 * minuto medimos o erro (curva menos o gasto estimado, em fração do orçamento) e um controlador PI(D) em forma de
 * velocidade ajusta o `throttle`, a chance de o conjunto entrar no leilão. Gastando à frente, o freio aperta;
 * ficando para trás, solta. O freio é um número de 0 a 1 que só muda uma vez por minuto, então a entrega não
 * oscila a cada pedido.
 */

/**
 * Peso de cada hora do dia (São Paulo) no uso do Votz: madrugada baixa, pico no começo da noite. É um palpite de
 * partida: quando houver dados reais de tráfego por hora, troque por eles. Só a forma importa (é normalizada).
 */
export const DAY_TRAFFIC_WEIGHTS: readonly number[] = [
  1.0, 0.6, 0.4, 0.3, 0.3, 0.6, // 00h–05h
  1.5, 3.0, 4.5, 5.0, 5.0, 5.0, // 06h–11h
  5.5, 5.5, 5.0, 5.0, 5.0, 5.5, // 12h–17h
  7.0, 8.0, 8.0, 7.5, 6.0, 3.0, // 18h–23h
]

const WEIGHT_TOTAL = DAY_TRAFFIC_WEIGHTS.reduce((sum, weight) => sum + weight, 0)

/** Parte do gasto do dia que já deveria ter saído quando passou `elapsedFraction` (0 a 1) do dia. */
export function targetSpendFraction(elapsedFraction: number): number {
  const position = Math.min(Math.max(elapsedFraction, 0), 1) * 24
  const hour = Math.min(Math.floor(position), 23)
  const within = position - hour
  let done = 0
  for (let index = 0; index < hour; index += 1) done += DAY_TRAFFIC_WEIGHTS[index]
  done += DAY_TRAFFIC_WEIGHTS[hour] * within
  return Math.min(done / WEIGHT_TOTAL, 1)
}

export const PACING_PID = {
  /** O freio só é recalculado a cada tanto. */
  TICK_MS: 60_000,
  /** Ganho proporcional (sobre a mudança do erro). */
  KP: 3,
  /** Ganho integral (por minuto). Erro de 5% do orçamento gasto à frente solta ~0,1 de freio por minuto. */
  KI: 2,
  /** Ganho derivativo (amortece a oscilação). */
  KD: 1,
  /** O freio nunca passa de 1 (sem freio) nem cai abaixo de 0 (parado). */
  MIN_THROTTLE: 0,
  MAX_THROTTLE: 1,
  /** Depois desta fração do dia ninguém é freado: o que sobrou do orçamento pode sair. */
  END_GAME_FROM: 0.985,
  /** Passou deste tanto à frente da curva, o freio é zerado de vez (proteção contra rajada). */
  HARD_STOP_AHEAD: 0.2,
  /**
   * Quanto o freio pode mudar de um minuto para o outro. Em conjunto de orçamento pequeno, um minuto de gasto é uma parte
   * grande do dia e o erro despenca de uma vez: sem este limite o freio pularia de 1 para 0 e de volta (visto na prova real).
   */
  MAX_STEP: 0.25,
} as const

export interface PidState {
  /** Chance de o conjunto entrar no leilão agora (0 a 1). */
  throttle: number
  /** Erro do minuto anterior e do anterior a esse (fração do orçamento; positivo = atrasado em relação à curva). */
  e1: number
  e2: number
}

export const INITIAL_PID_STATE: PidState = { throttle: 1, e1: 0, e2: 0 }

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/**
 * Um passo do controlador (forma de velocidade: soma a variação ao freio atual, então não acumula "dívida" quando o
 * freio já está no limite) e limitada por `MAX_STEP`. `error` é a curva menos o gasto estimado, em fração do orçamento diário.
 */
export function pidStep(state: PidState, error: number, elapsedMinutes = 1, elapsedFraction = 0): PidState {
  if (elapsedFraction >= PACING_PID.END_GAME_FROM) return { throttle: PACING_PID.MAX_THROTTLE, e1: error, e2: state.e1 }
  // Passou muito da curva: para na hora (uma rajada de pedidos não espera o próximo minuto para ser contida).
  if (error <= -PACING_PID.HARD_STOP_AHEAD) return { throttle: PACING_PID.MIN_THROTTLE, e1: error, e2: state.e1 }
  const minutes = Math.max(elapsedMinutes, 0)
  const delta = PACING_PID.KP * (error - state.e1) + PACING_PID.KI * error * minutes + PACING_PID.KD * (error - 2 * state.e1 + state.e2)
  const step = clamp(delta, -PACING_PID.MAX_STEP, PACING_PID.MAX_STEP)
  return { throttle: clamp(state.throttle + step, PACING_PID.MIN_THROTTLE, PACING_PID.MAX_THROTTLE), e1: error, e2: state.e1 }
}

/** Erro do controlador: o que a curva diz que já deveria ter saído menos o que saiu (estimado), em fração do orçamento. */
export function pacingError(input: { estimatedSpentMillicents: number; dailyBudgetMillicents: number; elapsedFraction: number }): number {
  if (input.dailyBudgetMillicents <= 0) return -1
  return targetSpendFraction(input.elapsedFraction) - input.estimatedSpentMillicents / input.dailyBudgetMillicents
}

/**
 * Gasto esperado de uma entrega, em milésimos de centavo, que o ritmo "empresta" na hora da entrega (a cobrança só
 * chega quando a pessoa vê o anúncio ou clica, segundos ou minutos depois). Anúncio cobrado por exibição vista conta
 * o preço vezes a chance de ele ser visto; cobrado por clique, o preço vezes a chance de clique.
 */
export function expectedSpendMillicents(input: { chargeMillicents: number; chargeOn: 'VIEWABLE_IMPRESSION' | 'CLICK'; viewableRate: number; clickRate: number }): number {
  const chance = input.chargeOn === 'CLICK' ? input.clickRate : input.viewableRate
  return Math.max(0, Math.round(input.chargeMillicents * clamp(chance, 0, 1)))
}

/** Chance de uma entrega ser vista, medida no anúncio e suavizada com um valor de partida (anúncio novo usa o de partida). */
export const VIEWABLE_PRIOR = { RATE: 0.6, STRENGTH: 50 } as const

export function viewableRate(viewable: number, impressions: number): number {
  const seen = Math.max(impressions || 0, 0)
  const seenViewable = Math.min(Math.max(viewable || 0, 0), seen)
  return (VIEWABLE_PRIOR.RATE * VIEWABLE_PRIOR.STRENGTH + seenViewable) / (VIEWABLE_PRIOR.STRENGTH + seen)
}
