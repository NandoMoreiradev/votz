import { AdsViewerCacheService, viewerFactsFromRow, type ViewerFacts } from './ads-viewer-cache.service'

/** Redis de mentira, na memória, só com o que o cache usa. `failing` faz tudo dar erro (Redis fora do ar). */
const store = new Map<string, string>()
let failing = false
const calls: string[] = []

jest.mock('ioredis', () => {
  class FakeRedis {
    on() {
      return this
    }
    disconnect() {}
    private check(op: string) {
      calls.push(op)
      if (failing) throw new Error('Redis fora do ar')
    }
    async get(key: string) {
      this.check('get')
      return store.get(key) ?? null
    }
    async set(key: string, value: string) {
      this.check('set')
      store.set(key, value)
      return 'OK'
    }
    async del(...keys: string[]) {
      this.check('del')
      keys.forEach((key) => store.delete(key))
      return keys.length
    }
    multi() {
      const steps: Array<() => void> = []
      const chain = {
        set: (key: string, value: string) => (steps.push(() => store.set(key, value)), chain),
        del: (...keys: string[]) => (steps.push(() => keys.forEach((key) => store.delete(key))), chain),
        exec: async () => {
          this.check('multi')
          steps.forEach((step) => step())
          return []
        },
      }
      return chain
    }
  }
  return { __esModule: true, default: FakeRedis }
})

const config = (values: Record<string, string> = { REDIS_URL: 'redis://fake' }) => ({ get: (key: string) => values[key] }) as never

const facts = (over: Partial<ViewerFacts> = {}): ViewerFacts => ({
  city: 'Campinas',
  state: 'SP',
  consented: true,
  interests: ['food-drink'],
  ageBand: '25-34',
  minor: false,
  gender: null,
  ...over,
})

beforeEach(() => {
  store.clear()
  calls.length = 0
  failing = false
})

describe('viewerFactsFromRow', () => {
  const now = new Date('2026-11-22T12:00:00Z')

  it('guarda só a faixa de idade, nunca a data de nascimento', () => {
    const result = viewerFactsFromRow(
      { city: 'Campinas', state: 'SP', birthDate: new Date('1996-05-10T00:00:00Z'), gender: 'FEMALE', adPreference: { personalizationConsent: true, interests: ['food-drink'] } },
      now,
    )
    expect(result).toEqual({ city: 'Campinas', state: 'SP', consented: true, interests: ['food-drink'], ageBand: '25-34', minor: false, gender: 'FEMALE' })
    expect(JSON.stringify(result)).not.toContain('1996')
  })

  it('menor de 18 anos fica marcado e sem faixa', () => {
    const result = viewerFactsFromRow({ city: null, state: null, birthDate: new Date('2010-01-01T00:00:00Z'), gender: null, adPreference: { personalizationConsent: true, interests: [] } }, now)
    expect(result.minor).toBe(true)
    expect(result.ageBand).toBeNull()
  })

  it('sem preferência salva, o padrão é sem aceite e sem interesses', () => {
    const result = viewerFactsFromRow({ city: null, state: null, birthDate: null, gender: null, adPreference: null }, now)
    expect(result).toMatchObject({ consented: false, interests: [], ageBand: null, minor: false })
  })
})

describe('AdsViewerCacheService', () => {
  it('a segunda leitura vem da cópia e não vai ao banco', async () => {
    const cache = new AdsViewerCacheService(config())
    const load = jest.fn().mockResolvedValue(facts())
    expect(await cache.get('u1', load)).toEqual(facts())
    expect(await cache.get('u1', load)).toEqual(facts())
    expect(load).toHaveBeenCalledTimes(1)
    expect(cache.hits).toBe(1)
    expect(cache.misses).toBe(1)
  })

  it('invalidar faz a próxima leitura ir ao banco (retirar o aceite vale na hora)', async () => {
    const cache = new AdsViewerCacheService(config())
    const load = jest.fn().mockResolvedValueOnce(facts({ consented: true })).mockResolvedValueOnce(facts({ consented: false }))
    expect((await cache.get('u1', load))?.consented).toBe(true)
    await cache.invalidate('u1')
    expect((await cache.get('u1', load))?.consented).toBe(false)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('leitura que já estava em andamento quando a pessoa mudou não regrava a cópia velha', async () => {
    const cache = new AdsViewerCacheService(config())
    let release: (value: ViewerFacts) => void = () => undefined
    const slowLoad = () => new Promise<ViewerFacts>((resolve) => (release = resolve))
    const pending = cache.get('u1', slowLoad)
    await new Promise((resolve) => setTimeout(resolve, 5))
    await cache.invalidate('u1') // a pessoa retirou o aceite enquanto a leitura velha ainda corria
    release(facts({ consented: true }))
    expect((await pending)?.consented).toBe(true) // quem pediu antes recebe o que leu...
    const fresh = jest.fn().mockResolvedValue(facts({ consented: false }))
    expect((await cache.get('u1', fresh))?.consented).toBe(false) // ...mas a cópia velha não ficou guardada
    expect(fresh).toHaveBeenCalledTimes(1)
  })

  it('pessoa que não existe não é guardada', async () => {
    const cache = new AdsViewerCacheService(config())
    const load = jest.fn().mockResolvedValue(null)
    expect(await cache.get('ghost', load)).toBeNull()
    expect(await cache.get('ghost', load)).toBeNull()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('Redis fora do ar: lê do banco e a entrega segue', async () => {
    failing = true
    const cache = new AdsViewerCacheService(config())
    const load = jest.fn().mockResolvedValue(facts())
    expect(await cache.get('u1', load)).toEqual(facts())
    await expect(cache.invalidate('u1')).resolves.toBeUndefined()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('cópia ilegível é ignorada e relida do banco', async () => {
    store.set('ads:vf:u1', '{isso não é json')
    const cache = new AdsViewerCacheService(config())
    const load = jest.fn().mockResolvedValue(facts())
    expect(await cache.get('u1', load)).toEqual(facts())
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('validade 0 desliga a cópia (não abre conexão)', async () => {
    const cache = new AdsViewerCacheService(config({ REDIS_URL: 'redis://fake', ADS_VIEWER_CACHE_TTL_SECONDS: '0' }))
    const load = jest.fn().mockResolvedValue(facts())
    await cache.get('u1', load)
    await cache.get('u1', load)
    expect(load).toHaveBeenCalledTimes(2)
    expect(calls).toEqual([])
  })

  it('sem Redis configurado, sempre lê do banco', async () => {
    const cache = new AdsViewerCacheService(config({}))
    const load = jest.fn().mockResolvedValue(facts())
    await cache.get('u1', load)
    await cache.get('u1', load)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
