const SAO_PAULO_DATE_FMT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const SAO_PAULO_DATETIME_FMT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function roundHalfUp(value: number, maxDecimals: number): number {
  const factor = 10 ** Math.max(0, maxDecimals)
  const scaled = value * factor
  const rounded = Math.round(scaled + (scaled >= 0 ? Number.EPSILON : -Number.EPSILON)) / factor
  return Object.is(rounded, -0) ? 0 : rounded
}

/**
 * Formata uma data ISO (`YYYY-MM-DD`) ou timestamp ISO em `dd/mm/aaaa` (America/Sao_Paulo).
 */
export function formatDateBr(value: string | null | undefined): string {
  if (!value) return '—'
  const trimmed = value.trim()
  if (!trimmed) return '—'
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})(?:$|T00:00:00(?:\.000)?Z$)/.exec(trimmed)
  if (dateOnly) {
    return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`
  }
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    const prefix = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)
    return prefix ? `${prefix[3]}/${prefix[2]}/${prefix[1]}` : trimmed
  }
  return SAO_PAULO_DATE_FMT.format(parsed)
}

/**
 * Formata buckets/datas ISO para rótulos curtos de eixo (`YYYY-MM-DD` -> `dd/mm`, `YYYY-MM` -> `mm/aaaa`).
 * Textos não-ISO (ex.: nomes de categoria ou faixas) são preservados sem alteração.
 */
export function formatShortDateBr(value: string | null | undefined): string {
  if (!value) return '—'
  const trimmed = value.trim()
  if (!trimmed) return '—'
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (dateOnly) {
    return `${dateOnly[3]}/${dateOnly[2]}`
  }
  const monthOnly = /^(\d{4})-(\d{2})$/.exec(trimmed)
  if (monthOnly) {
    return `${monthOnly[2]}/${monthOnly[1]}`
  }
  return trimmed
}

/**
 * Formata buckets/datas ISO para exibição completa em tabelas/tooltips (`YYYY-MM-DD` -> `dd/mm/aaaa`, `YYYY-MM` -> `mm/aaaa`).
 */
export function formatMonthOrDateBr(value: string | null | undefined): string {
  if (!value) return '—'
  const trimmed = value.trim()
  if (!trimmed) return '—'
  const monthOnly = /^(\d{4})-(\d{2})$/.exec(trimmed)
  if (monthOnly) {
    return `${monthOnly[2]}/${monthOnly[1]}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return formatDateBr(trimmed)
  }
  return trimmed
}

/**
 * Formata timestamp ISO em `dd/mm/aaaa HH:mm` (America/Sao_Paulo).
 */
export function formatDateTimeBr(value: string | null | undefined): string {
  if (!value) return '—'
  const trimmed = value.trim()
  if (!trimmed) return '—'
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return formatDateBr(trimmed)
  }
  return SAO_PAULO_DATETIME_FMT.format(parsed).replace(',', '')
}

/**
 * Formata número decimal em pt-BR com separador de milhar (`.`) e vírgula decimal.
 */
export function formatDecimalPtBr(
  value: number | null | undefined,
  maxDecimals = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const rounded = roundHalfUp(value, maxDecimals)
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.max(0, maxDecimals),
  }).format(rounded)
}

export interface FormatDurationOptions {
  /** Limiar em horas a partir do qual passa a exibir em dias (padrão: 48h). */
  dayThresholdHours?: number
  /** Unidade de dias exibida acima do limiar (padrão: 'dias'). */
  dayUnit?: 'dias' | 'd'
}

/**
 * Formata durações em pt-BR (`"18,5 h"`, `"14 h"`, `"5,9 dias"`, ou `"1,6 d"` com `dayUnit: 'd'`).
 */
export function formatDurationPtBr(
  hours: number | null | undefined,
  options?: FormatDurationOptions,
): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—'
  const safeHours = Math.max(0, hours)
  const threshold = options?.dayThresholdHours ?? 48
  const dayUnit = options?.dayUnit ?? 'dias'
  if (safeHours <= threshold) {
    return `${formatDecimalPtBr(safeHours, 1)} h`
  }
  const days = safeHours / 24
  return `${formatDecimalPtBr(days, 1)} ${dayUnit}`
}

/**
 * Formata um intervalo médio em dias para tabela de reincidência (`"0,9 dia"`, `"1 dia"`, `"2,5 dias"`).
 */
export function formatGapDaysPtBr(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) return '—'
  const safe = Math.max(0, roundHalfUp(days, 1))
  const unit = safe > 0 && safe <= 1 ? 'dia' : 'dias'
  return `${formatDecimalPtBr(safe, 1)} ${unit}`
}

/**
 * Formata percentual em pt-BR com vírgula decimal e separador de milhar (`"52,2%"`, `"29,79%"`, `"1.000%"`).
 */
export function formatPercentPtBr(
  percent: number | null | undefined,
  maxDecimals = 1,
): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return '—'
  return `${formatDecimalPtBr(percent, maxDecimals)}%`
}

/**
 * Formata contagens inteiras em pt-BR com separador de milhar (`1248` -> `"1.248"`).
 */
export function formatCountPtBr(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('pt-BR').format(Math.round(value))
}
