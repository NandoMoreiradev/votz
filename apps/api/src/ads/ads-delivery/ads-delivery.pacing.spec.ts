import { AdsDeliveryService } from './ads-delivery.service'
import { EXPLORATION, explorationChance, isHoldout, pickAuctionPool, saoPauloHour } from './delivery-rules'

const NOW = new Date('2026-11-22T12:00:00Z') // 9h em São Paulo

const USER = (() => {
  for (let index = 0; index < 100; index += 1) if (!isHoldout(`u-${index}`, 0.05)) return `u-${index}`
  throw new Error('sem usuário fora do grupo de controle')
})()

function ad(id: string, bidCapCents: number | null, objective = 'AWARENESS') {
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

/** Ritmo falso: o teste escolhe o freio e o gasto estimado de cada conjunto. */
function makePacing(view: Map<string, { throttle: number; estimatedSpentMillicents: number }> | null, counters: { total: number; explored: number } | null = null) {
  return {
    view: jest.fn().mockResolvedValue(view),
    commit: jest.fn().mockResolvedValue(undefined),
    explorationCounters: jest.fn().mockResolvedValue(counters),
    recordExploration: jest.fn().mockResolvedValue(undefined),
  }
}

const storage = { getPublicUrl: (key: string) => `https://cdn.test/${key}` }
const links = { build: (token: string) => `https://votz.test/c/${token}` }
const adjacency = { companiesTargetedNear: jest.fn().mockResolvedValue([]) }
const query = { surface: 'FEED_FOR_YOU' as const, position: 3 }
const service = (repo: ReturnType<typeof makeRepo>, pacing: ReturnType<typeof makePacing>) =>
  new AdsDeliveryService(repo as never, storage as never, links as never, adjacency as never, pacing as never)
const middle = () => 0.5

/** Gerador de números com semente: o teste repete o mesmo "acaso" e dá o mesmo resultado. */
function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('ritmo por minuto na entrega', () => {
  it('pede o ritmo com o orçamento de cada conjunto e o dia de São Paulo', async () => {
    const repo = makeRepo([ad('a', null), ad('b', null)])
    const pacing = makePacing(new Map([['set-a', { throttle: 1, estimatedSpentMillicents: 0 }], ['set-b', { throttle: 1, estimatedSpentMillicents: 0 }]]))
    await service(repo, pacing).next(USER, query, NOW, middle)
    expect(pacing.view).toHaveBeenCalledWith(
      expect.arrayContaining([
        { adSetId: 'set-a', dailyBudgetMillicents: 1_000_000 },
        { adSetId: 'set-b', dailyBudgetMillicents: 1_000_000 },
      ]),
      '2026-11-22',
      NOW,
      expect.any(Function),
    )
  })

  it('com o ritmo disponível não consulta o gasto no banco a cada pedido', async () => {
    const repo = makeRepo([ad('a', null)])
    const pacing = makePacing(new Map([['set-a', { throttle: 1, estimatedSpentMillicents: 0 }]]))
    await service(repo, pacing).next(USER, query, NOW, middle)
    expect(repo.spentTodayByAdSet).not.toHaveBeenCalled()
  })

  it('o gasto para o ritmo vem do banco só quando o freio precisa ser recalculado (a função é passada ao ritmo)', async () => {
    const repo = makeRepo([ad('a', null)])
    const pacing = makePacing(new Map([['set-a', { throttle: 1, estimatedSpentMillicents: 0 }]]))
    await service(repo, pacing).next(USER, query, NOW, middle)
    const load = pacing.view.mock.calls[0][3] as (ids: string[]) => Promise<unknown>
    await load(['set-a'])
    expect(repo.spentTodayByAdSet).toHaveBeenCalledWith(['set-a'], '2026-11-22')
  })

  it('freio em 0 tira o conjunto; em 1 deixa entrar; no meio, vale o sorteio', async () => {
    const parado = makePacing(new Map([['set-a', { throttle: 0, estimatedSpentMillicents: 0 }]]))
    expect(await service(makeRepo([ad('a', null)]), parado).next(USER, query, NOW, middle)).toBeNull()

    const solto = makePacing(new Map([['set-a', { throttle: 1, estimatedSpentMillicents: 0 }]]))
    expect((await service(makeRepo([ad('a', null)]), solto).next(USER, query, NOW, middle))?.adId).toBe('a')

    const meio = () => makePacing(new Map([['set-a', { throttle: 0.5, estimatedSpentMillicents: 0 }]]))
    expect(await service(makeRepo([ad('a', null)]), meio()).next(USER, query, NOW, () => 0.9)).toBeNull()
    expect(await service(makeRepo([ad('a', null)]), meio()).next(USER, query, NOW, () => 0.1)).not.toBeNull()
  })

  it('o conjunto freado deixa o outro vencer o leilão', async () => {
    const pacing = makePacing(new Map([['set-a', { throttle: 0, estimatedSpentMillicents: 0 }], ['set-b', { throttle: 1, estimatedSpentMillicents: 0 }]]))
    expect((await service(makeRepo([ad('a', 3000), ad('b', 1000)]), pacing).next(USER, query, NOW, middle))?.adId).toBe('b')
  })

  it('gasto estimado que já esgotou o orçamento (emprestado na entrega) tira o conjunto, mesmo sem freio', async () => {
    const pacing = makePacing(new Map([['set-a', { throttle: 1, estimatedSpentMillicents: 1_000_000 }]]))
    expect(await service(makeRepo([ad('a', null)]), pacing).next(USER, query, NOW, middle)).toBeNull()
  })

  it('empresta o gasto esperado da entrega: preço vezes a chance de a exibição ser vista', async () => {
    const pacing = makePacing(new Map([['set-a', { throttle: 1, estimatedSpentMillicents: 0 }]]))
    await service(makeRepo([ad('a', null)]), pacing).next(USER, query, NOW, middle)
    // Conscientização: R$ 6,00 por mil = 600 milésimos por exibição; anúncio novo vê com a chance de partida de 60%.
    expect(pacing.commit).toHaveBeenCalledWith('set-a', '2026-11-22', NOW, 360)
  })

  it('anúncio cobrado por clique empresta o preço do clique vezes a chance de clique', async () => {
    const pacing = makePacing(new Map([['set-a', { throttle: 1, estimatedSpentMillicents: 0 }]]))
    const repo = makeRepo([ad('a', null, 'TRAFFIC')])
    repo.clickStatsByAd.mockResolvedValue(new Map([['a', { impressions: 10000, viewable: 6000, clicks: 600, hides: 0 }]])) // 10% de clique
    await service(repo, pacing).next(USER, query, NOW, middle)
    const charged = repo.createImpression.mock.calls[0][0].chargeMillicents as number
    const lent = pacing.commit.mock.calls[0][3] as number
    expect(lent).toBeGreaterThan(0)
    expect(lent).toBeLessThan(charged * 0.2) // por volta de 10% do preço do clique
  })

  it('sem entrega, nada é emprestado', async () => {
    const pacing = makePacing(new Map([['set-a', { throttle: 0, estimatedSpentMillicents: 0 }]]))
    await service(makeRepo([ad('a', null)]), pacing).next(USER, query, NOW, middle)
    expect(pacing.commit).not.toHaveBeenCalled()
  })

  it('Redis fora (ritmo devolve null): volta ao ritmo pelo banco, como antes', async () => {
    const repo = makeRepo([ad('a', null)])
    repo.spentTodayByAdSet.mockResolvedValue(new Map([['set-a', 800_000]])) // 80% do orçamento às 9h
    const pacing = makePacing(null)
    expect(await service(repo, pacing).next(USER, query, NOW, middle)).toBeNull()
    expect(repo.spentTodayByAdSet).toHaveBeenCalledWith(['set-a'], '2026-11-22')

    const ok = makeRepo([ad('a', null)])
    ok.spentTodayByAdSet.mockResolvedValue(new Map([['set-a', 300_000]]))
    expect((await service(ok, makePacing(null)).next(USER, query, NOW, middle))?.adId).toBe('a')
  })
})

describe('exploração: regras', () => {
  it('sem contadores ou com pouca amostra, vale o alvo', () => {
    expect(explorationChance(null)).toBe(EXPLORATION.TARGET_SHARE)
    expect(explorationChance({ total: EXPLORATION.MIN_SAMPLE - 1, explored: 39 })).toBe(EXPLORATION.TARGET_SHARE)
  })
  it('passou do teto: não explora; abaixo do piso: explora na hora; no meio: o alvo', () => {
    expect(explorationChance({ total: 100, explored: 10 })).toBe(0)
    expect(explorationChance({ total: 100, explored: 25 })).toBe(0)
    expect(explorationChance({ total: 100, explored: 4 })).toBe(1)
    expect(explorationChance({ total: 100, explored: 5 })).toBe(EXPLORATION.TARGET_SHARE)
    expect(explorationChance({ total: 100, explored: 9 })).toBe(EXPLORATION.TARGET_SHARE)
  })
  it('o alvo fica entre o piso e o teto', () => {
    expect(EXPLORATION.TARGET_SHARE).toBeGreaterThanOrEqual(EXPLORATION.MIN_SHARE)
    expect(EXPLORATION.TARGET_SHARE).toBeLessThanOrEqual(EXPLORATION.MAX_SHARE)
  })

  const fresh = { id: 'n', isNew: true }
  const proven = { id: 'p', isNew: false }
  it('só novos, ou só experientes: todos disputam e não conta como disputa', () => {
    expect(pickAuctionPool([fresh], 0.5, () => 0.1)).toEqual({ pool: [fresh], contested: false })
    expect(pickAuctionPool([proven], 0.5, () => 0.1)).toEqual({ pool: [proven], contested: false })
    expect(pickAuctionPool([], 0.5)).toEqual({ pool: [], contested: false })
  })
  it('com os dois grupos, o sorteio decide quem disputa', () => {
    expect(pickAuctionPool([fresh, proven], 0.075, () => 0.05)).toEqual({ pool: [fresh], contested: true })
    expect(pickAuctionPool([fresh, proven], 0.075, () => 0.5)).toEqual({ pool: [proven], contested: true })
    expect(pickAuctionPool([fresh, proven], 0, () => 0)).toEqual({ pool: [proven], contested: true })
    expect(pickAuctionPool([fresh, proven], 1, () => 0.999)).toEqual({ pool: [fresh], contested: true })
  })
  it('hora de São Paulo (a janela dos contadores)', () => {
    expect(saoPauloHour(new Date('2026-11-22T12:00:00Z'))).toBe(9)
    expect(saoPauloHour(new Date('2026-11-22T02:59:00Z'))).toBe(23)
    expect(saoPauloHour(new Date('2026-11-22T03:00:00Z'))).toBe(0)
  })
})

describe('exploração: na entrega', () => {
  const pool = () => [ad('velho', 80, 'TRAFFIC'), ad('novo', 80, 'TRAFFIC')]
  const stats = new Map([['velho', { impressions: 9000, viewable: 6000, clicks: 300, hides: 0 }]])
  const view = new Map([['set-velho', { throttle: 1, estimatedSpentMillicents: 0 }], ['set-novo', { throttle: 1, estimatedSpentMillicents: 0 }]])

  async function share(counters: { total: number; explored: number } | null, runs = 3000) {
    const repo = makeRepo(pool())
    repo.clickStatsByAd.mockResolvedValue(stats)
    const pacing = makePacing(view, counters)
    const delivery = service(repo, pacing)
    const random = seeded(7)
    let fresh = 0
    for (let run = 0; run < runs; run += 1) {
      repo.createImpression.mockClear()
      await delivery.next(USER, query, NOW, random)
      if (repo.createImpression.mock.calls[0][0].adId === 'novo') fresh += 1
    }
    return { share: fresh / runs, pacing }
  }

  it('sem contadores, anúncio novo fica com cerca de 7,5% das entregas (o alvo), mesmo com lance igual', async () => {
    const { share: value } = await share(null)
    expect(value).toBeGreaterThan(0.05)
    expect(value).toBeLessThan(0.1)
  })

  it('passou do teto na hora: anúncio novo não ganha nenhuma entrega disputada com experientes', async () => {
    const { share: value } = await share({ total: 200, explored: 40 }, 500)
    expect(value).toBe(0)
  })

  it('abaixo do piso na hora: anúncio novo recupera, ganha todas as disputadas', async () => {
    const { share: value } = await share({ total: 200, explored: 2 }, 500)
    expect(value).toBe(1)
  })

  it('conta a entrega disputada nos contadores, com o vencedor novo ou não', async () => {
    const repo = makeRepo(pool())
    repo.clickStatsByAd.mockResolvedValue(stats)
    const pacing = makePacing(view)
    await service(repo, pacing).next(USER, query, NOW, seeded(3))
    expect(pacing.explorationCounters).toHaveBeenCalledWith('2026-11-22', 9)
    expect(pacing.recordExploration).toHaveBeenCalledTimes(1)
    const [day, hour, winnerWasNew] = pacing.recordExploration.mock.calls[0]
    expect([day, hour]).toEqual(['2026-11-22', 9])
    expect(repo.createImpression.mock.calls[0][0].adId === 'novo').toBe(winnerWasNew)
  })

  it('só anúncios novos (começo do beta): todos disputam e nada entra nos contadores', async () => {
    const repo = makeRepo([ad('n1', 80, 'TRAFFIC'), ad('n2', 80, 'TRAFFIC')])
    const pacing = makePacing(new Map([['set-n1', { throttle: 1, estimatedSpentMillicents: 0 }], ['set-n2', { throttle: 1, estimatedSpentMillicents: 0 }]]))
    expect(await service(repo, pacing).next(USER, query, NOW, seeded(5))).not.toBeNull()
    expect(pacing.explorationCounters).not.toHaveBeenCalled()
    expect(pacing.recordExploration).not.toHaveBeenCalled()
  })

  it('o grupo sorteado não tem ninguém que valha (lance abaixo do piso): o outro grupo ainda entrega', async () => {
    const repo = makeRepo([ad('velho', 80, 'TRAFFIC'), ad('novo', 1, 'TRAFFIC')]) // lance de 1 centavo no clique: abaixo do piso
    repo.clickStatsByAd.mockResolvedValue(stats)
    const pacing = makePacing(view, { total: 200, explored: 2 }) // piso: explora sempre
    const view2 = await service(repo, pacing).next(USER, query, NOW, seeded(11))
    expect(view2?.adId).toBe('velho')
  })

  it('sem o serviço de ritmo (ou sem Redis) a exploração continua pelo sorteio do alvo', async () => {
    const repo = makeRepo(pool())
    repo.clickStatsByAd.mockResolvedValue(stats)
    const delivery = new AdsDeliveryService(repo as never, storage as never, links as never, adjacency as never)
    const random = seeded(9)
    let fresh = 0
    for (let run = 0; run < 2000; run += 1) {
      repo.createImpression.mockClear()
      await delivery.next(USER, query, NOW, random)
      if (repo.createImpression.mock.calls[0][0].adId === 'novo') fresh += 1
    }
    expect(fresh / 2000).toBeGreaterThan(0.05)
    expect(fresh / 2000).toBeLessThan(0.1)
  })
})

describe('qualidade na entrega: denúncia e anunciante', () => {
  const companyAd = (id: string, companyId: string) => {
    const base = ad(id, 80, 'TRAFFIC')
    base.adSet.campaign.account.companyId = companyId
    base.adSet.campaign.account.company.id = companyId
    return base
  }
  const seenStats = { impressions: 9000, viewable: 6000, clicks: 300, hides: 0, reports: 0 }
  const freeView = (...ids: string[]) => new Map(ids.map((id) => [`set-${id}`, { throttle: 1, estimatedSpentMillicents: 0 }]))

  it('com o mesmo lance e a mesma chance de clique, o anúncio muito denunciado perde', async () => {
    const repo = makeRepo([companyAd('limpo', 'co-1'), companyAd('denunciado', 'co-2')])
    repo.clickStatsByAd.mockResolvedValue(new Map([
      ['limpo', { ...seenStats }],
      ['denunciado', { ...seenStats, reports: 90 }], // 1% das exibições denunciadas = o equivalente a 5% de "esconder"
    ]))
    const delivery = service(repo, makePacing(freeView('limpo', 'denunciado')))
    for (let run = 0; run < 20; run += 1) expect((await delivery.next(USER, query, NOW, seeded(run + 1)))?.adId).toBe('limpo')
  })

  it('anúncio novo de empresa que costuma incomodar perde para o de empresa limpa, com lances iguais', async () => {
    const repo = makeRepo([companyAd('ruim', 'co-ruim'), companyAd('bom', 'co-bom')])
    repo.advertiserStats.mockResolvedValue(new Map([
      ['co-ruim', { impressions: 30000, hides: 4000, reports: 150 }],
      ['co-bom', { impressions: 30000, hides: 150, reports: 0 }],
    ]))
    const delivery = service(repo, makePacing(freeView('ruim', 'bom')))
    // Os dois são novos (sem estatística própria): o sorteio da chance de clique é igual para os dois, a qualidade decide.
    let wins = 0
    for (let run = 0; run < 200; run += 1) if ((await delivery.next(USER, query, NOW, seeded(run + 100)))?.adId === 'bom') wins += 1
    expect(wins).toBeGreaterThan(130) // bem acima de 50%, com folga para o ruído do sorteio dos anúncios novos
  })

  it('a qualidade da empresa é medida uma vez e guardada (não consulta o banco a cada pedido)', async () => {
    const repo = makeRepo([companyAd('a', 'co-1')])
    const delivery = service(repo, makePacing(freeView('a')))
    await delivery.next(USER, query, NOW, middle)
    await delivery.next(USER, query, NOW, middle)
    await delivery.next(USER, query, new Date(NOW.getTime() + 9 * 60_000), middle)
    expect(repo.advertiserStats).toHaveBeenCalledTimes(1)
    await delivery.next(USER, query, new Date(NOW.getTime() + 11 * 60_000), middle)
    expect(repo.advertiserStats).toHaveBeenCalledTimes(2)
  })

  it('falha ao medir a qualidade das empresas: usa a taxa normal e a entrega segue', async () => {
    const repo = makeRepo([companyAd('a', 'co-1')])
    repo.advertiserStats.mockRejectedValue(new Error('banco'))
    expect((await service(repo, makePacing(freeView('a'))).next(USER, query, NOW, middle))?.adId).toBe('a')
  })
})
