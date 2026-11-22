import { QUALITY, qualityFactor, runAuction } from './delivery-rules'
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
    creative: { headline: 'Pão', body: 'Quente', ctaLabel: 'Saiba mais', destinationUrl: 'https://padaria.example/', media: null },
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
      createImpression: jest.fn().mockResolvedValue({ id: 'imp-1' }),
    }
    const service = new AdsDeliveryService(repo as never, { getPublicUrl: (k: string) => k } as never, { build: (t: string) => t } as never, { companiesTargetedNear: jest.fn().mockResolvedValue([]) } as never)
    expect((await service.next(USER, { surface: 'FEED_FOR_YOU' }, NOW, () => 0.5))?.adId).toBe('bom')
  })
})
