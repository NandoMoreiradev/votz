import { Category, Prisma, PressRadarKind, ReportStatus } from '@prisma/client'
import { normalizeLocationKey, type PressPlan, type PressRadarFrequency, PRESS_PLAN_LIMITS } from '@votz/shared-types'

/** Regras puras do radar de imprensa (sem banco), para testar sozinhas. */

export interface RadarFilters {
  states: string[]
  cities: string[]
  categories: string[]
}

export interface RadarRuleLike extends RadarFilters {
  kind: PressRadarKind | string
  minPressure: number | null
  stalledDays: number | null
  frequency: PressRadarFrequency | string
  lastDigestAt: Date | null
}

export const DIGEST_MIN_INTERVAL_MS = 20 * 3_600_000

export function placeMatches(rule: Pick<RadarFilters, 'states' | 'cities'>, place: { state: string | null; city: string | null }): boolean {
  if (rule.states.length > 0) {
    const state = (place.state ?? '').toUpperCase()
    if (!rule.states.map((s) => s.toUpperCase()).includes(state)) return false
  }
  if (rule.cities.length > 0) {
    const city = normalizeLocationKey(place.city)
    if (!rule.cities.some((c) => normalizeLocationKey(c) === city)) return false
  }
  return true
}

export function surtoMatchesRule(
  rule: RadarFilters,
  surto: { state: string | null; city: string | null; category: string },
): boolean {
  if (rule.categories.length > 0 && !rule.categories.includes(surto.category)) return false
  return placeMatches(rule, surto)
}

/** Filtro de relatos do radar. Só relatos públicos (não anônimos) e ainda em aberto. */
export function reportWhereForRule(rule: RadarRuleLike, now: Date): Prisma.ReportWhereInput {
  const and: Prisma.ReportWhereInput[] = [
    { anonymous: false },
    { status: { notIn: [ReportStatus.ARCHIVED, ReportStatus.RESOLVED] } },
  ]
  if (rule.states.length > 0) and.push({ state: { in: rule.states.map((s) => s.toUpperCase()) } })
  if (rule.cities.length > 0) {
    // Sem acento e sem maiúscula (cityKey); o nome escrito serve de reserva para relatos antigos sem cityKey.
    and.push({
      OR: [
        { cityKey: { in: rule.cities.map((c) => normalizeLocationKey(c)) } },
        ...rule.cities.map((c) => ({ city: { equals: c, mode: 'insensitive' as const } })),
      ],
    })
  }
  if (rule.categories.length > 0) and.push({ category: { in: rule.categories as Category[] } })
  if (rule.kind === 'PRESSURE') {
    and.push({ pressureScore: { gte: rule.minPressure ?? 0 } })
  } else if (rule.kind === 'UNANSWERED') {
    and.push({ firstResponseAt: null })
    and.push({ createdAt: { lte: new Date(now.getTime() - (rule.stalledDays ?? 1) * 86_400_000) } })
    if (rule.minPressure) and.push({ pressureScore: { gte: rule.minPressure } })
  }
  return { AND: and }
}

export const reportDedupKey = (reportId: string) => `report:${reportId}`

/** Um aviso por surto e por dia: o surto que some e volta no mesmo dia não repete. */
export const surtoDedupKey = (surtoId: string, now: Date) => `surto:${surtoId}:${now.toISOString().slice(0, 10)}`

/** Depois de uma queda de plano, o aviso na hora vira resumo diário. */
export function effectiveFrequency(frequency: PressRadarFrequency | string, plan: PressPlan): PressRadarFrequency {
  const allowed = PRESS_PLAN_LIMITS[plan].radarFrequencies
  return (allowed as readonly string[]).includes(frequency) ? (frequency as PressRadarFrequency) : 'DAILY'
}

/** O resumo diário só sai se passaram ~20 h do último; o aviso na hora sai sempre que houver novidade. */
export function isDigestDue(frequency: PressRadarFrequency, lastDigestAt: Date | null, now: Date): boolean {
  if (frequency === 'IMMEDIATE') return true
  return !lastDigestAt || now.getTime() - lastDigestAt.getTime() >= DIGEST_MIN_INTERVAL_MS
}
