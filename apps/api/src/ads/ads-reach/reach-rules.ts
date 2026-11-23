import type { Prisma } from '@prisma/client'
import { AD_DELIVERY_LIMITS, adAudienceIsPersonal, type AdReachEstimateInput, type AgeBand } from '@votz/shared-types'
import { normalizePlace } from '../ads-delivery/delivery-rules'

/** Idade mínima e máxima (anos completos) de cada faixa. */
const BAND_AGES: Record<AgeBand, [number, number]> = {
  '18-24': [18, 24],
  '25-34': [25, 34],
  '35-44': [35, 44],
  '45-54': [45, 54],
  '55-64': [55, 64],
  '65+': [65, 150],
}

/** A data que dá exatamente `years` anos completos hoje (nascer neste dia ou antes = ter pelo menos essa idade). */
function yearsAgo(years: number, today: Date): Date {
  return new Date(Date.UTC(today.getUTCFullYear() - years, today.getUTCMonth(), today.getUTCDate()))
}

/** Intervalo de datas de nascimento de quem está na faixa hoje: `gt` (exclusivo) e `lte` (inclusivo). */
export function ageBandBirthRange(band: AgeBand, today = new Date()): { gt: Date; lte: Date } {
  const [min, max] = BAND_AGES[band]
  return { gt: yearsAgo(max + 1, today), lte: yearsAgo(min, today) }
}

/**
 * Quem pode ver anúncio para este público, como filtro de `users`. Só usa colunas liberadas para anúncios (estado,
 * cidade, nascimento, gênero) e a preferência de anúncios. As mesmas regras da entrega: interesses, idade e gênero só
 * valem para quem ligou a personalização, e menor de idade nunca entra.
 *
 * A cidade não entra aqui (acento e maiúscula se resolvem em `matchCities`).
 */
export function buildAudienceWhere(input: AdReachEstimateInput, today = new Date()): Prisma.UserWhereInput & { AND: Prisma.UserWhereInput[] } {
  const and: Prisma.UserWhereInput[] = [
    // Menor de 18 nunca é perfilado nem entra em público personalizado (sem data de nascimento passa: o cadastro exige 18 anos).
    { OR: [{ birthDate: null }, { birthDate: { lte: yearsAgo(18, today) } }] },
  ]
  if (adAudienceIsPersonal(input)) {
    and.push({ adPreference: { is: { personalizationConsent: true, ...(input.interests.length ? { interests: { hasSome: input.interests } } : {}) } } })
    if (input.ageBands.length) and.push({ OR: input.ageBands.map((band) => ({ birthDate: ageBandBirthRange(band, today) })) })
    if (input.genders.length) and.push({ gender: { in: input.genders } })
  }
  return {
    banned: false,
    type: 'CITIZEN',
    ...(input.states.length ? { state: { in: input.states.map((state) => state.trim().toUpperCase()) } } : {}),
    AND: and,
  }
}

/** Soma só as cidades pedidas, comparando sem acento e sem maiúscula (como a entrega). */
export function matchCities(rows: { city: string | null; count: number }[], wanted: readonly string[]): number {
  const names = new Set(wanted.map(normalizePlace))
  return rows.reduce((total, row) => (row.city && names.has(normalizePlace(row.city)) ? total + row.count : total), 0)
}

/** Tira o grupo de controle (as pessoas que nunca veem anúncio) do total. */
export function withoutHoldout(total: number): number {
  return Math.floor(total * (1 - AD_DELIVERY_LIMITS.HOLDOUT_SHARE))
}
