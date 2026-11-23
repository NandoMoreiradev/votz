import { QUALITY, advertiserRejectionRate, explorationChance, EXPLORATION, qualityFactor } from './delivery-rules'
import {
  MIN_SAMPLE_PER_ARM,
  activeExperiment,
  assignArm,
  compareProportions,
  experimentLabel,
  experimentProblems,
  stableUnit,
  type DeliveryExperiment,
} from './experiments'

const experiment = (over: Partial<DeliveryExperiment> = {}): DeliveryExperiment => ({
  key: 'exploracao',
  mode: 'AB',
  trafficShare: 1,
  arms: [
    { key: 'controle', weight: 1, overrides: {} },
    { key: 'teste', weight: 1, overrides: { explorationTargetShare: 0.15 } },
  ],
  ...over,
})

describe('stableUnit', () => {
  it('é sempre o mesmo para o mesmo texto e fica entre 0 e 1', () => {
    expect(stableUnit('abc')).toBe(stableUnit('abc'))
    for (const text of ['', 'a', 'u-1', 'um texto bem maior com acentuação: ã é ç']) {
      expect(stableUnit(text)).toBeGreaterThanOrEqual(0)
      expect(stableUnit(text)).toBeLessThan(1)
    }
  })
  it('espalha por igual: dez mil ids ficam perto de metade abaixo de 0,5 e em cada décimo', () => {
    const buckets = new Array(10).fill(0)
    for (let index = 0; index < 10_000; index += 1) buckets[Math.floor(stableUnit(`user-${index}`) * 10)] += 1
    for (const count of buckets) {
      expect(count).toBeGreaterThan(850)
      expect(count).toBeLessThan(1150)
    }
  })
})

describe('assignArm', () => {
  it('a mesma pessoa cai sempre no mesmo braço', () => {
    const first = assignArm('pessoa-1', experiment())
    for (let run = 0; run < 20; run += 1) expect(assignArm('pessoa-1', experiment())).toEqual(first)
  })

  it('divide pelo peso dos braços (50/50 e 80/20)', () => {
    const count = (exp: DeliveryExperiment) => {
      const result: Record<string, number> = {}
      for (let index = 0; index < 20_000; index += 1) {
        const arm = assignArm(`u-${index}`, exp)
        result[arm!.key] = (result[arm!.key] ?? 0) + 1
      }
      return result
    }
    const even = count(experiment())
    expect(even.controle / 20_000).toBeGreaterThan(0.48)
    expect(even.controle / 20_000).toBeLessThan(0.52)
    const skewed = count(experiment({ arms: [{ key: 'controle', weight: 4, overrides: {} }, { key: 'teste', weight: 1, overrides: { reportWeight: 10 } }] }))
    expect(skewed.controle / 20_000).toBeGreaterThan(0.78)
    expect(skewed.controle / 20_000).toBeLessThan(0.82)
  })

  it('só uma parte das pessoas entra (trafficShare); as outras ficam fora (null)', () => {
    const exp = experiment({ trafficShare: 0.2 })
    let inside = 0
    for (let index = 0; index < 20_000; index += 1) if (assignArm(`u-${index}`, exp)) inside += 1
    expect(inside / 20_000).toBeGreaterThan(0.18)
    expect(inside / 20_000).toBeLessThan(0.22)
  })

  it('entrar no experimento e o braço são sorteios independentes (o braço não depende de a pessoa ter entrado)', () => {
    const exp = experiment({ trafficShare: 0.3 })
    const inside = { controle: 0, teste: 0 }
    for (let index = 0; index < 30_000; index += 1) {
      const arm = assignArm(`u-${index}`, exp)
      if (arm) inside[arm.key as 'controle' | 'teste'] += 1
    }
    const total = inside.controle + inside.teste
    expect(inside.controle / total).toBeGreaterThan(0.47)
    expect(inside.controle / total).toBeLessThan(0.53)
  })

  it('cada experimento sorteia por conta própria (não é o mesmo braço nos dois)', () => {
    let same = 0
    for (let index = 0; index < 5_000; index += 1) if (assignArm(`u-${index}`, experiment({ key: 'um' }))!.key === assignArm(`u-${index}`, experiment({ key: 'outro' }))!.key) same += 1
    expect(same / 5_000).toBeGreaterThan(0.45)
    expect(same / 5_000).toBeLessThan(0.55)
  })
})

describe('experimentProblems', () => {
  it('uma definição boa não tem problema', () => {
    expect(experimentProblems(experiment())).toEqual([])
  })
  it.each([
    ['nome inválido', { key: 'Nome Ruim!' }],
    ['um braço só', { arms: [{ key: 'controle', weight: 1, overrides: {} }] }],
    ['tráfego zero', { trafficShare: 0 }],
    ['tráfego acima de 1', { trafficShare: 1.5 }],
    ['modo desconhecido', { mode: 'X' as never }],
    ['braço repetido', { arms: [{ key: 'a', weight: 1, overrides: {} }, { key: 'a', weight: 1, overrides: {} }] }],
    ['peso zero', { arms: [{ key: 'a', weight: 1, overrides: {} }, { key: 'b', weight: 0, overrides: {} }] }],
    ['controle que muda algo', { arms: [{ key: 'a', weight: 1, overrides: { reportWeight: 9 } }, { key: 'b', weight: 1, overrides: {} }] }],
    ['alvo de exploração acima de 1', { arms: [{ key: 'a', weight: 1, overrides: {} }, { key: 'b', weight: 1, overrides: { explorationTargetShare: 2 } }] }],
    ['peso negativo', { arms: [{ key: 'a', weight: 1, overrides: {} }, { key: 'b', weight: 1, overrides: { qualityWeight: -1 } }] }],
    ['teto de penalidade absurdo', { arms: [{ key: 'a', weight: 1, overrides: {} }, { key: 'b', weight: 1, overrides: { qualityMaxPenalty: 0.99 } }] }],
    ['fim antes do começo', { startsAt: '2026-12-02T00:00:00Z', endsAt: '2026-12-01T00:00:00Z' }],
  ])('recusa %s', (_name, over) => {
    expect(experimentProblems(experiment(over as Partial<DeliveryExperiment>)).length).toBeGreaterThan(0)
  })
})

describe('activeExperiment', () => {
  const now = new Date('2026-11-22T12:00:00Z')
  it('sem experimentos, nenhum', () => {
    expect(activeExperiment([], now)).toBeNull()
  })
  it('respeita a janela de datas', () => {
    const windowed = experiment({ startsAt: '2026-11-23T00:00:00Z', endsAt: '2026-11-30T00:00:00Z' })
    expect(activeExperiment([windowed], now)).toBeNull()
    expect(activeExperiment([windowed], new Date('2026-11-25T00:00:00Z'))).toBe(windowed)
    expect(activeExperiment([windowed], new Date('2026-11-30T00:00:00Z'))).toBeNull()
  })
  it('experimento inválido nunca roda; o próximo válido assume', () => {
    const bad = experiment({ key: 'ruim!' })
    const good = experiment({ key: 'bom' })
    expect(activeExperiment([bad, good], now)).toBe(good)
  })
  it('o rótulo gravado na exibição é "experimento:braço"', () => {
    expect(experimentLabel({ key: 'exploracao' }, { key: 'teste' })).toBe('exploracao:teste')
  })
})

describe('compareProportions (teste de duas proporções)', () => {
  it('10% contra 13% em mil de cada lado passa do acaso (z ~ 2,1)', () => {
    const result = compareProportions({ success: 100, total: 1000 }, { success: 130, total: 1000 })
    expect(result.difference).toBeCloseTo(0.03, 10)
    expect(result.z).toBeCloseTo(2.1, 1)
    expect(result.significant).toBe(true)
    expect(result.tooSmall).toBe(false)
  })
  it('a mesma diferença em cem de cada lado é amostra pequena: nunca "significativa"', () => {
    const result = compareProportions({ success: 10, total: 100 }, { success: 13, total: 100 })
    expect(result.tooSmall).toBe(true)
    expect(result.significant).toBe(false)
  })
  it('taxas iguais dão z zero; diferença para baixo dá z negativo', () => {
    expect(compareProportions({ success: 50, total: 1000 }, { success: 50, total: 1000 }).z).toBe(0)
    expect(compareProportions({ success: 150, total: 1000 }, { success: 100, total: 1000 }).z).toBeLessThan(-1.96)
  })
  it('sem exibições não quebra', () => {
    expect(compareProportions({ success: 0, total: 0 }, { success: 0, total: 0 })).toMatchObject({ difference: 0, z: 0, significant: false, tooSmall: true })
    expect(MIN_SAMPLE_PER_ARM).toBeGreaterThan(0)
  })
  it('amostra grande com diferença minúscula não passa do acaso', () => {
    expect(compareProportions({ success: 5000, total: 100_000 }, { success: 5010, total: 100_000 }).significant).toBe(false)
  })
})

describe('parâmetros por braço nas regras', () => {
  it('alvo de exploração do braço vale sem contadores e no meio da faixa; teto e piso valem para todos', () => {
    expect(explorationChance(null, 0.2)).toBe(0.2)
    expect(explorationChance({ total: 100, explored: 7 }, 0.2)).toBe(0.2)
    expect(explorationChance({ total: 100, explored: 12 }, 0.2)).toBe(0) // o teto não solta
    expect(explorationChance({ total: 100, explored: 1 }, 0.01)).toBe(1) // o piso também não
    expect(explorationChance(null)).toBe(EXPLORATION.TARGET_SHARE)
  })
  it('peso da denúncia do braço muda a penalidade', () => {
    const normal = qualityFactor(0, 1000, { reports: 10 })
    const heavier = qualityFactor(0, 1000, { reports: 10, reportWeight: 20 })
    const lighter = qualityFactor(0, 1000, { reports: 10, reportWeight: 1 })
    expect(heavier).toBeLessThan(normal)
    expect(lighter).toBeGreaterThan(normal)
    expect(qualityFactor(0, 1000, { reports: 10, reportWeight: QUALITY.REPORT_WEIGHT })).toBeCloseTo(normal, 10)
  })
  it('peso e teto da penalidade do braço', () => {
    expect(qualityFactor(80, 1000, { weight: 0 })).toBe(1)
    expect(qualityFactor(80, 1000, { weight: 10 })).toBeLessThan(qualityFactor(80, 1000))
    expect(qualityFactor(900, 1000, { maxPenalty: 0.2 })).toBeCloseTo(0.8, 10)
    expect(qualityFactor(900, 1000)).toBeCloseTo(1 - QUALITY.MAX_PENALTY, 10)
  })
  it('o peso da denúncia também vale na taxa da empresa', () => {
    const stats = { impressions: 10_000, hides: 100, reports: 50 }
    expect(advertiserRejectionRate(stats, 20)).toBeGreaterThan(advertiserRejectionRate(stats))
    expect(advertiserRejectionRate(stats, QUALITY.REPORT_WEIGHT)).toBeCloseTo(advertiserRejectionRate(stats), 10)
  })
})
