import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { INITIAL_PID_STATE, PACING_PID, pacingError, pidStep, type PidState } from './pacing-controller'
import { dayElapsedFraction } from './delivery-rules'

export interface PacedAdSet {
  adSetId: string
  /** Orçamento do dia em milésimos de centavo. */
  dailyBudgetMillicents: number
}

export interface PacingView {
  /** Chance de o conjunto entrar no leilão agora (0 a 1). */
  throttle: number
  /** Gasto do dia estimado: o cobrado (banco, na última conferência) mais o que foi emprestado na entrega depois disso. */
  estimatedSpentMillicents: number
}

/** O que o Redis guarda sobre um conjunto, por dia. */
interface StoredState extends PidState {
  /** Gasto estimado no último minuto de conferência (cobrado + emprestado nos 2 minutos anteriores). */
  base: number
  /** Quando o freio foi recalculado pela última vez (ms). */
  at: number
}

const STATE_TTL_SECONDS = 36 * 3600
const COUNTERS_TTL_SECONDS = 3 * 3600
const LOCK_MS = 5_000
const MINUTE_MS = 60_000
/** Redis fora do ar: não insistimos por este tempo, a entrega usa o ritmo pelo banco. */
const BREAKER_MS = 10_000

const stateKey = (day: string, adSetId: string) => `ads:pace:${day}:${adSetId}`
const lockKey = (day: string, adSetId: string) => `ads:pace:lock:${day}:${adSetId}`
const exploreKey = (day: string, hour: number) => `ads:explore:${day}:${hour}`
const minuteField = (minute: number) => `m${minute}`

/** Contadores de exploração da hora: entregas disputadas por anúncios novos e experientes, e quantas foram para anúncio novo. */
export interface ExplorationCounters {
  total: number
  explored: number
}

/**
 * Ritmo do orçamento por minuto, com contadores no Redis (Etapa 3 do plano, 6.5).
 *
 * Em vez de consultar o banco a cada pedido e frear só depois da cobrança, cada entrega "empresta" o gasto esperado
 * (`commit`) num contador por minuto, e uma vez por minuto o controlador (`pidStep`) recalcula o freio de cada
 * conjunto comparando a curva do dia com o gasto estimado (o cobrado no banco mais o emprestado). Uma rajada de
 * pedidos é contida no mesmo minuto, antes de a cobrança chegar.
 *
 * **Nunca derruba a entrega:** qualquer falha do Redis vira `null` e quem chama usa o ritmo pelo banco (o de antes).
 */
@Injectable()
export class AdsPacingService implements OnModuleDestroy {
  private readonly logger = new Logger(AdsPacingService.name)
  private readonly redis: Redis | null
  private downUntil = 0

  constructor(config: ConfigService) {
    const url = (config.get<string>('REDIS_URL') ?? '').trim()
    this.redis = url
      ? new Redis(url, {
          maxRetriesPerRequest: 1,
          enableReadyCheck: false,
          enableOfflineQueue: false,
          connectTimeout: 500,
          commandTimeout: 200,
          retryStrategy: (times) => Math.min(times * 300, 3_000),
        })
      : null
    this.redis?.on('error', () => {
      // O Redis local pode estar parado: a entrega cai para o ritmo pelo banco (veja `withRedis`).
    })
  }

  onModuleDestroy() {
    this.redis?.disconnect()
  }

  /** Há Redis configurado e ele não falhou há pouco? */
  available(now = Date.now()): boolean {
    return !!this.redis && now >= this.downUntil
  }

  /** Roda uma operação do Redis; se falhar, abre o disjuntor e devolve `null`. Público: o estado por pessoa usa a mesma conexão. */
  async withRedis<T>(label: string, work: (redis: Redis) => Promise<T>): Promise<T | null> {
    if (!this.redis || Date.now() < this.downUntil) return null
    try {
      return await work(this.redis)
    } catch (error) {
      this.downUntil = Date.now() + BREAKER_MS
      this.logger.warn(`Redis do ritmo de anúncios falhou (${label}); a entrega usa o ritmo pelo banco por ${BREAKER_MS / 1000} s: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  /**
   * Freio e gasto estimado de cada conjunto. `loadSpent` lê o gasto cobrado (banco) só dos conjuntos cujo freio precisa
   * ser recalculado agora (uma vez por minuto cada). Devolve `null` se o Redis não está disponível.
   */
  async view(
    adSets: PacedAdSet[],
    day: string,
    now: Date,
    loadSpent: (adSetIds: string[]) => Promise<Map<string, number>>,
  ): Promise<Map<string, PacingView> | null> {
    if (!adSets.length) return new Map()
    const nowMs = now.getTime()
    const minute = Math.floor(nowMs / MINUTE_MS)
    const result = await this.withRedis('ler o ritmo', async (redis) => {
      const fields = ['thr', 'e1', 'e2', 'base', 'at', minuteField(minute), minuteField(minute - 1), minuteField(minute - 2)]
      const pipeline = redis.pipeline()
      for (const set of adSets) pipeline.hmget(stateKey(day, set.adSetId), ...fields)
      const rows = (await pipeline.exec()) ?? []

      const parsed = adSets.map((set, index) => parseRow(rows[index]?.[1] as (string | null)[] | undefined, minute, nowMs, set))
      const stale = parsed.filter((row) => row.stale).map((row) => row.set)
      const spentNow = stale.length ? await loadSpent(stale.map((set) => set.adSetId)) : new Map<string, number>()

      const out = new Map<string, PacingView>()
      for (const row of parsed) {
        let throttle = row.state.throttle
        let estimated = row.state.base + row.sinceTick
        if (row.stale) {
          const refreshed = await this.recompute(redis, row, day, now, spentNow.get(row.set.adSetId) ?? 0)
          if (refreshed) {
            throttle = refreshed.throttle
            estimated = refreshed.base
          } else if (!row.hasState) {
            // Outro processo está recalculando agora e ainda não há estado: parte do gasto cobrado, sem freio.
            estimated = spentNow.get(row.set.adSetId) ?? 0
          }
        }
        out.set(row.set.adSetId, { throttle, estimatedSpentMillicents: Math.max(0, estimated) })
      }
      return out
    })
    return result
  }

  /** Recalcula o freio de um conjunto (uma instância por minuto, pelo travamento). Devolve o novo estado ou `null` se outro processo já cuida. */
  private async recompute(redis: Redis, row: ParsedRow, day: string, now: Date, charged: number): Promise<StoredState | null> {
    const lock = await redis.set(lockKey(day, row.set.adSetId), '1', 'PX', LOCK_MS, 'NX')
    if (lock !== 'OK') return null
    const nowMs = now.getTime()
    // O que ainda não chegou ao banco: o emprestado no minuto atual e no anterior. Conta a mais de vez em quando (parte já foi
    // cobrada), e é o lado seguro: freia um pouco antes em vez de passar do orçamento.
    const estimated = charged + row.recentCommits
    const elapsedFraction = dayElapsedFraction(now)
    const error = pacingError({ estimatedSpentMillicents: estimated, dailyBudgetMillicents: row.set.dailyBudgetMillicents, elapsedFraction })
    const minutes = row.hasState ? Math.min(Math.max((nowMs - row.state.at) / MINUTE_MS, 1), 5) : 1
    const next = pidStep(row.hasState ? row.state : { ...INITIAL_PID_STATE }, error, minutes, elapsedFraction)
    const state: StoredState = { ...next, base: estimated, at: nowMs }
    const key = stateKey(day, row.set.adSetId)
    await redis
      .multi()
      .hset(key, { thr: String(state.throttle), e1: String(state.e1), e2: String(state.e2), base: String(state.base), at: String(state.at) })
      .expire(key, STATE_TTL_SECONDS)
      .exec()
    return state
  }

  /** Empresta o gasto esperado de uma entrega no contador do minuto. Nunca lança. */
  async commit(adSetId: string, day: string, now: Date, expectedMillicents: number): Promise<void> {
    if (!(expectedMillicents > 0)) return
    const key = stateKey(day, adSetId)
    await this.withRedis('emprestar gasto', (redis) =>
      redis.multi().hincrby(key, minuteField(Math.floor(now.getTime() / MINUTE_MS)), Math.round(expectedMillicents)).expire(key, STATE_TTL_SECONDS).exec(),
    )
  }

  /** Contadores da hora para o teto e o piso de exploração; `null` sem Redis. */
  async explorationCounters(day: string, hour: number): Promise<ExplorationCounters | null> {
    return this.withRedis('ler exploração', async (redis) => {
      const [total, explored] = await redis.hmget(exploreKey(day, hour), 'total', 'explored')
      return { total: Number(total) || 0, explored: Number(explored) || 0 }
    })
  }

  /** Conta uma entrega disputada entre anúncio novo e experiente, e se o vencedor era novo. Nunca lança. */
  async recordExploration(day: string, hour: number, winnerWasNew: boolean): Promise<void> {
    const key = exploreKey(day, hour)
    await this.withRedis('contar exploração', (redis) => {
      const multi = redis.multi().hincrby(key, 'total', 1)
      if (winnerWasNew) multi.hincrby(key, 'explored', 1)
      return multi.expire(key, COUNTERS_TTL_SECONDS).exec()
    })
  }
}

interface ParsedRow {
  set: PacedAdSet
  hasState: boolean
  state: StoredState
  /** Emprestado desde o último recálculo (já está no Redis, ainda não está em `base`). */
  sinceTick: number
  /** Emprestado no minuto atual e no anterior (o que ainda deve estar a caminho do banco). */
  recentCommits: number
  stale: boolean
}

function parseRow(values: (string | null)[] | undefined, minute: number, nowMs: number, set: PacedAdSet): ParsedRow {
  const [thr, e1, e2, base, at, c0, c1, c2] = values ?? []
  const hasState = thr != null && at != null
  const state: StoredState = hasState
    ? { throttle: Number(thr), e1: Number(e1) || 0, e2: Number(e2) || 0, base: Number(base) || 0, at: Number(at) }
    : { ...INITIAL_PID_STATE, base: 0, at: 0 }
  const commits = [Number(c0) || 0, Number(c1) || 0, Number(c2) || 0]
  // Janela de 1 a 2 minutos: o que provavelmente ainda não virou cobrança no banco.
  const recentCommits = commits[0] + commits[1]
  // Só os minutos depois do último recálculo (o resto já entrou em `base`).
  const tickMinute = Math.floor(state.at / MINUTE_MS)
  let sinceTick = 0
  if (hasState) for (let back = 0; back < 3; back += 1) if (minute - back >= tickMinute) sinceTick += commits[back]
  const stale = !hasState || nowMs - state.at >= PACING_PID.TICK_MS
  return { set, hasState, state, sinceTick, recentCommits, stale }
}
