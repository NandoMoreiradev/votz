import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { ageBandOf, ageOn, type AgeBand } from '@votz/shared-types'

/**
 * O que a entrega de anúncios usa do cadastro da pessoa. **Já derivado:** a data de nascimento nunca entra aqui, só a
 * faixa de idade (e se é menor de idade), então a cópia no Redis não guarda dado que a entrega não precisaria.
 */
export interface ViewerFacts {
  city: string | null
  state: string | null
  /** Aceitou os anúncios personalizados. Menor de idade nunca é perfilado, mesmo com aceite (decidido em `buildViewer`). */
  consented: boolean
  interests: string[]
  ageBand: AgeBand | null
  /** A data de nascimento indica menos de 18 anos. */
  minor: boolean
  gender: string | null
}

/** O que a leitura do banco devolve (a mesma consulta de `AdsDeliveryRepository.findViewerFacts`). */
export interface ViewerRow {
  city: string | null
  state: string | null
  birthDate: Date | null
  gender: string | null
  adPreference: { personalizationConsent: boolean; interests: string[] } | null
}

export function viewerFactsFromRow(row: ViewerRow, now = new Date()): ViewerFacts {
  const age = row.birthDate ? ageOn(row.birthDate, now) : null
  return {
    city: row.city,
    state: row.state,
    consented: row.adPreference?.personalizationConsent === true,
    interests: row.adPreference?.interests ?? [],
    ageBand: ageBandOf(row.birthDate, now),
    minor: age !== null && age < 18,
    gender: row.gender,
  }
}

const DEFAULT_TTL_SECONDS = 120
/** Redis fora do ar: não insistimos por este tempo e a entrega lê o cadastro do banco. */
const BREAKER_MS = 10_000
/** Marca de "mudou agora": impede que uma leitura que já estava em andamento grave a cópia velha por cima da invalidação. */
const TOMBSTONE_SECONDS = 10
const RACE_MARGIN_MS = 1_000

const factsKey = (userId: string) => `ads:vf:${userId}`
const tombstoneKey = (userId: string) => `ads:vf:${userId}:inv`

/**
 * Cadastro da pessoa (cidade, estado, faixa de idade, gênero, aceite e interesses) numa **cópia curta** no Redis, para o
 * pedido de anúncio não ir ao banco a cada exibição (Etapa 3 do plano, depois do teste de carga).
 *
 * **O banco é a fonte da verdade.** Regras que não podem falhar:
 * - Mudou o perfil ou o aceite: quem grava chama `invalidate` e a próxima leitura vai ao banco. Retirar o aceite dos
 *   anúncios personalizados continua valendo na hora, em qualquer instância (o Redis é compartilhado).
 * - Uma leitura que começou antes da mudança não regrava a cópia velha (marca de "mudou agora").
 * - A cópia vence em poucos minutos (`ADS_VIEWER_CACHE_TTL_SECONDS`, padrão 120; 0 desliga), então qualquer desvio se
 *   corrige sozinho. Pessoa que não existe nunca é guardada.
 * - Redis fora do ar, sem Redis ou cópia ilegível: lê do banco, como antes. **Nunca derruba a entrega.**
 * - A cópia só tem o que a entrega usa e já derivado (sem data de nascimento) e some sozinha.
 */
@Injectable()
export class AdsViewerCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(AdsViewerCacheService.name)
  private readonly redis: Redis | null
  private readonly ttlSeconds: number
  private downUntil = 0
  /** Quantas leituras vieram da cópia e quantas do banco (para conferir o efeito). */
  hits = 0
  misses = 0

  constructor(config: ConfigService) {
    const url = (config.get<string>('REDIS_URL') ?? '').trim()
    const raw = Number(config.get<string>('ADS_VIEWER_CACHE_TTL_SECONDS'))
    this.ttlSeconds = Number.isFinite(raw) && String(config.get<string>('ADS_VIEWER_CACHE_TTL_SECONDS') ?? '').trim() !== '' && raw >= 0 ? Math.floor(raw) : DEFAULT_TTL_SECONDS
    this.redis =
      url && this.ttlSeconds > 0
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
      // O Redis local pode estar parado: a entrega lê o cadastro do banco (veja `withRedis`).
    })
  }

  onModuleDestroy() {
    this.redis?.disconnect()
  }

  /** O cadastro da pessoa, da cópia se estiver fresca, senão de `load` (o banco). `null` se a pessoa não existe. */
  async get(userId: string, load: () => Promise<ViewerFacts | null>): Promise<ViewerFacts | null> {
    const startedAt = Date.now()
    const cached = await this.withRedis('ler o cadastro da pessoa', (redis) => redis.get(factsKey(userId)))
    if (cached) {
      const parsed = parseFacts(cached)
      if (parsed) {
        this.hits += 1
        return parsed
      }
    }
    this.misses += 1
    const facts = await load()
    if (facts) await this.store(userId, facts, startedAt)
    return facts
  }

  /** O cadastro ou o aceite da pessoa mudou: apaga a cópia. Nunca lança. */
  async invalidate(userId: string): Promise<void> {
    await this.withRedis('apagar o cadastro da pessoa', async (redis) => {
      const multi = redis.multi()
      multi.set(tombstoneKey(userId), String(Date.now()), 'EX', TOMBSTONE_SECONDS)
      multi.del(factsKey(userId))
      await multi.exec()
    })
  }

  private async store(userId: string, facts: ViewerFacts, startedAt: number): Promise<void> {
    await this.withRedis('guardar o cadastro da pessoa', async (redis) => {
      const changedAt = Number(await redis.get(tombstoneKey(userId)))
      // Mudou depois de a leitura começar: o que lemos pode estar velho, não guarda.
      if (Number.isFinite(changedAt) && changedAt > 0 && changedAt >= startedAt - RACE_MARGIN_MS) return
      await redis.set(factsKey(userId), JSON.stringify(facts), 'EX', this.ttlSeconds)
    })
  }

  private async withRedis<T>(label: string, work: (redis: Redis) => Promise<T>): Promise<T | null> {
    if (!this.redis || Date.now() < this.downUntil) return null
    try {
      return await work(this.redis)
    } catch (error) {
      this.downUntil = Date.now() + BREAKER_MS
      this.logger.warn(`Redis do cadastro de anúncios falhou (${label}); a entrega lê do banco por ${BREAKER_MS / 1000} s: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }
}

function parseFacts(raw: string): ViewerFacts | null {
  try {
    const value = JSON.parse(raw) as Partial<ViewerFacts>
    if (typeof value !== 'object' || value === null || typeof value.consented !== 'boolean' || typeof value.minor !== 'boolean' || !Array.isArray(value.interests)) return null
    return {
      city: value.city ?? null,
      state: value.state ?? null,
      consented: value.consented,
      interests: value.interests.filter((item): item is string => typeof item === 'string'),
      ageBand: (value.ageBand ?? null) as AgeBand | null,
      minor: value.minor,
      gender: value.gender ?? null,
    }
  } catch {
    return null
  }
}
