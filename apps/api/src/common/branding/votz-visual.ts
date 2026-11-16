/**
 * Official Votz brand palette (from CLAUDE.md) and visual helpers
 * shared between ShareCardRendererService (PNG) and ReportRendererService (PDF).
 * Formatadores pt-BR centralizados em `@votz/shared-types`.
 */
export {
  formatCountPtBr,
  formatDateBr,
  formatDateTimeBr,
  formatDecimalPtBr,
  formatDurationPtBr,
  formatGapDaysPtBr,
  formatMonthOrDateBr,
  formatPercentPtBr,
  formatShortDateBr,
} from '@votz/shared-types'

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
