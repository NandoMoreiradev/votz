import {
  ANALYTICS_TIMEZONE,
  MAX_ANALYTICS_RANGE_MONTHS,
  PRESSURE_BUCKET_BOUNDS,
  RESPONSE_TIME_BUCKET_BOUNDS_HOURS,
} from '@votz/shared-types'

export const ANALYTICS_QUEUE = 'analytics'
export const ANALYTICS_CACHE_TTL_SECONDS = 900 // 15 minutos
export const ANALYTICS_CACHE_EPOCH_KEY = 'analytics:v1:epoch'

/**
 * Converte um Date para YYYY-MM-DD no fuso America/Sao_Paulo.
 */
export function toSaoPauloDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ANALYTICS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  const d = parts.find((p) => p.type === 'day')?.value ?? '01'
  return `${y}-${m}-${d}`
}

export function addDaysDateString(dayStr: string, deltaDays: number): string {
  const [y, m, d] = dayStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays))
  return dt.toISOString().slice(0, 10)
}

export function diffDaysBetweenStrings(fromStr: string, toStr: string): number {
  const fromMs = Date.parse(`${fromStr}T00:00:00Z`)
  const toMs = Date.parse(`${toStr}T00:00:00Z`)
  return Math.round((toMs - fromMs) / 86_400_000)
}

export function resolveMaxRangeDays(): number {
  return MAX_ANALYTICS_RANGE_MONTHS * 31
}

export function bucketIndex(value: number, upperBounds: readonly number[]): number {
  for (let i = 0; i < upperBounds.length; i++) {
    if (value <= upperBounds[i]) return i
  }
  return upperBounds.length
}

export function emptyTimeBuckets(): number[] {
  return new Array(RESPONSE_TIME_BUCKET_BOUNDS_HOURS.length + 1).fill(0)
}

export function emptyPressureBuckets(): number[] {
  return new Array(PRESSURE_BUCKET_BOUNDS.length + 1).fill(0)
}

export function sumBucketArrays(target: number[], source: readonly number[]): number[] {
  for (let i = 0; i < target.length; i++) {
    target[i] += source[i] ?? 0
  }
  return target
}

export interface RatioValue {
  value: number | null
  numerator: number
  denominator: number
}

export function buildRatio(numerator: number, denominator: number, scale = 1): RatioValue {
  if (denominator <= 0) {
    return { value: null, numerator, denominator }
  }
  return {
    value: Number(((numerator / denominator) * scale).toFixed(2)),
    numerator,
    denominator,
  }
}

export function computeTrendComparison(current: number, previous: number) {
  const deltaPercent =
    previous > 0 ? Number((((current - previous) / previous) * 100).toFixed(2)) : null
  return {
    current,
    previous,
    deltaPercent,
    smallBaseWarning: current < 10 || previous < 10,
  }
}
