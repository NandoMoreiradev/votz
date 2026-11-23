import { AdsDeliveryService } from './ads-delivery.service'
import { isHoldout } from './delivery-rules'
import { assignArm, type DeliveryExperiment } from './experiments'

const NOW = new Date('2026-11-22T12:00:00Z')

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
      campaign: { objective, account: { id: 'acc-1', balanceCents: 5000, pendingSpendMillicents: 0, companyId: 'co-1', company: { id: 'co-1', tradeName: 'Padaria', username: 'padaria', logoUrl: null } } },
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
    createShadowDecisions: jest.fn().mockResolvedValue({ count: 1 }),
  }
}

const storage = { getPublicUrl: (key: string) => `https://cdn.test/${key}` }
const links = { build: (token: string) => `https://votz.test/c/${token}` }
const adjacency = { companiesTargetedNear: jest.fn().mockResolvedValue([]) }
const query = { surface: 'FEED_FOR_YOU' as const, position: 3 }
const delivery = (repo: ReturnType<typeof makeRepo>, experiments: DeliveryExperiment[]) => {
  const service = new AdsDeliveryService(repo as never, storage as never, links as never, adjacency as never)
  service.experiments = experiments
  return service
}
const middle = () => 0.5

/** Primeiro id de pessoa (fora do grupo de controle) que cai no braço pedido; `null` = fora do experimento. */
function userIn(experiment: DeliveryExperiment, armKey: string | null): string {
  for (let index = 0; index < 5000; index += 1) {
    const id = `u-${index}`
    if (isHoldout(id, 0.05)) continue
    const arm = assignArm(id, experiment)
    if ((arm?.key ?? null) === armKey) return id
  }
  throw new Error(`ninguém caiu em ${armKey}`)
}

/** Anúncio "velho" (muita história) e "novo" (sem estatística): com o alvo de exploração em 1, só o novo disputa. */
const exploreExperiment = (over: Partial<DeliveryExperiment> = {}): DeliveryExperiment => ({
  key: 'exploracao',
  mode: 'AB',
  trafficShare: 1,
  arms: [
    { key: 'controle', weight: 1, overrides: {} },
    { key: 'teste', weight: 1, overrides: { explorationTargetShare: 1 } },
  ],
  ...over,
})
const velhoENovo = () => {
  const repo = makeRepo([ad('velho', 80), ad('novo', 80)])
  repo.clickStatsByAd.mockResolvedValue(new Map([['velho', { impressions: 9000, viewable: 6000, clicks: 300, hides: 0, reports: 0 }]]))
  return repo
}

describe('teste A/B na entrega', () => {
  it('sem experimento, a exibição não leva braço (nulo) e a entrega é a de sempre', async () => {
    const repo = velhoENovo()
    const view = await delivery(repo, []).next('u-1', query, NOW, middle)
    expect(view?.adId).toBe('velho')
    expect(repo.createImpression.mock.calls[0][0].experiment).toBeNull()
    expect(repo.createShadowDecisions).not.toHaveBeenCalled()
  })

  it('pessoa fora da parte do tráfego segue as regras normais e sem braço', async () => {
    const experiment = exploreExperiment({ trafficShare: 0.3 })
    const repo = velhoENovo()
    const view = await delivery(repo, [experiment]).next(userIn(experiment, null), query, NOW, middle)
    expect(view?.adId).toBe('velho')
    expect(repo.createImpression.mock.calls[0][0].experiment).toBeNull()
  })

  it('no braço de teste vale a regra do teste, e o braço fica gravado na exibição', async () => {
    const experiment = exploreExperiment()
    const repo = velhoENovo()
    const view = await delivery(repo, [experiment]).next(userIn(experiment, 'teste'), query, NOW, middle)
    expect(view?.adId).toBe('novo') // alvo de exploração 1: só o anúncio novo disputa
    expect(repo.createImpression.mock.calls[0][0].experiment).toBe('exploracao:teste')
  })

  it('no braço de controle vale a regra normal e o braço também fica gravado', async () => {
    const experiment = exploreExperiment()
    const repo = velhoENovo()
    const view = await delivery(repo, [experiment]).next(userIn(experiment, 'controle'), query, NOW, middle)
    expect(view?.adId).toBe('velho')
    expect(repo.createImpression.mock.calls[0][0].experiment).toBe('exploracao:controle')
  })

  it('a mesma pessoa é servida sempre pelo mesmo braço', async () => {
    const experiment = exploreExperiment()
    const user = userIn(experiment, 'teste')
    const labels = new Set<string>()
    for (let run = 0; run < 5; run += 1) {
      const repo = velhoENovo()
      await delivery(repo, [experiment]).next(user, query, NOW, middle)
      labels.add(repo.createImpression.mock.calls[0][0].experiment)
    }
    expect([...labels]).toEqual(['exploracao:teste'])
  })

  it('peso da qualidade por braço: sem penalidade, o anúncio muito denunciado com lance maior vence; com a regra normal, perde', async () => {
    const experiment: DeliveryExperiment = {
      key: 'qualidade',
      mode: 'AB',
      trafficShare: 1,
      arms: [
        { key: 'controle', weight: 1, overrides: {} },
        { key: 'sem-penalidade', weight: 1, overrides: { qualityWeight: 0 } },
      ],
    }
    const make = () => {
      const repo = makeRepo([ad('denunciado', 100), ad('limpo', 80)])
      repo.clickStatsByAd.mockResolvedValue(new Map([
        ['denunciado', { impressions: 9000, viewable: 6000, clicks: 300, hides: 0, reports: 400 }],
        ['limpo', { impressions: 9000, viewable: 6000, clicks: 300, hides: 0, reports: 0 }],
      ]))
      return repo
    }
    expect((await delivery(make(), [experiment]).next(userIn(experiment, 'controle'), query, NOW, middle))?.adId).toBe('limpo')
    expect((await delivery(make(), [experiment]).next(userIn(experiment, 'sem-penalidade'), query, NOW, middle))?.adId).toBe('denunciado')
  })

  it('experimento inválido nunca roda', async () => {
    const repo = velhoENovo()
    const bad = exploreExperiment({ key: 'RUIM!' })
    expect((await delivery(repo, [bad]).next('u-1', query, NOW, middle))?.adId).toBe('velho')
    expect(repo.createImpression.mock.calls[0][0].experiment).toBeNull()
  })
})

describe('modo sombra na entrega', () => {
  const shadowExperiment = (): DeliveryExperiment => ({
    key: 'sombra-qualidade',
    mode: 'SHADOW',
    trafficShare: 1,
    arms: [
      { key: 'controle', weight: 1, overrides: {} },
      { key: 'sem-penalidade', weight: 1, overrides: { qualityWeight: 0 } },
    ],
  })
  const denunciadoELimpo = () => {
    const repo = makeRepo([ad('denunciado', 100), ad('limpo', 80)])
    repo.clickStatsByAd.mockResolvedValue(new Map([
      ['denunciado', { impressions: 9000, viewable: 6000, clicks: 300, hides: 0, reports: 400 }],
      ['limpo', { impressions: 9000, viewable: 6000, clicks: 300, hides: 0, reports: 0 }],
    ]))
    return repo
  }
  const flush = () => new Promise((resolve) => setImmediate(resolve))

  it('quem vê o anúncio é o controle; a sombra só grava o que o braço de teste teria escolhido', async () => {
    const repo = denunciadoELimpo()
    const view = await delivery(repo, [shadowExperiment()]).next('u-1', query, NOW, middle)
    expect(view?.adId).toBe('limpo') // o controle, com a penalidade normal
    await flush()
    expect(repo.createShadowDecisions).toHaveBeenCalledTimes(1)
    const rows = repo.createShadowDecisions.mock.calls[0][0]
    expect(rows).toHaveLength(1) // só o braço de teste: o controle não precisa de sombra
    expect(rows[0]).toMatchObject({ experiment: 'sombra-qualidade', arm: 'sem-penalidade', servedAdId: 'limpo', shadowAdId: 'denunciado', agreed: false })
    // O valor por mil exibições é o que permite comparar anúncios de unidades diferentes (clique e mil exibições).
    expect(rows[0].servedEcpmCents).toEqual(expect.any(Number))
    expect(rows[0].shadowEcpmCents).toEqual(expect.any(Number))
    expect(rows[0].shadowEcpmCents).toBeGreaterThan(rows[0].servedEcpmCents) // o denunciado tem lance maior e sem a penalidade vale mais
  })

  it('a exibição leva o braço de controle (todo mundo é servido por ele na sombra)', async () => {
    const repo = denunciadoELimpo()
    await delivery(repo, [shadowExperiment()]).next('u-1', query, NOW, middle)
    expect(repo.createImpression.mock.calls[0][0].experiment).toBe('sombra-qualidade:controle')
  })

  it('quando os dois escolhem o mesmo anúncio, a sombra registra "concordou"', async () => {
    const repo = makeRepo([ad('unico', 80)])
    await delivery(repo, [shadowExperiment()]).next('u-1', query, NOW, middle)
    await flush()
    expect(repo.createShadowDecisions.mock.calls[0][0][0]).toMatchObject({ servedAdId: 'unico', shadowAdId: 'unico', agreed: true })
  })

  it('o que o controle serve não muda por causa da sombra (mesma semente, mesmo resultado, com e sem experimento)', async () => {
    const seeded = (seed: number) => {
      let state = seed >>> 0
      return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    }
    for (let seed = 1; seed <= 40; seed += 1) {
      const without = await delivery(velhoENovo(), []).next('u-1', query, NOW, seeded(seed))
      const withShadow = await delivery(velhoENovo(), [shadowExperiment()]).next('u-1', query, NOW, seeded(seed))
      expect(withShadow?.adId).toBe(without?.adId)
    }
  })

  it('falha ao gravar a sombra nunca atrapalha a entrega', async () => {
    const repo = denunciadoELimpo()
    repo.createShadowDecisions.mockRejectedValue(new Error('banco fora'))
    const view = await delivery(repo, [shadowExperiment()]).next('u-1', query, NOW, middle)
    expect(view?.adId).toBe('limpo')
    await flush()
  })

  it('pessoa fora da parte do tráfego não gera decisão de sombra', async () => {
    const experiment = { ...shadowExperiment(), trafficShare: 0.3 }
    const repo = denunciadoELimpo()
    await delivery(repo, [experiment]).next(userIn(experiment, null), query, NOW, middle)
    await flush()
    expect(repo.createShadowDecisions).not.toHaveBeenCalled()
  })

  it('o controle não serviu ninguém (nenhum anúncio com lance acima do piso) mas o braço teria servido: a sombra registra o vazio', async () => {
    // Lance de 1 centavo no clique: abaixo do piso. O braço "sem piso" não existe; aqui os dois ficam sem anúncio e concordam.
    const repo = makeRepo([ad('fraco', 1)])
    const view = await delivery(repo, [shadowExperiment()]).next('u-1', query, NOW, middle)
    expect(view).toBeNull()
    await flush()
    expect(repo.createImpression).not.toHaveBeenCalled()
    expect(repo.createShadowDecisions.mock.calls[0][0][0]).toMatchObject({ servedAdId: null, shadowAdId: null, agreed: true })
  })
})
