import { ConfigService } from '@nestjs/config'
import { AdsPacingService } from './ads-pacing.service'
import { AdsUserStateService, type UserAdStateFromDb } from './ads-user-state.service'

/** Redis em memória com o que o estado por pessoa usa: texto, conjunto, contador, validade, pipeline e multi. */
class FakeRedis {
  strings = new Map<string, string>()
  sets = new Map<string, Set<string>>()
  ttl = new Map<string, number>()
  fail = false

  private check() {
    if (this.fail) throw new Error('Redis fora do ar')
  }
  async get(key: string) {
    this.check()
    return this.strings.get(key) ?? null
  }
  async smembers(key: string) {
    this.check()
    return [...(this.sets.get(key) ?? [])]
  }
  async incr(key: string) {
    this.check()
    const next = (Number(this.strings.get(key)) || 0) + 1
    this.strings.set(key, String(next))
    return next
  }
  async expire(key: string, seconds: number) {
    this.check()
    this.ttl.set(key, seconds)
    return 1
  }
  async del(...keys: string[]) {
    this.check()
    for (const key of keys) {
      this.strings.delete(key)
      this.sets.delete(key)
      this.ttl.delete(key)
    }
    return keys.length
  }
  pipeline() {
    const calls: (() => Promise<unknown>)[] = []
    const api = {
      get: (key: string) => (calls.push(() => this.get(key)), api),
      smembers: (key: string) => (calls.push(() => this.smembers(key)), api),
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
      del: (...keys: string[]) => (calls.push(() => keys.forEach((key) => (this.strings.delete(key), this.sets.delete(key)))), api),
      sadd: (key: string, ...members: string[]) => (calls.push(() => this.sets.set(key, new Set([...(this.sets.get(key) ?? []), ...members]))), api),
      expire: (key: string, seconds: number) => (calls.push(() => void this.ttl.set(key, seconds)), api),
      set: (key: string, value: string, _ex: string, seconds: number) => (
        calls.push(() => {
          this.strings.set(key, value)
          this.ttl.set(key, seconds)
        }),
        api
      ),
      exec: async () => {
        this.check()
        calls.forEach((call) => call())
        return []
      },
    }
    return api
  }
  disconnect() {}
}

function makeState() {
  const pacing = new AdsPacingService({ get: () => '' } as unknown as ConfigService)
  const redis = new FakeRedis()
  ;(pacing as unknown as { redis: FakeRedis }).redis = redis
  return { state: new AdsUserStateService(pacing), redis, pacing }
}

const db = (over: Partial<UserAdStateFromDb> = {}): UserAdStateFromDb => ({ hiddenCompanyIds: [], hiddenAdIds: [], impressionCounts24h: new Map(), ...over })
const loader = (value: UserAdStateFromDb) => jest.fn().mockResolvedValue(value)

describe('AdsUserStateService', () => {
  describe('sem Redis', () => {
    it('devolve null (a entrega usa o banco) e nunca lança', async () => {
      const pacing = new AdsPacingService({ get: () => '' } as unknown as ConfigService)
      const state = new AdsUserStateService(pacing)
      const load = loader(db())
      expect(await state.load('u1', ['a'], 3, load)).toBeNull()
      expect(load).not.toHaveBeenCalled()
      await expect(state.recordImpression('u1', 'a')).resolves.toBeUndefined()
      await expect(state.invalidate('u1')).resolves.toBeUndefined()
    })
  })

  describe('load', () => {
    it('sem cópia no Redis lê do banco, devolve o que o banco diz e grava a cópia', async () => {
      const { state, redis } = makeState()
      const load = loader(db({ hiddenCompanyIds: ['co-1'], hiddenAdIds: ['ad-escondido'], impressionCounts24h: new Map([['ad-a', 3], ['ad-b', 1]]) }))
      const result = await state.load('u1', ['ad-a', 'ad-b', 'ad-escondido', 'ad-c'], 3, load)
      expect(load).toHaveBeenCalledTimes(1)
      expect([...result!.hiddenCompanyIds]).toEqual(['co-1'])
      expect([...result!.excludedAdIds].sort()).toEqual(['ad-a', 'ad-escondido']) // escondido, e o que chegou ao limite de 3
      // A cópia ficou gravada, com validade.
      expect(redis.strings.get('ads:u:u1:ready')).toBe('1')
      expect(redis.ttl.get('ads:u:u1:ready')).toBe(3600)
      expect([...redis.sets.get('ads:u:u1:hc')!]).toEqual(['co-1'])
      expect(redis.strings.get('ads:u:u1:i:ad-a')).toBe('3')
      expect(redis.ttl.get('ads:u:u1:i:ad-a')).toBe(24 * 3600)
    })

    it('com a cópia pronta não vai ao banco e dá o mesmo resultado', async () => {
      const { state } = makeState()
      const first = loader(db({ hiddenCompanyIds: ['co-1'], hiddenAdIds: ['ad-escondido'], impressionCounts24h: new Map([['ad-a', 3]]) }))
      const cold = await state.load('u1', ['ad-a', 'ad-b', 'ad-escondido'], 3, first)
      const second = loader(db())
      const warm = await state.load('u1', ['ad-a', 'ad-b', 'ad-escondido'], 3, second)
      expect(second).not.toHaveBeenCalled()
      expect([...warm!.excludedAdIds].sort()).toEqual([...cold!.excludedAdIds].sort())
      expect([...warm!.hiddenCompanyIds]).toEqual([...cold!.hiddenCompanyIds])
    })

    it('limite diário: só exclui quem chegou ao máximo (2 de 3 ainda pode)', async () => {
      const { state } = makeState()
      await state.load('u1', [], 3, loader(db({ impressionCounts24h: new Map([['ad-a', 2], ['ad-b', 3], ['ad-c', 7]]) })))
      const warm = await state.load('u1', ['ad-a', 'ad-b', 'ad-c', 'ad-d'], 3, loader(db()))
      expect([...warm!.excludedAdIds].sort()).toEqual(['ad-b', 'ad-c'])
    })

    it('cópia pessoal: o estado de uma pessoa não vaza para outra', async () => {
      const { state } = makeState()
      await state.load('u1', [], 3, loader(db({ hiddenCompanyIds: ['co-1'], hiddenAdIds: ['ad-1'] })))
      const other = await state.load('u2', ['ad-1'], 3, loader(db()))
      expect(other!.hiddenCompanyIds.size).toBe(0)
      expect(other!.excludedAdIds.size).toBe(0)
    })

    it('Redis falhando: devolve null e a entrega cai para o banco', async () => {
      const { state, redis } = makeState()
      redis.fail = true
      expect(await state.load('u1', ['a'], 3, loader(db()))).toBeNull()
    })
  })

  describe('recordImpression', () => {
    it('soma no contador do anúncio e põe a validade de 24 h só na primeira', async () => {
      const { state, redis } = makeState()
      await state.recordImpression('u1', 'ad-a')
      expect(redis.ttl.get('ads:u:u1:i:ad-a')).toBe(24 * 3600)
      redis.ttl.set('ads:u:u1:i:ad-a', 1000) // passou um tempo; a janela não pode ser renovada pelas próximas
      await state.recordImpression('u1', 'ad-a')
      await state.recordImpression('u1', 'ad-a')
      expect(redis.strings.get('ads:u:u1:i:ad-a')).toBe('3')
      expect(redis.ttl.get('ads:u:u1:i:ad-a')).toBe(1000)
    })

    it('a terceira exibição já tira o anúncio da disputa dessa pessoa', async () => {
      const { state } = makeState()
      await state.load('u1', [], 3, loader(db())) // cópia pronta
      for (let run = 0; run < 3; run += 1) await state.recordImpression('u1', 'ad-a')
      expect([...(await state.load('u1', ['ad-a', 'ad-b'], 3, loader(db())))!.excludedAdIds]).toEqual(['ad-a'])
    })

    it('Redis falhando: não lança', async () => {
      const { state, redis } = makeState()
      redis.fail = true
      await expect(state.recordImpression('u1', 'ad-a')).resolves.toBeUndefined()
    })
  })

  describe('invalidate (esconder nunca reaparece)', () => {
    it('apaga a cópia da pessoa, e o próximo pedido relê o banco, que já tem o escondido', async () => {
      const { state, redis } = makeState()
      await state.load('u1', [], 3, loader(db()))
      expect(redis.strings.get('ads:u:u1:ready')).toBe('1')
      await state.invalidate('u1')
      expect(redis.strings.has('ads:u:u1:ready')).toBe(false)
      const reread = loader(db({ hiddenAdIds: ['ad-novo-escondido'], hiddenCompanyIds: ['co-9'] }))
      const result = await state.load('u1', ['ad-novo-escondido'], 3, reread)
      expect(reread).toHaveBeenCalledTimes(1)
      expect([...result!.excludedAdIds]).toEqual(['ad-novo-escondido'])
      expect([...result!.hiddenCompanyIds]).toEqual(['co-9'])
    })

    it('a releitura troca a cópia inteira: o que saiu do banco sai também do Redis', async () => {
      const { state, redis } = makeState()
      await state.load('u1', [], 3, loader(db({ hiddenCompanyIds: ['co-velho'] })))
      await state.invalidate('u1')
      await state.load('u1', [], 3, loader(db({ hiddenCompanyIds: ['co-novo'] })))
      expect([...redis.sets.get('ads:u:u1:hc')!]).toEqual(['co-novo'])
    })

    it('Redis falhando ao invalidar: não lança (a cópia vence sozinha em 1 hora)', async () => {
      const { state, redis } = makeState()
      redis.fail = true
      await expect(state.invalidate('u1')).resolves.toBeUndefined()
    })
  })
})
