import { AdsDeliveryService } from './ads-delivery.service'
import { isHoldout } from './delivery-rules'
import { viewerFactsFromRow } from '../ads-viewer/ads-viewer-cache.service'

const NOW = new Date('2026-11-22T12:00:00Z')
const USER = (() => {
  for (let index = 0; index < 100; index += 1) if (!isHoldout(`u-${index}`, 0.05)) return `u-${index}`
  throw new Error('sem usuário fora do grupo de controle')
})()
const HELD_OUT = (() => {
  for (let index = 0; index < 1000; index += 1) if (isHoldout(`h-${index}`, 0.05)) return `h-${index}`
  throw new Error('sem usuário no grupo de controle')
})()

function ad(id: string, over: Record<string, unknown> = {}, account: Record<string, unknown> = {}) {
  return {
    id,
    adSetId: `set-${id}`,
    creative: { headline: `Anúncio ${id}`, body: 'Quente', ctaLabel: 'Saiba mais', destinationUrl: 'https://padaria.example/', media: [] },
    adSet: {
      dailyBudgetCents: 1000,
      bidCapCents: null,
      states: [],
      cities: [],
      interests: [],
      ageBands: [],
      genders: [],
      automaticAudience: false,
      campaign: { objective: 'AWARENESS', account: { id: 'acc-1', balanceCents: 5000, pendingSpendMillicents: 0, companyId: 'co-1', company: { id: 'co-1', tradeName: id, username: id, logoUrl: null }, ...account } },
      ...over,
    },
  }
}

function makeRepo(pool: unknown[], viewer: Record<string, unknown> = {}) {
  return {
    findViewerFacts: jest.fn().mockResolvedValue({ city: 'Campinas', state: 'SP', birthDate: null, gender: null, adPreference: null, ...viewer }),
    hiddenCompanyIds: jest.fn().mockResolvedValue([]),
    hiddenAdIds: jest.fn().mockResolvedValue([]),
    impressionCounts: jest.fn().mockResolvedValue(new Map()),
    excludedAdIds: jest.fn().mockResolvedValue([]),
    findCandidates: jest.fn().mockResolvedValue(pool),
    spentTodayByAdSet: jest.fn().mockResolvedValue(new Map()),
    clickStatsByAd: jest.fn().mockResolvedValue(new Map()),
    platformClickStats: jest.fn().mockResolvedValue({ viewable: 0, clicks: 0 }),
    advertiserStats: jest.fn().mockResolvedValue(new Map()),
    createImpression: jest.fn().mockResolvedValue({ id: 'imp-1' }),
  }
}

const storage = { getPublicUrl: (key: string) => `https://cdn.test/${key}` }
const links = { build: (token: string) => `https://votz.test/c/${token}` }
const adjacency = { companiesTargetedNear: jest.fn().mockResolvedValue([]) }
const query = { surface: 'FEED_FOR_YOU' as const, position: 3 }
const middle = () => 0.5
const configOf = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as never
const delivery = (repo: ReturnType<typeof makeRepo>, values: Record<string, string> = { ADS_DELIVERY_DEBUG: 'true' }, viewerCache?: unknown) =>
  new AdsDeliveryService(repo as never, storage as never, links as never, adjacency as never, undefined, configOf(values), undefined, viewerCache as never)

describe('por que ninguém ganhou (desenvolvimento)', () => {
  it('diz quando não há anúncio nenhum liberado no banco', async () => {
    const { ad: result, reason } = await delivery(makeRepo([])).nextWithReason(USER, query, NOW, middle)
    expect(result).toBeNull()
    expect(reason).toMatch(/nenhum anúncio pode ser entregue/)
  })

  it('aponta o público que não bate (faixa de idade sem data de nascimento)', async () => {
    const targeted = ad('a', { ageBands: ['25-34'] })
    const { reason } = await delivery(makeRepo([targeted])).nextWithReason(USER, query, NOW, middle)
    expect(reason).toMatch(/Anúncio a/)
    expect(reason).toMatch(/público não bate/)
    // sem aceite, o motivo é o aceite, não a idade
    expect(reason).toMatch(/não ligou os anúncios personalizados/)
  })

  it('com aceite mas sem data de nascimento, diz que falta a data', async () => {
    const targeted = ad('a', { ageBands: ['25-34'] })
    const repo = makeRepo([targeted], { adPreference: { personalizationConsent: true, interests: [] } })
    const { reason } = await delivery(repo).nextWithReason(USER, query, NOW, middle)
    expect(reason).toMatch(/faixa de idade \(sem data de nascimento\) fora de 25-34/)
  })

  it('aponta cidade fora do alvo e conta sem saldo', async () => {
    const { reason } = await delivery(makeRepo([ad('a', { cities: ['Santos'] }), ad('b', {}, { balanceCents: 0 })])).nextWithReason(USER, { ...query, city: 'Campinas' }, NOW, middle)
    expect(reason).toMatch(/cidade Campinas fora de santos/)
    expect(reason).toMatch(/a conta não tem saldo/)
  })

  it('sem aceite, a cidade do cadastro não vale: só a da tela (explica o "sem cidade")', async () => {
    const { reason } = await delivery(makeRepo([ad('a', { cities: ['Campinas'] })])).nextWithReason(USER, query, NOW, middle)
    expect(reason).toMatch(/cidade \(sem cidade\) fora de campinas/)
  })

  it('aponta o grupo de controle', async () => {
    const { reason } = await delivery(makeRepo([ad('a')])).nextWithReason(HELD_OUT, query, NOW, middle)
    expect(reason).toMatch(/grupo de controle/)
  })

  it('quando entrega, não há motivo', async () => {
    const { ad: result, reason } = await delivery(makeRepo([ad('a')])).nextWithReason(USER, query, NOW, middle)
    expect(result).not.toBeNull()
    expect(reason).toBeNull()
  })

  it('desligado (produção), nunca explica nada', async () => {
    const service = delivery(makeRepo([]), { NODE_ENV: 'production' })
    expect(service.debugEnabled()).toBe(false)
    expect((await service.nextWithReason(USER, query, NOW, middle)).reason).toBeNull()
  })

  it('sem a variável, só liga com NODE_ENV=development; a variável vence', () => {
    expect(delivery(makeRepo([]), { NODE_ENV: 'development' }).debugEnabled()).toBe(true)
    expect(delivery(makeRepo([]), {}).debugEnabled()).toBe(false)
    expect(delivery(makeRepo([]), { NODE_ENV: 'development', ADS_DELIVERY_DEBUG: 'false' }).debugEnabled()).toBe(false)
    // Produção nunca explica, nem com a variável ligada.
    expect(delivery(makeRepo([]), { NODE_ENV: 'production', ADS_DELIVERY_DEBUG: 'true' }).debugEnabled()).toBe(false)
  })
})

describe('cadastro da pessoa pela cópia curta', () => {
  it('com a cópia, a entrega não consulta o cadastro no banco', async () => {
    const repo = makeRepo([ad('a')])
    const cache = { get: jest.fn().mockResolvedValue(viewerFactsFromRow({ city: 'Campinas', state: 'SP', birthDate: null, gender: null, adPreference: null })) }
    const result = await delivery(repo, {}, cache).next(USER, query, NOW, middle)
    expect(result).not.toBeNull()
    expect(cache.get).toHaveBeenCalledWith(USER, expect.any(Function))
    expect(repo.findViewerFacts).not.toHaveBeenCalled()
  })

  it('a função de carga lê o cadastro do banco e já devolve derivado (sem data de nascimento)', async () => {
    const repo = makeRepo([ad('a')], { birthDate: new Date('1996-05-10T00:00:00Z'), adPreference: { personalizationConsent: true, interests: ['food-drink'] } })
    const cache = { get: jest.fn().mockImplementation((_id: string, load: () => Promise<unknown>) => load()) }
    await delivery(repo, {}, cache).next(USER, query, NOW, middle)
    expect(repo.findViewerFacts).toHaveBeenCalledWith(USER)
    const loaded = await (cache.get.mock.calls[0][1] as () => Promise<Record<string, unknown>>)()
    expect(loaded).toMatchObject({ consented: true, interests: ['food-drink'], minor: false })
    expect(loaded).not.toHaveProperty('birthDate')
  })

  it('menor de idade na cópia nunca recebe público personalizado, mesmo com aceite', async () => {
    const targeted = ad('a', { interests: ['food-drink'] })
    const cache = { get: jest.fn().mockResolvedValue({ city: null, state: null, consented: true, interests: ['food-drink'], ageBand: null, minor: true, gender: null }) }
    const { ad: result } = await delivery(makeRepo([targeted]), {}, cache).nextWithReason(USER, query, NOW, middle)
    expect(result).toBeNull()
  })

  it('sem a cópia (sem Redis), lê do banco como antes', async () => {
    const repo = makeRepo([ad('a')])
    const result = await delivery(repo).next(USER, query, NOW, middle)
    expect(result).not.toBeNull()
    expect(repo.findViewerFacts).toHaveBeenCalledTimes(1)
  })
})
