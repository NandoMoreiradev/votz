import { AdsExperimentsService } from './ads-experiments.service'
import { buildArmReport, buildShadowReport, compareArms, formatExperimentReport, verdictOf, type ArmTotals, type ShadowTotals } from './experiment-report'
import { compareProportions } from '../ads-delivery/experiments'

const totals = (over: Partial<ArmTotals> = {}): ArmTotals => ({ impressions: 10_000, viewable: 6_000, clicks: 300, hides: 100, reports: 10, spendMillicents: 6_000_000, ...over })

describe('buildArmReport', () => {
  it('calcula as taxas e a receita por mil exibições em reais', () => {
    const report = buildArmReport('controle', totals())
    expect(report.clickRate).toBeCloseTo(0.05, 10) // 300 cliques em 6.000 vistas
    expect(report.hideRate).toBeCloseTo(0.01, 10)
    expect(report.reportRate).toBeCloseTo(0.001, 10)
    // 6.000.000 milésimos = 6.000 centavos = R$ 60,00 em 10.000 exibições = R$ 6,00 por mil.
    expect(report.revenuePerThousand).toBeCloseTo(6, 10)
  })
  it('sem exibições não divide por zero', () => {
    expect(buildArmReport('vazio', totals({ impressions: 0, viewable: 0, clicks: 0, hides: 0, reports: 0, spendMillicents: 0 }))).toMatchObject({ clickRate: 0, hideRate: 0, reportRate: 0, revenuePerThousand: 0 })
  })
})

describe('compareArms e veredito', () => {
  const control = buildArmReport('controle', totals())

  it('mais cliques, rejeição igual: melhor em cliques', () => {
    const test = buildArmReport('teste', totals({ clicks: 420, spendMillicents: 6_500_000 }))
    const result = compareArms(control, test)
    expect(result.clickRate.significant).toBe(true)
    expect(result.verdict).toBe('Melhor em cliques, sem piorar a rejeição.')
    expect(result.revenueDifference).toBeCloseTo(0.5, 10)
    expect(result.versus).toBe('controle')
  })

  it('mais cliques mas muito mais gente escondendo: pior, não adote', () => {
    const test = buildArmReport('teste', totals({ clicks: 420, hides: 250 }))
    expect(compareArms(control, test).verdict).toMatch(/^Pior: mais gente esconde ou denuncia/)
  })

  it('mais denúncia basta para ser pior, mesmo sem esconder a mais', () => {
    const test = buildArmReport('teste', totals({ reports: 60 }))
    expect(compareArms(control, test).verdict).toMatch(/^Pior/)
  })

  it('mais cliques e menos rejeição: melhor nos dois', () => {
    const test = buildArmReport('teste', totals({ clicks: 420, hides: 40 }))
    expect(compareArms(control, test).verdict).toBe('Melhor: mais cliques e menos rejeição.')
  })

  it('menos rejeição sem mudar cliques: melhor na rejeição', () => {
    const test = buildArmReport('teste', totals({ hides: 40 }))
    expect(compareArms(control, test).verdict).toBe('Melhor na rejeição (menos esconder ou denúncia), sem diferença em cliques.')
  })

  it('menos cliques, rejeição igual: pior em cliques', () => {
    const test = buildArmReport('teste', totals({ clicks: 200 }))
    expect(compareArms(control, test).verdict).toBe('Pior em cliques, sem diferença na rejeição.')
  })

  it('diferença dentro do acaso: sem diferença', () => {
    const test = buildArmReport('teste', totals({ clicks: 305, hides: 102 }))
    expect(compareArms(control, test).verdict).toBe('Sem diferença que passe do acaso até agora.')
  })

  it('amostra pequena: pede para deixar rodar, mesmo com números bonitos', () => {
    const small = (over: Partial<ArmTotals>) => buildArmReport('x', totals({ impressions: 100, viewable: 60, clicks: 3, hides: 1, reports: 0, spendMillicents: 60_000, ...over }))
    const result = compareArms(small({}), { ...small({ clicks: 9 }), arm: 'teste' })
    expect(result.verdict).toMatch(/^Amostra pequena demais/)
  })

  it('verdictOf com tudo "too small" só olha a amostra', () => {
    const tiny = compareProportions({ success: 1, total: 5 }, { success: 4, total: 5 })
    expect(verdictOf(tiny, tiny, tiny)).toMatch(/^Amostra pequena/)
  })
})

describe('sombra', () => {
  const shadow = (over: Partial<ShadowTotals> = {}): ShadowTotals => ({ total: 200, agreed: 150, shadowFilledGap: 5, shadowLeftEmpty: 2, avgServedEcpmCents: 40, avgShadowEcpmCents: 46, ...over })

  it('taxa de discordância e diferença do valor por mil exibições (em reais)', () => {
    const report = buildShadowReport('sem-penalidade', shadow({ avgServedEcpmCents: 400, avgShadowEcpmCents: 460 }))
    expect(report.disagreementRate).toBeCloseTo(0.25, 10)
    expect(report.ecpmDifference).toBeCloseTo(0.6, 10)
  })
  it('sem decisão com os dois valores, a diferença é nula', () => {
    expect(buildShadowReport('x', shadow({ avgServedEcpmCents: null, avgShadowEcpmCents: null })).ecpmDifference).toBeNull()
    expect(buildShadowReport('x', shadow({ total: 0, agreed: 0 })).disagreementRate).toBe(0)
  })
})

describe('formatExperimentReport', () => {
  it('mostra cada braço, a comparação, o veredito e a sombra em português', () => {
    const control = buildArmReport('controle', totals())
    const test = buildArmReport('teste', totals({ clicks: 420 }))
    const text = formatExperimentReport({
      key: 'exploracao',
      days: 14,
      arms: [control, test],
      comparisons: [compareArms(control, test)],
      shadow: [buildShadowReport('sombra', { total: 100, agreed: 90, shadowFilledGap: 1, shadowLeftEmpty: 0, avgServedEcpmCents: 400, avgShadowEcpmCents: 380 })],
    })
    expect(text).toContain('Experimento "exploracao" (últimos 14 dias)')
    expect(text).toContain('Braço controle: 10000 exibições')
    expect(text).toContain('teste contra controle')
    expect(text).toContain('=> Melhor em cliques')
    expect(text).toContain('Sombra, braço sombra: 100 decisões, discordou do controle em 10.0%')
    expect(text).toContain('R$ 6,00 por mil exibições')
  })
  it('experimento sem exibição diz isso', () => {
    expect(formatExperimentReport({ key: 'x', days: 7, arms: [], comparisons: [], shadow: [] })).toContain('Nenhuma exibição com este experimento ainda.')
  })
})

describe('AdsExperimentsService.report', () => {
  const repo = () => ({
    armLabels: jest.fn().mockResolvedValue(['teste-a:controle', 'teste-a:variante']),
    armTotals: jest.fn().mockImplementation(async (label: string) => (label.endsWith('controle') ? totals() : totals({ clicks: 420 }))),
    shadowTotals: jest.fn().mockResolvedValue(new Map([['variante', { total: 50, agreed: 40, shadowFilledGap: 0, shadowLeftEmpty: 0, avgServedEcpmCents: null, avgShadowEcpmCents: null }]])),
  })

  it('monta os braços sem o nome do experimento, compara cada um com o controle e junta a sombra', async () => {
    const report = await new AdsExperimentsService(repo() as never).report('teste-a', 14, 'controle', new Date('2026-11-22T12:00:00Z'))
    expect(report.arms.map((arm) => arm.arm)).toEqual(['controle', 'variante'])
    expect(report.comparisons).toHaveLength(1)
    expect(report.comparisons[0]).toMatchObject({ arm: 'variante', versus: 'controle' })
    expect(report.shadow[0]).toMatchObject({ arm: 'variante', total: 50 })
  })
  it('lê desde a data certa e sem o controle informado usa o primeiro braço', async () => {
    const fake = repo()
    const now = new Date('2026-11-22T12:00:00Z')
    const report = await new AdsExperimentsService(fake as never).report('teste-a', 7, undefined, now)
    expect(fake.armLabels).toHaveBeenCalledWith('teste-a', new Date('2026-11-15T12:00:00Z'))
    expect(report.comparisons[0].versus).toBe('controle')
  })
  it('experimento sem exibição devolve listas vazias', async () => {
    const fake = repo()
    fake.armLabels.mockResolvedValue([])
    fake.shadowTotals.mockResolvedValue(new Map())
    expect(await new AdsExperimentsService(fake as never).report('nada')).toMatchObject({ arms: [], comparisons: [], shadow: [] })
  })
})
