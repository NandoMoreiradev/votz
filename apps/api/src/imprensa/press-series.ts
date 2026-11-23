/**
 * Série histórica para a imprensa: quantos relatos entraram em cada semana ou mês e, desses, quantos já tiveram
 * resposta e quantos foram resolvidos. É por "turma de entrada": cada relato conta no período em que foi criado,
 * e a resposta e a resolução contam mesmo que tenham vindo depois.
 */
export type SeriesGranularity = 'week' | 'month'

export interface SeriesInput {
  createdAt: Date
  status: string
  pressureScore: number
  firstResponseAt: Date | null
}

export interface SeriesRow {
  period: string
  reports: number
  answered: number
  resolved: number
  avgPressure: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Início do período em UTC: segunda-feira (semana, `AAAA-MM-DD`) ou primeiro dia do mês (`AAAA-MM`). */
export function periodKey(date: Date, granularity: SeriesGranularity): string {
  if (granularity === 'month') return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`
  const sinceMonday = (date.getUTCDay() + 6) % 7
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - sinceMonday))
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`
}

/** Todos os períodos de `from` a `to`, em ordem, inclusive os sem nenhum relato. */
export function periodsBetween(from: Date, to: Date, granularity: SeriesGranularity): string[] {
  const keys: string[] = []
  let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const last = periodKey(to, granularity)
  for (let guard = 0; guard < 1000; guard++) {
    const key = periodKey(cursor, granularity)
    if (keys[keys.length - 1] !== key) keys.push(key)
    if (key >= last) break
    cursor =
      granularity === 'week'
        ? new Date(cursor.getTime() + 86_400_000)
        : new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  }
  return keys
}

export function buildSeries(rows: SeriesInput[], granularity: SeriesGranularity, from: Date, to: Date): SeriesRow[] {
  const acc = new Map<string, { reports: number; answered: number; resolved: number; pressure: number }>()
  for (const key of periodsBetween(from, to, granularity)) {
    acc.set(key, { reports: 0, answered: 0, resolved: 0, pressure: 0 })
  }
  for (const row of rows) {
    const bucket = acc.get(periodKey(row.createdAt, granularity))
    if (!bucket) continue
    bucket.reports += 1
    if (row.firstResponseAt) bucket.answered += 1
    if (row.status === 'RESOLVED') bucket.resolved += 1
    bucket.pressure += row.pressureScore
  }
  return [...acc.entries()].map(([period, b]) => ({
    period,
    reports: b.reports,
    answered: b.answered,
    resolved: b.resolved,
    avgPressure: b.reports > 0 ? Math.round((b.pressure / b.reports) * 100) / 100 : 0,
  }))
}
