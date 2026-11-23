import { ConfigService } from '@nestjs/config'
import { AdsPacingService } from './ads-pacing.service'

/** Redis em memória com só o que o ritmo usa: hash, travamento (SET NX PX), pipeline e multi. */
class FakeRedis {
  hashes = new Map<string, Map<string, string>>()
  locks = new Set<string>()
  fail = false
  expirations: Record<string, number> = {}

  private hash(key: string) {
    if (!this.hashes.has(key)) this.hashes.set(key, new Map())
    return this.hashes.get(key)!
  }
  private check() {
    if (this.fail) throw new Error('Redis fora do ar')
  }

  async hmget(key: string, ...fields: string[]) {
    this.check()
    const hash = this.hashes.get(key)
    return fields.map((field) => hash?.get(field) ?? null)
  }
  async set(key: string, _value: string, _px: string, _ms: number, _nx: string) {
    this.check()
    if (this.locks.has(key)) return null
    this.locks.add(key)
    return 'OK'
  }
  pipeline() {
    const calls: (() => Promise<unknown>)[] = []
    const api = {
      hmget: (key: string, ...fields: string[]) => {
        calls.push(() => this.hmget(key, ...fields))
        return api
      },
      exec: async () => {
        this.check()
        const out: [null, unknown][] = []
        for (const call of calls) out.push([null, await call()])
        return out
      },
    }
    return api
  }
  multi() {
    const calls: (() => void)[] = []
    const api = {
      hset: (key: string, values: Record<string, string>) => {
        calls.push(() => Object.entries(values).forEach(([field, value]) => this.hash(key).set(field, value)))
        return api
      },
      hincrby: (key: string, field: string, by: number) => {
        calls.push(() => this.hash(key).set(field, String((Number(this.hash(key).get(field)) || 0) + by)))
        return api
      },
      expire: (key: string, seconds: number) => {
        calls.push(() => {
          this.expirations[key] = seconds
        })
        return api
      },
      exec: async () => {
        this.check()
        calls.forEach((call) => call())
        return []
      },
    }
    return api
  }
  /** O travamento real expira em 5 s; entre um minuto e o seguinte já terá expirado. */
  expireLocks() {
    this.locks.clear()
  }
  disconnect() {}
}

const DAY = '2026-11-22'
// 12:00 UTC = 9h em São Paulo.
const NOW = new Date('2026-11-22T12:00:00Z')
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000)
const SET = { adSetId: 'set-1', dailyBudgetMillicents: 1_000_000 }

function makeService() {
  const service = new AdsPacingService({ get: () => '' } as unknown as ConfigService)
  const redis = new FakeRedis()
  ;(service as unknown as { redis: FakeRedis }).redis = redis
  return { service, redis }
}

const spentOf = (value: number) => jest.fn().mockResolvedValue(new Map([['set-1', value]]))

describe('AdsPacingService', () => {
  describe('sem Redis', () => {
    it('devolve null em tudo, para a entrega usar o ritmo pelo banco', async () => {
      const service = new AdsPacingService({ get: () => '' } as unknown as ConfigService)
      expect(service.available()).toBe(false)
      expect(await service.view([SET], DAY, NOW, spentOf(0))).toBeNull()
      await expect(service.commit('set-1', DAY, NOW, 500)).resolves.toBeUndefined()
      expect(await service.explorationCounters(DAY, 9)).toBeNull()
      await expect(service.recordExploration(DAY, 9, true)).resolves.toBeUndefined()
    })
  })

  describe('view', () => {
    it('lista vazia não toca no Redis', async () => {
      const { service, redis } = makeService()
      redis.fail = true
      expect(await service.view([], DAY, NOW, spentOf(0))).toEqual(new Map())
    })

    it('primeira vez: lê o gasto cobrado no banco, parte sem freio e guarda o estado', async () => {
      const { service, redis } = makeService()
      const load = spentOf(10_000)
      const view = await service.view([SET], DAY, NOW, load)
      expect(load).toHaveBeenCalledWith(['set-1'])
      expect(view?.get('set-1')).toEqual({ throttle: 1, estimatedSpentMillicents: 10_000 })
      const stored = redis.hashes.get(`ads:pace:${DAY}:set-1`)!
      expect(stored.get('thr')).toBe('1')
      expect(stored.get('base')).toBe('10000')
      expect(redis.expirations[`ads:pace:${DAY}:set-1`]).toBe(36 * 3600)
    })

    it('no mesmo minuto não lê o banco de novo (uma conferência por minuto)', async () => {
      const { service } = makeService()
      const load = spentOf(0)
      await service.view([SET], DAY, NOW, load)
      await service.view([SET], DAY, at(20), load)
      await service.view([SET], DAY, at(45), load)
      expect(load).toHaveBeenCalledTimes(1)
    })

    it('o que foi emprestado na entrega entra no gasto estimado na hora, sem esperar a cobrança', async () => {
      const { service } = makeService()
      await service.view([SET], DAY, NOW, spentOf(0))
      await service.commit('set-1', DAY, at(5), 120_000)
      await service.commit('set-1', DAY, at(10), 30_000)
      const view = await service.view([SET], DAY, at(15), spentOf(0))
      expect(view?.get('set-1')?.estimatedSpentMillicents).toBe(150_000)
    })

    it('rajada: depois de gastar muito à frente da curva, o próximo minuto aperta o freio', async () => {
      const { service, redis } = makeService()
      await service.view([SET], DAY, NOW, spentOf(0))
      // A curva das 9h está em ~12% do orçamento; o conjunto já "emprestou" 40%.
      await service.commit('set-1', DAY, at(30), 400_000)
      redis.expireLocks()
      const next = await service.view([SET], DAY, at(61), spentOf(0))
      expect(next?.get('set-1')?.throttle).toBeLessThan(0.5)
      expect(next?.get('set-1')?.estimatedSpentMillicents).toBeGreaterThanOrEqual(400_000)
    })

    it('gastando muito menos que a curva, o freio fica solto', async () => {
      const { service, redis } = makeService()
      await service.view([SET], DAY, NOW, spentOf(0))
      redis.expireLocks()
      const next = await service.view([SET], DAY, at(61), spentOf(1_000))
      expect(next?.get('set-1')?.throttle).toBe(1)
    })

    it('duas instâncias no mesmo minuto: só uma recalcula (travamento), a outra usa o estado', async () => {
      const { service, redis } = makeService()
      redis.locks.add(`ads:pace:lock:${DAY}:set-1`) // outro processo já está recalculando
      const view = await service.view([SET], DAY, NOW, spentOf(7_000))
      expect(redis.hashes.get(`ads:pace:${DAY}:set-1`)).toBeUndefined() // não gravou
      expect(view?.get('set-1')).toEqual({ throttle: 1, estimatedSpentMillicents: 7_000 })
    })

    it('cada conjunto tem o seu freio e o seu gasto', async () => {
      const { service, redis } = makeService()
      const other = { adSetId: 'set-2', dailyBudgetMillicents: 1_000_000 }
      await service.view([SET, other], DAY, NOW, jest.fn().mockResolvedValue(new Map()))
      await service.commit('set-1', DAY, at(10), 900_000)
      redis.expireLocks()
      const next = await service.view([SET, other], DAY, at(61), jest.fn().mockResolvedValue(new Map()))
      expect(next?.get('set-1')?.throttle).toBeLessThan(next!.get('set-2')!.throttle)
    })

    it('dia novo começa do zero (a chave tem o dia)', async () => {
      const { service } = makeService()
      await service.view([SET], DAY, NOW, spentOf(500_000))
      const tomorrow = await service.view([SET], '2026-11-23', new Date('2026-11-23T12:00:00Z'), spentOf(0))
      expect(tomorrow?.get('set-1')).toEqual({ throttle: 1, estimatedSpentMillicents: 0 })
    })
  })

  describe('commit', () => {
    it('valor zero ou negativo não grava', async () => {
      const { service, redis } = makeService()
      await service.commit('set-1', DAY, NOW, 0)
      await service.commit('set-1', DAY, NOW, -5)
      expect(redis.hashes.size).toBe(0)
    })
    it('soma no contador do minuto e renova a validade', async () => {
      const { service, redis } = makeService()
      await service.commit('set-1', DAY, NOW, 300)
      await service.commit('set-1', DAY, at(10), 200)
      const fields = [...redis.hashes.get(`ads:pace:${DAY}:set-1`)!.entries()]
      expect(fields).toHaveLength(1)
      expect(fields[0][1]).toBe('500')
    })
  })

  describe('Redis falhando', () => {
    it('devolve null, abre o disjuntor e não insiste por alguns segundos', async () => {
      const { service, redis } = makeService()
      redis.fail = true
      expect(await service.view([SET], DAY, NOW, spentOf(0))).toBeNull()
      expect(service.available()).toBe(false)
      redis.fail = false // mesmo com o Redis de volta, o disjuntor segura um pouco
      expect(await service.view([SET], DAY, NOW, spentOf(0))).toBeNull()
      expect(await service.explorationCounters(DAY, 9)).toBeNull()
    })
    it('commit e contadores de exploração também nunca lançam', async () => {
      const { service, redis } = makeService()
      redis.fail = true
      await expect(service.commit('set-1', DAY, NOW, 100)).resolves.toBeUndefined()
      await expect(service.recordExploration(DAY, 9, true)).resolves.toBeUndefined()
    })
  })

  describe('exploração por hora', () => {
    it('conta entregas disputadas e as que foram para anúncio novo', async () => {
      const { service, redis } = makeService()
      await service.recordExploration(DAY, 9, false)
      await service.recordExploration(DAY, 9, true)
      await service.recordExploration(DAY, 9, false)
      expect(await service.explorationCounters(DAY, 9)).toEqual({ total: 3, explored: 1 })
      expect(await service.explorationCounters(DAY, 10)).toEqual({ total: 0, explored: 0 })
      expect(redis.expirations[`ads:explore:${DAY}:9`]).toBe(3 * 3600)
    })
  })
})
