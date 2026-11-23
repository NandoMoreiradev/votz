import { Injectable } from '@nestjs/common'
import { AdsPacingService } from './ads-pacing.service'

/** O que a entrega precisa saber sobre a pessoa para tirar anúncios da disputa. */
export interface UserAdState {
  /** Empresas que a pessoa pediu para não ver mais ("não ver mais anúncios de..."). */
  hiddenCompanyIds: Set<string>
  /** Anúncios que a pessoa escondeu, mais os que ela já viu o máximo de vezes nas últimas 24 horas. */
  excludedAdIds: Set<string>
}

/** O que o banco diz (a fonte da verdade), lido só quando o Redis não tem o estado da pessoa. */
export interface UserAdStateFromDb {
  hiddenCompanyIds: string[]
  hiddenAdIds: string[]
  /** Exibições de cada anúncio para a pessoa nas últimas 24 horas. */
  impressionCounts24h: Map<string, number>
}

/** A cópia no Redis é relida do banco depois deste tempo (e sempre que a pessoa esconde algo). */
const READY_TTL_SECONDS = 3600
/** Janela do limite diário. */
const COUNTER_TTL_SECONDS = 24 * 3600

const readyKey = (userId: string) => `ads:u:${userId}:ready`
const companiesKey = (userId: string) => `ads:u:${userId}:hc`
const hiddenAdsKey = (userId: string) => `ads:u:${userId}:ha`
const counterKey = (userId: string, adId: string) => `ads:u:${userId}:i:${adId}`

/**
 * Estado por pessoa da entrega (escondidos e limite diário de exibições) numa cópia no Redis, para o pedido de anúncio
 * não ir ao banco três vezes (Etapa 3 do plano, depois do teste de carga).
 *
 * **O banco é a fonte da verdade e o Redis é só cópia.** Regras que não podem falhar:
 * - Anúncio ou empresa escondida **nunca reaparece**: ao esconder, a cópia da pessoa é apagada (`invalidate`) e o próximo
 *   pedido relê tudo do banco, em vez de confiar numa atualização parcial.
 * - Cópia que faltou (Redis reiniciado, pessoa nova, validade vencida) é carregada do banco antes de valer. Nunca se
 *   decide com cópia incompleta.
 * - A cópia vence em 1 hora, então qualquer desvio se corrige sozinho, e some depois de a pessoa sair (sem dado pessoal além
 *   de ids de anúncio e empresa). Os contadores de exibição vencem em 24 horas.
 * - Redis fora do ar ou sem Redis: devolve `null` e a entrega usa as consultas ao banco, como antes.
 *
 * Usa a mesma conexão e o mesmo disjuntor do ritmo do orçamento (\`AdsPacingService\`).
 */
@Injectable()
export class AdsUserStateService {
  constructor(private readonly redis: AdsPacingService) {}

  /**
   * Escondidos e limite diário da pessoa para os anúncios que estão na disputa. `loadFromDb` só roda quando o Redis não
   * tem a cópia (uma vez por hora por pessoa ativa). `null` se o Redis não está disponível.
   */
  async load(userId: string, poolAdIds: string[], maxPerDay: number, loadFromDb: () => Promise<UserAdStateFromDb>): Promise<UserAdState | null> {
    return this.redis.withRedis('ler o estado da pessoa', async (redis) => {
      const pipeline = redis.pipeline()
      pipeline.get(readyKey(userId))
      pipeline.smembers(companiesKey(userId))
      pipeline.smembers(hiddenAdsKey(userId))
      for (const adId of poolAdIds) pipeline.get(counterKey(userId, adId))
      const rows = (await pipeline.exec()) ?? []

      if (rows[0]?.[1] === '1') {
        const hiddenCompanyIds = new Set((rows[1]?.[1] as string[]) ?? [])
        const excludedAdIds = new Set((rows[2]?.[1] as string[]) ?? [])
        poolAdIds.forEach((adId, index) => {
          if ((Number(rows[3 + index]?.[1]) || 0) >= maxPerDay) excludedAdIds.add(adId)
        })
        return { hiddenCompanyIds, excludedAdIds }
      }

      // Sem cópia: vale o banco, e a cópia é gravada para os próximos pedidos.
      const db = await loadFromDb()
      const multi = redis.multi()
      multi.del(companiesKey(userId), hiddenAdsKey(userId))
      if (db.hiddenCompanyIds.length) multi.sadd(companiesKey(userId), ...db.hiddenCompanyIds)
      if (db.hiddenAdIds.length) multi.sadd(hiddenAdsKey(userId), ...db.hiddenAdIds)
      multi.expire(companiesKey(userId), READY_TTL_SECONDS)
      multi.expire(hiddenAdsKey(userId), READY_TTL_SECONDS)
      for (const [adId, count] of db.impressionCounts24h) multi.set(counterKey(userId, adId), String(count), 'EX', COUNTER_TTL_SECONDS)
      // O "pronto" vai por último: só vale depois de tudo gravado.
      multi.set(readyKey(userId), '1', 'EX', READY_TTL_SECONDS)
      await multi.exec()

      const excludedAdIds = new Set(db.hiddenAdIds)
      for (const [adId, count] of db.impressionCounts24h) if (count >= maxPerDay) excludedAdIds.add(adId)
      return { hiddenCompanyIds: new Set(db.hiddenCompanyIds), excludedAdIds }
    })
  }

  /** Conta uma exibição entregue (a janela de 24 horas começa na primeira). Nunca lança. */
  async recordImpression(userId: string, adId: string): Promise<void> {
    const key = counterKey(userId, adId)
    await this.redis.withRedis('contar exibição da pessoa', async (redis) => {
      const count = await redis.incr(key)
      if (count === 1) await redis.expire(key, COUNTER_TTL_SECONDS)
    })
  }

  /**
   * A pessoa escondeu um anúncio ou uma empresa: apaga a cópia dela. O próximo pedido relê do banco, que já tem o
   * "escondido", então nada reaparece. Nunca lança; se o Redis estiver fora, a cópia vence sozinha em até 1 hora e,
   * enquanto isso, o Redis fora do ar significa que a entrega está usando o banco.
   */
  async invalidate(userId: string): Promise<void> {
    await this.redis.withRedis('apagar o estado da pessoa', (redis) => redis.del(readyKey(userId), companiesKey(userId), hiddenAdsKey(userId)))
  }
}
