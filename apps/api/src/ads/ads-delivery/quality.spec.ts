import { QUALITY, advertiserRejectionRate, qualityFactor, runAuction } from './delivery-rules'
import { AdsDeliveryService } from './ads-delivery.service'
import { isHoldout } from './delivery-rules'

describe('qualidade: penalidade por rejeição', () => {
  it('anúncio novo ou sem dado não é penalizado', () => {
    expect(qualityFactor(0, 0)).toBe(1)
    expect(qualityFactor(undefined as unknown as number, undefined as unknown as number)).toBe(1)
  })

  it('taxa normal de esconder (2%) não pesa; poucos casos num anúncio novo também não', () => {
    expect(qualityFactor(20, 1000)).toBeCloseTo(1, 5)
    expect(qualityFactor(1, 5)).toBeGreaterThan(0.95)
  })

  it('muita gente escondendo derruba o valor, até o limite', () => {
    const mid = qualityFactor(80, 1000) // 7% suavizado: 5 pontos acima do normal x 5 = 25%
    expect(mid).toBeGreaterThan(0.7)
    expect(mid).toBeLessThan(0.8)
    expect(qualityFactor(900, 1000)).toBeCloseTo(1 - QUALITY.MAX_PENALTY, 5)
  })

  it('esconder maior que as exibições não passa do limite nem quebra', () => {
    expect(qualityFactor(50, 10)).toBeGreaterThanOrEqual(1 - QUALITY.MAX_PENALTY)
    expect(qualityFactor(-5, -5)).toBe(1)
  })
})

describe('qualidade: denúncia pesa mais que esconder', () => {
  it('uma denúncia vale REPORT_WEIGHT escondidos', () => {
    expect(QUALITY.REPORT_WEIGHT).toBeGreaterThan(1)
    expect(qualityFactor(0, 1000, { reports: 10 })).toBeCloseTo(qualityFactor(10 * QUALITY.REPORT_WEIGHT, 1000), 10)
  })
  it('as mesmas pessoas denunciando derrubam mais o valor do que escondendo', () => {
    expect(qualityFactor(0, 1000, { reports: 20 })).toBeLessThan(qualityFactor(20, 1000))
  })
  it('denúncia sozinha acima da taxa normal já penaliza; sem denúncia, nada', () => {
    expect(qualityFactor(0, 1000, { reports: 30 })).toBeLessThan(0.7)
    expect(qualityFactor(0, 0, { reports: 0 })).toBe(1)
  })
  it('uma denúncia em poucas exibições pesa (a taxa suavizada sobe), mas fica longe do teto e some com as exibições', () => {
    const early = qualityFactor(0, 5, { reports: 1 })
    expect(early).toBeGreaterThan(0.85) // ~12% de penalidade com 1 denúncia em 5 exibições
    expect(early).toBeGreaterThan(1 - QUALITY.MAX_PENALTY)
    expect(qualityFactor(0, 500, { reports: 1 })).toBeGreaterThan(0.99) // 1 denúncia em 500: ruído
  })
  it('esconder mais denúncia nunca passa das exibições e o limite de penalidade vale', () => {
    expect(qualityFactor(500, 100, { reports: 500 })).toBeCloseTo(1 - QUALITY.MAX_PENALTY, 5)
    expect(qualityFactor(0, 100, { reports: -3 })).toBe(1)
  })
})

describe('qualidade do anunciante', () => {
  it('empresa sem dados suficientes: taxa normal (ninguém é condenado sem amostra)', () => {
    expect(advertiserRejectionRate(undefined)).toBe(QUALITY.BASELINE)
    expect(advertiserRejectionRate(null)).toBe(QUALITY.BASELINE)
    expect(advertiserRejectionRate({ impressions: QUALITY.ADVERTISER_MIN_IMPRESSIONS - 1, hides: 500, reports: 100 })).toBe(QUALITY.BASELINE)
  })
  it('empresa que quase não incomoda fica perto da taxa normal; a que incomoda muito sobe, até o teto', () => {
    expect(advertiserRejectionRate({ impressions: 10000, hides: 150, reports: 0 })).toBeCloseTo(0.0155, 3) // 1,5% de esconder, suavizado com a taxa normal
    expect(advertiserRejectionRate({ impressions: 10000, hides: 800, reports: 20 })).toBeGreaterThan(0.08)
    expect(advertiserRejectionRate({ impressions: 10000, hides: 9000, reports: 900 })).toBe(QUALITY.ADVERTISER_MAX_RATE)
  })
  it('anúncio novo de empresa que incomoda já começa penalizado; o de empresa limpa começa limpo', () => {
    const bad = advertiserRejectionRate({ impressions: 20000, hides: 2000, reports: 100 })
    const good = advertiserRejectionRate({ impressions: 20000, hides: 200, reports: 0 })
    expect(qualityFactor(0, 0, { priorRate: bad })).toBeLessThan(1)
    expect(qualityFactor(0, 0, { priorRate: good })).toBe(1)
  })
  it('com muita história própria, a taxa do próprio anúncio manda mais que a da empresa', () => {
    const bad = 0.15
    const fresh = qualityFactor(0, 0, { priorRate: bad })
    const proven = qualityFactor(20, 20000, { priorRate: bad }) // 0,1% de esconder em 20 mil exibições
    expect(proven).toBeGreaterThan(fresh)
    expect(proven).toBeGreaterThan(0.99)
  })
  it('o ponto de partida também é limitado (um mau período não condena para sempre)', () => {
    expect(qualityFactor(0, 0, { priorRate: 5 })).toBeCloseTo(qualityFactor(0, 0, { priorRate: QUALITY.ADVERTISER_MAX_RATE }), 10)
    expect(qualityFactor(0, 0, { priorRate: -1 })).toBe(1)
  })
})

describe('leilão com qualidade', () => {
  const cpm = (adId: string, bidCapCents: number, quality?: number) => ({ adId, objective: 'AWARENESS' as const, bidCapCents, quality })

  it('com o mesmo lance, o anúncio menos escondido vence', () => {
    expect(runAuction([cpm('incomoda', 1000, 0.6), cpm('bom', 1000, 1)], () => 0.5)?.winner.adId).toBe('bom')
  })

  it('quem incomoda ainda pode vencer pagando bem mais, e paga mais caro por isso', () => {
    const result = runAuction([cpm('incomoda', 1800, 0.6), cpm('bom', 1000, 1)], () => 0.5)
    expect(result?.winner.adId).toBe('incomoda') // 1800 x 0,6 = 1080 > 1000
    expect(result?.priceCents).toBe(Math.ceil(1000 / 0.6)) // paga o que bastava para passar o segundo
    expect(result?.priceCents).toBeLessThanOrEqual(1800)
  })

  it('sem qualidade informada vale 1 (como antes)', () => {
    expect(runAuction([cpm('a', 1200), cpm('b', 1000)], () => 0.5)?.winner.adId).toBe('a')
    expect(runAuction([cpm('a', 1200), cpm('b', 1000)], () => 0.5)?.priceCents).toBe(1000)
  })
})

describe('entrega usa a qualidade do histórico', () => {
  const USER = (() => {
    for (let index = 0; index < 100; index += 1) if (!isHoldout(`u-${index}`, 0.05)) return `u-${index}`
    throw new Error('sem usuário fora do grupo de controle')
  })()
  const NOW = new Date('2026-11-22T12:00:00Z')
  const ad = (id: string) => ({
    id,
    adSetId: `set-${id}`,
    creative: { headline: 'Pão', body: 'Quente', ctaLabel: 'Saiba mais', destinationUrl: 'https://padaria.example/', media: [] },
    adSet: {
      dailyBudgetCents: 1000, bidCapCents: 1000, states: [], cities: [], interests: [], ageBands: [], genders: [], automaticAudience: false,
      campaign: { objective: 'AWARENESS', account: { id: 'acc-1', balanceCents: 5000, pendingSpendMillicents: 0, companyId: 'co-1', company: { id: 'co-1', tradeName: 'Padaria', username: 'padaria', logoUrl: null } } },
    },
  })

  it('o anúncio que as pessoas escondem perde para o outro com o mesmo lance', async () => {
    const repo = {
      findViewerFacts: jest.fn().mockResolvedValue({ city: 'São Paulo', state: 'SP', birthDate: null, gender: null, adPreference: null }),
      hiddenCompanyIds: jest.fn().mockResolvedValue([]),
      excludedAdIds: jest.fn().mockResolvedValue([]),
      findCandidates: jest.fn().mockResolvedValue([ad('incomoda'), ad('bom')]),
      spentTodayByAdSet: jest.fn().mockResolvedValue(new Map()),
      clickStatsByAd: jest.fn().mockResolvedValue(
        new Map([
          ['incomoda', { impressions: 5000, viewable: 4000, clicks: 40, hides: 600 }],
          ['bom', { impressions: 5000, viewable: 4000, clicks: 40, hides: 20 }],
        ]),
      ),
      platformClickStats: jest.fn().mockResolvedValue({ viewable: 0, clicks: 0 }),
    advertiserStats: jest.fn().mockResolvedValue(new Map()),
      createImpression: jest.fn().mockResolvedValue({ id: 'imp-1' }),
    }
    const service = new AdsDeliveryService(repo as never, { getPublicUrl: (k: string) => k } as never, { build: (t: string) => t } as never, { companiesTargetedNear: jest.fn().mockResolvedValue([]) } as never)
    expect((await service.next(USER, { surface: 'FEED_FOR_YOU' }, NOW, () => 0.5))?.adId).toBe('bom')
  })
})
