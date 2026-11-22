import {
  CTR_MODEL,
  PACING,
  PRIOR_CTR,
  auctionClickRate,
  clickRatePosterior,
  dayElapsedFraction,
  pacingChance,
  runAuction,
  sampleBeta,
} from './delivery-rules'

/** Gerador pseudoaleatório com semente fixa (mulberry32), para o teste ser sempre o mesmo. */
function seeded(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('chance de clique medida', () => {
  it('sem dado, é a de partida', () => {
    expect(clickRatePosterior(0, 0).mean).toBeCloseTo(PRIOR_CTR, 10)
  })

  it('com poucos dados mexe pouco; com muitos, vai para o que o anúncio fez', () => {
    expect(clickRatePosterior(5, 100).mean).toBeGreaterThan(PRIOR_CTR)
    expect(clickRatePosterior(5, 100).mean).toBeLessThan(0.05)
    expect(clickRatePosterior(500, 10_000).mean).toBeCloseTo(0.05, 1)
    expect(clickRatePosterior(0, 10_000).mean).toBeLessThan(0.001)
  })

  it('clique sem exibição vista não passa de 100% e valor ruim não quebra', () => {
    expect(clickRatePosterior(50, 10).mean).toBeLessThanOrEqual(1)
    expect(clickRatePosterior(-3, -5).mean).toBeCloseTo(PRIOR_CTR, 10)
  })

  it('a chance de partida da plataforma desloca o começo', () => {
    expect(clickRatePosterior(0, 0, 0.03).mean).toBeCloseTo(0.03, 10)
  })

  it('o sorteio da Beta tem média e espalhamento certos', () => {
    const random = seeded(7)
    const draws = Array.from({ length: 4000 }, () => sampleBeta(2, 198, random))
    const mean = draws.reduce((total, value) => total + value, 0) / draws.length
    expect(mean).toBeGreaterThan(0.008)
    expect(mean).toBeLessThan(0.012)
    expect(draws.every((value) => value > 0 && value < 1)).toBe(true)
    // Tem espalhamento: é isso que faz o anúncio novo explorar.
    expect(Math.max(...draws)).toBeGreaterThan(mean * 2)
  })

  it('anúncio novo é sorteado; anúncio com muita exibição vale a média, sem sorte', () => {
    const rate = clickRatePosterior(100, 2000)
    const same = new Set([1, 2, 3, 4].map((seed) => auctionClickRate(rate, 2000, seeded(seed))))
    expect(same.size).toBe(1)
    expect([...same][0]).toBe(rate.mean)
    const fresh = clickRatePosterior(1, 20)
    const sampled = new Set([1, 2, 3, 4].map((seed) => auctionClickRate(fresh, 20, seeded(seed))))
    expect(sampled.size).toBeGreaterThan(1)
    expect(CTR_MODEL.EXPLORE_BELOW_VIEWABLE).toBeGreaterThan(20)
  })
})

describe('leilão com chance de clique própria', () => {
  const click = (adId: string, clickRate: number, bidCapCents = 40) => ({ adId, objective: 'TRAFFIC' as const, bidCapCents, clickRate })

  it('o anúncio que clica mais vence com o mesmo lance', () => {
    expect(runAuction([click('fraco', 0.005), click('forte', 0.04)], () => 0.5)?.winner.adId).toBe('forte')
  })

  it('paga só o que bastava para passar o segundo, nunca acima do lance nem abaixo do piso', () => {
    const result = runAuction(
      [
        { adId: 'a', objective: 'TRAFFIC', bidCapCents: 200, clickRate: 0.04 },
        { adId: 'b', objective: 'TRAFFIC', bidCapCents: 100, clickRate: 0.01 },
      ],
      () => 0.5,
    )
    expect(result?.winner.adId).toBe('a')
    expect(result?.priceCents).toBe(Math.max(40, Math.ceil((100 * 1000 * 0.01) / (1000 * 0.04))))
    expect(result?.priceCents).toBeLessThan(200)
  })

  it('anúncio por mil exibições compete com o de clique pelo valor esperado', () => {
    const cpm = { adId: 'cpm', objective: 'AWARENESS' as const, bidCapCents: 1500 }
    expect(runAuction([cpm, click('clique', 0.05, 40)], () => 0.5)?.winner.adId).toBe('clique') // 40 x 1000 x 0,05 = 2000 > 1500
    expect(runAuction([cpm, click('clique', 0.01, 40)], () => 0.5)?.winner.adId).toBe('cpm') // 400 < 1500
  })

  it('sem chance própria, vale a de partida (comportamento de antes)', () => {
    const a = { adId: 'a', objective: 'TRAFFIC' as const, bidCapCents: 100 }
    const b = { adId: 'b', objective: 'TRAFFIC' as const, bidCapCents: 60 }
    expect(runAuction([a, b], () => 0.5)?.winner.adId).toBe('a')
  })
})

describe('ritmo do orçamento (pacing)', () => {
  const budget = 100_000

  it('no ritmo, ou atrás, entra sempre', () => {
    expect(pacingChance({ spentMillicents: 0, dailyBudgetMillicents: budget, elapsedFraction: 0.1 })).toBe(1)
    expect(pacingChance({ spentMillicents: 20_000, dailyBudgetMillicents: budget, elapsedFraction: 0.1 })).toBe(1)
  })

  it('adiantado demais é freado aos poucos até zero', () => {
    const mid = pacingChance({ spentMillicents: 27_500, dailyBudgetMillicents: budget, elapsedFraction: 0.1 })
    expect(mid).toBeGreaterThan(0.4)
    expect(mid).toBeLessThan(0.6)
    expect(pacingChance({ spentMillicents: 60_000, dailyBudgetMillicents: budget, elapsedFraction: 0.1 })).toBe(0)
  })

  it('no fim do dia ninguém é freado, mesmo gastando quase tudo', () => {
    expect(pacingChance({ spentMillicents: 99_000, dailyBudgetMillicents: budget, elapsedFraction: 0.95 })).toBe(1)
    expect(PACING.SLACK + PACING.BAND).toBeLessThan(1)
  })

  it('orçamento zero nunca entra', () => {
    expect(pacingChance({ spentMillicents: 0, dailyBudgetMillicents: 0, elapsedFraction: 0.5 })).toBe(0)
  })

  it('o relógio é o de São Paulo', () => {
    expect(dayElapsedFraction(new Date('2026-11-22T12:00:00Z'))).toBeCloseTo(9 / 24, 5)
    expect(dayElapsedFraction(new Date('2026-11-22T02:30:00Z'))).toBeCloseTo((23 * 60 + 30) / 1440, 5)
  })
})
