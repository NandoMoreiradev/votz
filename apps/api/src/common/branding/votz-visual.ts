/**
 * Official Votz brand palette (from CLAUDE.md) and pt-BR visual formatters
 * shared between ShareCardRendererService (PNG) and ReportRendererService (PDF).
 */
export const VOTZ_BRAND_COLORS = {
  primary: '#1A1A2E', // Azul noite — seriedade, Estado
  action: '#E63946', // Vermelho — urgência, força cidadã
  positive: '#2DC653', // Verde — resolvido, progresso
  neutral: '#F4F4F4', // Off-white — fundo, leitura
  text: '#0D0D0D', // Quase preto — legibilidade máxima
  white: '#FFFFFF',
  surfaceSubtle: '#ECECEF',
  border: '#D6D6DF',
  muted: '#4A4A58',
  mutedLight: '#6B6B78',
} as const

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

/**
 * Formats an ISO date (`YYYY-MM-DD`) or ISO timestamp into `dd/mm/aaaa`.
 */
export function formatDateBr(value: string | null | undefined): string {
  if (!value) return '—'
  const trimmed = value.trim()
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
 * Formats an ISO timestamp into `dd/mm/aaaa HH:mm` (America/Sao_Paulo).
 */
export function formatDateTimeBr(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value.trim())
  if (Number.isNaN(parsed.getTime())) {
    return formatDateBr(value)
  }
  return SAO_PAULO_DATETIME_FMT.format(parsed).replace(',', '')
}

/**
 * Formats durations in pt-BR: up to 48h in hours (`"18,5 h"` / `"14 h"`),
 * and above 48h in days (`"5,9 dias"` / `"4 dias"`).
 */
export function formatDurationPtBr(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—'
  const safeHours = Math.max(0, hours)
  if (safeHours <= 48) {
    const rounded = Math.round(safeHours * 10) / 10
    const formatted = Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(1).replace('.', ',')
    return `${formatted} h`
  }
  const days = Math.round((safeHours / 24) * 10) / 10
  const formattedDays = Number.isInteger(days) ? String(days) : days.toFixed(1).replace('.', ',')
  return `${formattedDays} dias`
}

/**
 * Formats a percentage in pt-BR with comma decimal (`"52,2%"`, `"80%"`).
 */
export function formatPercentPtBr(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return '—'
  const rounded = Math.round(percent * 10) / 10
  const formatted = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace('.', ',')
  return `${formatted}%`
}

/**
 * Formats integer counts with pt-BR thousand separators (`12345` -> `"12.345"`).
 */
export function formatCountPtBr(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return new Intl.NumberFormat('pt-BR').format(Math.round(value))
}

/**
 * Collapses whitespace and truncates cleanly with `...` ellipsis when exceeded.
 */
export function truncateWithEllipsis(text: string, maxLength: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= maxLength) return collapsed
  if (maxLength <= 3) return collapsed.slice(0, maxLength)
  const prefix = collapsed.slice(0, maxLength - 3).replace(/[\s.,;:]+$/, '')
  return `${prefix}...`
}
