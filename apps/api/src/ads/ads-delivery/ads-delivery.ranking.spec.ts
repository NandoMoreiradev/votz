import { AdsDeliveryService } from './ads-delivery.service'
import { isHoldout } from './delivery-rules'

const NOW = new Date('2026-11-22T12:00:00Z') // 9h em São Paulo: 37,5% do dia

const USER = (() => {
  for (let index = 0; index < 100; index += 1) if (!isHoldout(`u-${index}`, 0.05)) return `u-${index}`
  throw new Error('sem usuário fora do grupo de controle')
})()

function ad(id: string, bidCapCents: number | null, objective = 'TRAFFIC') {
  return {
    id,
    adSetId: `set-${id}`,
    creative: { headline: 'Pão', body: 'Quente', ctaLabel: 'Saiba mais', destinationUrl: 'https://padaria.example/', media: null },
    adSet: {
      dailyBudgetCents: 1000,
      bidCapCents,
      states: [],
      cities: [],
      interests: [],
      ageBands: [],
      genders: [],
      automaticAudience: false,
      campaign: {
        objective,
        account: { id: 'acc-1', balanceCents: 5000, pendingSpendMillicents: 0, companyId: 'co-1', company: { id: 'co-1', tradeName: 'Padaria', username: 'padaria', logoUrl: null } },
      },
    },
  }
}

function makeRepo(pool: unknown[]) {
  return {
    findViewerFacts: jest.fn().mockResolvedValue({ city: 'São Paulo', state: 'SP', birthDate: null, gender: null, adPreference: null }),
    hiddenCompanyIds: jest.fn().mockResolvedValue([]),
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

const service = (repo: ReturnType<typeof makeRepo>) => new AdsDeliveryService(repo as never, storage as never, links as never, adjacency as never)
const middle = () => 0.5

describe('entrega: chance de clique medida', () => {
  it('com o mesmo lance, o anúncio que mais clicou vence', async () => {
    const repo = makeRepo([ad('fraco', 80), ad('forte', 80)])
    repo.clickStatsByAd.mockResolvedValue(
      new Map([
        ['fraco', { viewable: 5000, clicks: 5 }],
        ['forte', { viewable: 5000, clicks: 400 }],
      ]),
    )
    const view = await service(repo).next(USER, query, NOW, middle)
    expect(view?.adId).toBe('forte')
    expect(repo.clickStatsByAd).toHaveBeenCalledWith(expect.arrayContaining(['fraco', 'forte']), expect.any(Date))
  })

  it('o preço fixado na entrega nunca passa do lance', async () => {
    const repo = makeRepo([ad('forte', 80), ad('fraco', 80)])
    repo.clickStatsByAd.mockResolvedValue(new Map([['forte', { viewable: 5000, clicks: 400 }]]))
    await service(repo).next(USER, query, NOW, middle)
    const charged = repo.createImpression.mock.calls[0][0].chargeMillicents
    expect(charged).toBeLessThanOrEqual(80 * 1000)
    expect(charged).toBeGreaterThanOrEqual(40 * 1000)
  })

  it('anúncio sem nenhuma exibição ainda concorre (começo frio)', async () => {
    expect((await service(makeRepo([ad('novo', 80)])).next(USER, query, NOW, middle))?.adId).toBe('novo')
  })

  it('falha ao medir a plataforma usa a chance fixa e a entrega segue', async () => {
    const repo = makeRepo([ad('a', 80)])
    repo.platformClickStats.mockRejectedValue(new Error('banco'))
    expect((await service(repo).next(USER, query, NOW, middle))?.adId).toBe('a')
  })

  it('a chance de partida da plataforma fica guardada por um tempo', async () => {
    const repo = makeRepo([ad('a', 80)])
    repo.platformClickStats.mockResolvedValue({ viewable: 100_000, clicks: 3000 })
    const delivery = service(repo)
    await delivery.next(USER, query, NOW, middle)
    await delivery.next(USER, query, NOW, middle)
    expect(repo.platformClickStats).toHaveBeenCalledTimes(1)
  })
})

describe('entrega: ritmo do orçamento', () => {
  it('conjunto muito adiantado é freado; no ritmo, entra', async () => {
    const adiantado = makeRepo([ad('a', null, 'AWARENESS')])
    adiantado.spentTodayByAdSet.mockResolvedValue(new Map([['set-a', 800_000]])) // 80% do orçamento às 9h
    expect(await service(adiantado).next(USER, query, NOW, middle)).toBeNull()
    expect(adiantado.createImpression).not.toHaveBeenCalled()

    const noRitmo = makeRepo([ad('a', null, 'AWARENESS')])
    noRitmo.spentTodayByAdSet.mockResolvedValue(new Map([['set-a', 300_000]]))
    expect(await service(noRitmo).next(USER, query, NOW, middle)).not.toBeNull()
  })

  it('o conjunto freado deixa o outro vencer o leilão', async () => {
    const repo = makeRepo([ad('a', 3000, 'AWARENESS'), ad('b', 1000, 'AWARENESS')])
    repo.spentTodayByAdSet.mockResolvedValue(new Map([['set-a', 800_000]]))
    expect((await service(repo).next(USER, query, NOW, middle))?.adId).toBe('b')
  })

  it('freado pela metade entra só às vezes, conforme o sorteio', async () => {
    const meio = makeRepo([ad('a', null, 'AWARENESS')])
    meio.spentTodayByAdSet.mockResolvedValue(new Map([['set-a', 550_000]])) // 7,5 pontos além da folga: chance ~0,5
    expect(await service(meio).next(USER, query, NOW, () => 0.9)).toBeNull()
    expect(await service(meio).next(USER, query, NOW, () => 0.1)).not.toBeNull()
  })
})
