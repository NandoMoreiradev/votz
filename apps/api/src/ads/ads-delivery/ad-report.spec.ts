import { fillAdStatDays, summarizeAdStats, type AdDailyStatView } from '@votz/shared-types'

const row = (day: string, patch: Partial<AdDailyStatView> = {}): AdDailyStatView => ({ day, impressions: 0, viewableImpressions: 0, clicks: 0, hides: 0, spendCents: 0, ...patch })

describe('relatório do anunciante', () => {
  it('completa os dias sem movimento, do mais antigo até hoje', () => {
    const filled = fillAdStatDays([row('2026-11-21', { viewableImpressions: 5 })], 4, '2026-11-22')
    expect(filled.map((item) => item.day)).toEqual(['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
    expect(filled[2].viewableImpressions).toBe(5)
    expect(filled[0].impressions).toBe(0)
  })

  it('atravessa a virada de mês', () => {
    expect(fillAdStatDays([], 3, '2026-12-01').map((item) => item.day)).toEqual(['2026-11-29', '2026-11-30', '2026-12-01'])
  })

  it('soma e calcula taxa de cliques, custo por mil e por clique', () => {
    const totals = summarizeAdStats([
      row('2026-11-21', { impressions: 600, viewableImpressions: 400, clicks: 4, hides: 1, spendCents: 300 }),
      row('2026-11-22', { impressions: 500, viewableImpressions: 600, clicks: 6, hides: 2, spendCents: 450 }),
    ])
    expect(totals).toMatchObject({ impressions: 1100, viewableImpressions: 1000, clicks: 10, hides: 3, spendCents: 750 })
    expect(totals.ctrPercent).toBe(1)
    expect(totals.cpmCents).toBe(750)
    expect(totals.cpcCents).toBe(75)
  })

  it('sem exibição vista nem clique, as taxas ficam vazias (sem dividir por zero)', () => {
    const totals = summarizeAdStats([row('2026-11-22', { impressions: 3 })])
    expect(totals.ctrPercent).toBeNull()
    expect(totals.cpmCents).toBeNull()
    expect(totals.cpcCents).toBeNull()
  })
})
