import { AdsDeliveryService } from './ads-delivery.service'
import { isHoldout } from './delivery-rules'

const NOW = new Date('2026-11-22T12:00:00Z')
const USER = (() => {
  for (let index = 0; index < 100; index += 1) if (!isHoldout(`u-${index}`, 0.05)) return `u-${index}`
  throw new Error('sem usuário fora do grupo de controle')
})()

function ad(id: string, companyId = 'co-1') {
  return {
    id,
    adSetId: `set-${id}`,
    creative: { headline: 'Pão', body: 'Quente', ctaLabel: 'Saiba mais', destinationUrl: 'https://padaria.example/', media: null },
    adSet: {
      dailyBudgetCents: 1000,
      bidCapCents: null,
      states: [],
      cities: [],
      interests: [],
      ageBands: [],
      genders: [],
      automaticAudience: false,
      campaign: { objective: 'AWARENESS', account: { id: 'acc-1', balanceCents: 5000, pendingSpendMillicents: 0, companyId, company: { id: companyId, tradeName: id, username: id, logoUrl: null } } },
    },
  }
}

function makeRepo(pool: unknown[]) {
  return {
    findViewerFacts: jest.fn().mockResolvedValue({ city: 'São Paulo', state: 'SP', birthDate: null, gender: null, adPreference: null }),
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
    findImpression: jest.fn(),
    countClicks: jest.fn().mockResolvedValue(0),
    applyEvent: jest.fn().mockResolvedValue(true),
  }
}

const userStateStub = (state: { hiddenCompanyIds: string[]; excludedAdIds: string[] } | null) => ({
  load: jest.fn().mockImplementation(async () => (state ? { hiddenCompanyIds: new Set(state.hiddenCompanyIds), excludedAdIds: new Set(state.excludedAdIds) } : null)),
  recordImpression: jest.fn().mockResolvedValue(undefined),
  invalidate: jest.fn().mockResolvedValue(undefined),
})

const storage = { getPublicUrl: (key: string) => `https://cdn.test/${key}` }
const links = { build: (token: string) => `https://votz.test/c/${token}` }
const adjacency = { companiesTargetedNear: jest.fn().mockResolvedValue([]) }
const query = { surface: 'FEED_FOR_YOU' as const, position: 3 }
const middle = () => 0.5
const delivery = (repo: ReturnType<typeof makeRepo>, userState: ReturnType<typeof userStateStub>) =>
  new AdsDeliveryService(repo as never, storage as never, links as never, adjacency as never, undefined, undefined, userState as never)

describe('estado por pessoa na entrega', () => {
  it('com a cópia no Redis, escondidos e limite diário não vão ao banco (só o cadastro)', async () => {
    const repo = makeRepo([ad('a')])
    await delivery(repo, userStateStub({ hiddenCompanyIds: [], excludedAdIds: [] })).next(USER, query, NOW, middle)
    expect(repo.findViewerFacts).toHaveBeenCalledTimes(1)
    expect(repo.hiddenCompanyIds).not.toHaveBeenCalled()
    expect(repo.excludedAdIds).not.toHaveBeenCalled()
  })

  it('pede o estado só dos anúncios que estão na disputa (sem repetir)', async () => {
    const repo = makeRepo([ad('a'), ad('b'), ad('a')])
    const state = userStateStub({ hiddenCompanyIds: [], excludedAdIds: [] })
    await delivery(repo, state).next(USER, query, NOW, middle)
    expect(state.load).toHaveBeenCalledWith(USER, ['a', 'b'], 3, expect.any(Function))
  })

  it('a função de carga a frio lê do banco (escondidos, anúncios escondidos e contagem de 24 h)', async () => {
    const repo = makeRepo([ad('a')])
    const state = userStateStub({ hiddenCompanyIds: [], excludedAdIds: [] })
    await delivery(repo, state).next(USER, query, NOW, middle)
    const load = state.load.mock.calls[0][3] as () => Promise<unknown>
    await load()
    expect(repo.hiddenCompanyIds).toHaveBeenCalledWith(USER)
    expect(repo.hiddenAdIds).toHaveBeenCalledWith(USER)
    expect(repo.impressionCounts).toHaveBeenCalledWith(USER, new Date(NOW.getTime() - 24 * 3600_000))
  })

  it('o anúncio que a pessoa escondeu e a empresa que ela pediu para não ver saem da disputa', async () => {
    const repo = makeRepo([ad('escondido', 'co-1'), ad('empresa-escondida', 'co-2'), ad('livre', 'co-3')])
    const view = await delivery(repo, userStateStub({ hiddenCompanyIds: ['co-2'], excludedAdIds: ['escondido'] })).next(USER, query, NOW, middle)
    expect(view?.adId).toBe('livre')
  })

  it('todos escondidos ou no limite: nenhum anúncio', async () => {
    const repo = makeRepo([ad('a', 'co-1'), ad('b', 'co-2')])
    expect(await delivery(repo, userStateStub({ hiddenCompanyIds: ['co-1'], excludedAdIds: ['b'] })).next(USER, query, NOW, middle)).toBeNull()
    expect(repo.createImpression).not.toHaveBeenCalled()
  })

  it('sem a cópia (Redis fora do ar), volta às consultas ao banco e o resultado é o mesmo', async () => {
    const repo = makeRepo([ad('escondido', 'co-1'), ad('livre', 'co-3')])
    repo.excludedAdIds.mockResolvedValue(['escondido'])
    const view = await delivery(repo, userStateStub(null)).next(USER, query, NOW, middle)
    expect(view?.adId).toBe('livre')
    expect(repo.hiddenCompanyIds).toHaveBeenCalledTimes(1)
    expect(repo.excludedAdIds).toHaveBeenCalledTimes(1)
  })

  it('a exibição entregue entra na contagem da pessoa; sem entrega, nada é contado', async () => {
    const repo = makeRepo([ad('a')])
    const state = userStateStub({ hiddenCompanyIds: [], excludedAdIds: [] })
    await delivery(repo, state).next(USER, query, NOW, middle)
    expect(state.recordImpression).toHaveBeenCalledWith(USER, 'a')

    const none = userStateStub({ hiddenCompanyIds: [], excludedAdIds: ['a'] })
    await delivery(makeRepo([ad('a')]), none).next(USER, query, NOW, middle)
    expect(none.recordImpression).not.toHaveBeenCalled()
  })

  it('cadastro continua sempre do banco: sem cadastro, sem anúncio', async () => {
    const repo = makeRepo([ad('a')])
    repo.findViewerFacts.mockResolvedValue(null)
    expect(await delivery(repo, userStateStub({ hiddenCompanyIds: [], excludedAdIds: [] })).next(USER, query, NOW, middle)).toBeNull()
  })
})

describe('esconder apaga a cópia da pessoa (nunca reaparece)', () => {
  const impression = (userId: string) => ({ id: 'imp-1', userId, adId: 'ad-1', servedAt: new Date(NOW.getTime() - 60_000), viewableAt: null, clickedAt: null, hiddenAt: null, ad: { adSetId: 'set-1', adSet: { campaign: { accountId: 'acc-1', account: { companyId: 'co-1' } } } } })
  const event = (type: string) => ({ eventId: '11111111-1111-4111-8111-111111111111', type, impressionId: 'imp-1', adId: 'ad-1', occurredAt: new Date(NOW.getTime() - 5000).toISOString(), visibleMs: 1200 })

  it.each(['HIDE', 'HIDE_ADVERTISER'])('evento %s aceito invalida a cópia', async (type) => {
    const repo = makeRepo([ad('a')])
    repo.findImpression.mockResolvedValue(impression(USER))
    const state = userStateStub({ hiddenCompanyIds: [], excludedAdIds: [] })
    const result = await delivery(repo, state).ingest(USER, { events: [event(type)] } as never, NOW)
    expect(result.accepted).toBe(1)
    expect(state.invalidate).toHaveBeenCalledWith(USER)
  })

  it.each(['VIEWABLE_IMPRESSION', 'CLICK', 'REPORT'])('evento %s não mexe na cópia', async (type) => {
    const repo = makeRepo([ad('a')])
    repo.findImpression.mockResolvedValue(impression(USER))
    const state = userStateStub({ hiddenCompanyIds: [], excludedAdIds: [] })
    await delivery(repo, state).ingest(USER, { events: [event(type)] } as never, NOW)
    expect(state.invalidate).not.toHaveBeenCalled()
  })

  it('evento repetido (duplicado) ou de outra pessoa não invalida', async () => {
    const repo = makeRepo([ad('a')])
    const state = userStateStub({ hiddenCompanyIds: [], excludedAdIds: [] })
    repo.findImpression.mockResolvedValue(impression(USER))
    repo.applyEvent.mockResolvedValue(false) // eventId já recebido
    await delivery(repo, state).ingest(USER, { events: [event('HIDE')] } as never, NOW)
    repo.applyEvent.mockResolvedValue(true)
    repo.findImpression.mockResolvedValue(impression('outra-pessoa'))
    await delivery(repo, state).ingest(USER, { events: [event('HIDE')] } as never, NOW)
    expect(state.invalidate).not.toHaveBeenCalled()
  })

  it('sem o serviço de estado, esconder continua funcionando', async () => {
    const repo = makeRepo([ad('a')])
    repo.findImpression.mockResolvedValue(impression(USER))
    const service = new AdsDeliveryService(repo as never, storage as never, links as never, adjacency as never)
    expect((await service.ingest(USER, { events: [event('HIDE')] } as never, NOW)).accepted).toBe(1)
  })
})
