import {
  formatCountPtBr,
  formatDateBr,
  formatDateTimeBr,
  formatDecimalPtBr,
  formatDurationPtBr,
  formatGapDaysPtBr,
  formatMonthOrDateBr,
  formatPercentPtBr,
  formatShortDateBr,
} from './votz-visual'

describe('Shared pt-BR formatters (G2 boundary values: 0, 1, 999.95, 1000, null)', () => {
  it('formats counts with thousand separators and handles boundary values', () => {
    expect(formatCountPtBr(0)).toBe('0')
    expect(formatCountPtBr(1)).toBe('1')
    expect(formatCountPtBr(999.95)).toBe('1.000')
    expect(formatCountPtBr(1000)).toBe('1.000')
    expect(formatCountPtBr(1248)).toBe('1.248')
    expect(formatCountPtBr(null)).toBe('—')
  })

  it('formats decimals with pt-BR comma and thousand separators at boundaries', () => {
    expect(formatDecimalPtBr(0, 1)).toBe('0')
    expect(formatDecimalPtBr(1, 1)).toBe('1')
    expect(formatDecimalPtBr(999.95, 1)).toBe('1.000')
    expect(formatDecimalPtBr(999.95, 2)).toBe('999,95')
    expect(formatDecimalPtBr(1000, 1)).toBe('1.000')
    expect(formatDecimalPtBr(null, 1)).toBe('—')
  })

  it('formats percentages in pt-BR across 1-decimal default and 2-decimal dashboard precision', () => {
    expect(formatPercentPtBr(0)).toBe('0%')
    expect(formatPercentPtBr(1)).toBe('1%')
    expect(formatPercentPtBr(29.79, 2)).toBe('29,79%')
    expect(formatPercentPtBr(999.95)).toBe('1.000%')
    expect(formatPercentPtBr(999.95, 2)).toBe('999,95%')
    expect(formatPercentPtBr(1000)).toBe('1.000%')
    expect(formatPercentPtBr(null)).toBe('—')
  })

  it('formats durations cleanly in both PDF/card mode (48h / dias) and dashboard mode (24h / d)', () => {
    expect(formatDurationPtBr(0)).toBe('0 h')
    expect(formatDurationPtBr(1)).toBe('1 h')
    expect(formatDurationPtBr(999.95)).toBe('41,7 dias')
    expect(formatDurationPtBr(1000)).toBe('41,7 dias')
    expect(formatDurationPtBr(null)).toBe('—')

    expect(formatDurationPtBr(17.4, { dayThresholdHours: 24, dayUnit: 'd' })).toBe('17,4 h')
    expect(formatDurationPtBr(38.4, { dayThresholdHours: 24, dayUnit: 'd' })).toBe('1,6 d')
    expect(formatDurationPtBr(127.2, { dayThresholdHours: 24, dayUnit: 'd' })).toBe('5,3 d')
  })

  it('formats recurrence average gap days with 1 decimal and singular/plural agreement', () => {
    expect(formatGapDaysPtBr(0)).toBe('0 dias')
    expect(formatGapDaysPtBr(0.9)).toBe('0,9 dia')
    expect(formatGapDaysPtBr(0.9999997622863248)).toBe('1 dia')
    expect(formatGapDaysPtBr(1)).toBe('1 dia')
    expect(formatGapDaysPtBr(2.5)).toBe('2,5 dias')
    expect(formatGapDaysPtBr(999.95)).toBe('1.000 dias')
    expect(formatGapDaysPtBr(1000)).toBe('1.000 dias')
    expect(formatGapDaysPtBr(null)).toBe('—')
  })

  it('formats ISO dates and timestamps cleanly into dd/mm, mm/aaaa, dd/mm/aaaa and dd/mm/aaaa HH:mm', () => {
    expect(formatDateBr('2026-11-16')).toBe('16/11/2026')
    expect(formatDateBr(null)).toBe('—')
    expect(formatShortDateBr('2026-11-16')).toBe('16/11')
    expect(formatShortDateBr('2026-11')).toBe('11/2026')
    expect(formatShortDateBr('Saúde')).toBe('Saúde')
    expect(formatMonthOrDateBr('2026-11-16')).toBe('16/11/2026')
    expect(formatMonthOrDateBr('2026-11')).toBe('11/2026')
    expect(formatDateTimeBr('2026-11-01T12:00:00.000Z')).toBe('01/11/2026 09:00')
    expect(formatDateTimeBr(null)).toBe('—')
  })
})
