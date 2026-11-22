import {
  AD_DELIVERY,
  AD_FRAUD,
  AD_VIEWABILITY,
  MILLICENTS_PER_CENT,
  adChargeUnit,
  adFloorCents,
  type AdInvalidReason,
  type AgeBand,
} from '@votz/shared-types'

export type Objective = 'AWARENESS' | 'TRAFFIC' | 'CONVERSIONS'

/** Quem está vendo. Só sinais da lista fechada: contexto (cidade e estado da tela) e, com aceite, faixa, gênero e interesses. */
export interface Viewer {
  state: string | null
  city: string | null
  /** Aceitou a personalização e não é menor de idade. Sem isso, faixa, gênero e interesses nem são lidos. */
  personalization: boolean
  interests: readonly string[]
  ageBand: AgeBand | null
  gender: string | null
}

export interface AdSetTargeting {
  states: readonly string[]
  cities: readonly string[]
  interests: readonly string[]
  ageBands: readonly string[]
  genders: readonly string[]
  automaticAudience: boolean
}

export function normalizePlace(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * O conjunto pode mostrar para esta pessoa? Região vale para todos (é contexto). Interesses, faixa e gênero só
 * valem com aceite de personalização; sem aceite o conjunto que os exige simplesmente não aparece. No público
 * automático, só a região conta (a escolha fina fica por conta do Votz, nunca do anunciante).
 */
export function matchesTargeting(targeting: AdSetTargeting, viewer: Viewer): boolean {
  if (targeting.states.length) {
    const wanted = targeting.states.map((state) => state.trim().toUpperCase())
    if (!viewer.state || !wanted.includes(viewer.state.trim().toUpperCase())) return false
  }
  if (targeting.cities.length) {
    const wanted = targeting.cities.map(normalizePlace)
    if (!viewer.city || !wanted.includes(normalizePlace(viewer.city))) return false
  }
  if (targeting.automaticAudience) return true

  const personal = targeting.interests.length > 0 || targeting.ageBands.length > 0 || targeting.genders.length > 0
  if (!personal) return true
  if (!viewer.personalization) return false
  if (targeting.interests.length && !targeting.interests.some((interest) => viewer.interests.includes(interest))) return false
  if (targeting.ageBands.length && (!viewer.ageBand || !targeting.ageBands.includes(viewer.ageBand))) return false
  if (targeting.genders.length && (!viewer.gender || !targeting.genders.includes(viewer.gender))) return false
  return true
}

/** Fração de pessoas que nunca vê anúncio (grupo de controle, decisão 4). Decidido pelo id, sempre o mesmo resultado. */
export function isHoldout(userId: string, share: number): boolean {
  let hash = 2166136261
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296 < share
}

/** Dia no fuso de São Paulo ("AAAA-MM-DD"), que é o dia do orçamento diário e dos relatórios. */
export function saoPauloDay(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  return parts
}

/** Valor do dia como data de calendário (coluna `@db.Date`). */
export function dayAsDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`)
}

// ─── Leilão simples (sem IA) ───────────────────────────────────────────────────────────────────

/** Chance de clique que supomos até a IA medir de verdade (Etapa 4). Só serve para comparar CPM com CPC. */
export const PRIOR_CTR = 0.01

export interface AuctionCandidate {
  adId: string
  objective: Objective
  /** Lance máximo em centavos da unidade cobrada (mil exibições ou clique). Nulo: o Votz usa o preço mínimo. */
  bidCapCents: number | null
}

export interface AuctionResult {
  winner: AuctionCandidate
  /** Preço da unidade cobrada, em centavos: o mínimo que mantém a vitória, nunca abaixo do piso nem acima do lance. */
  priceCents: number
}

/** Quanto vale o lance por mil exibições (eCPM, em centavos). Clique vira exibição com a chance de clique de partida. */
function ecpm(candidate: AuctionCandidate): number {
  const bid = candidate.bidCapCents ?? adFloorCents(candidate.objective)
  return adChargeUnit(candidate.objective) === 'CLICK' ? bid * 1000 * PRIOR_CTR : bid
}

/** Lance abaixo do piso da própria unidade não entra. */
export function meetsFloor(candidate: AuctionCandidate): boolean {
  return candidate.bidCapCents === null || candidate.bidCapCents >= adFloorCents(candidate.objective)
}

/**
 * Segundo preço: o maior eCPM vence e paga o que bastaria para passar o segundo colocado (ou o piso, se estiver
 * sozinho). O empate sai por sorteio, para ninguém ficar sempre na frente. `random` entra para o teste ser exato.
 */
export function runAuction(candidates: AuctionCandidate[], random: () => number = Math.random): AuctionResult | null {
  const entrants = candidates.filter(meetsFloor)
  if (!entrants.length) return null
  const ranked = entrants
    .map((candidate) => ({ candidate, value: ecpm(candidate), tie: random() }))
    .sort((a, b) => b.value - a.value || a.tie - b.tie)
  const winner = ranked[0].candidate
  const floor = adFloorCents(winner.objective)
  const bid = winner.bidCapCents ?? floor
  let toBeat = floor
  if (ranked.length > 1) {
    const second = ranked[1].value
    const inWinnerUnit = adChargeUnit(winner.objective) === 'CLICK' ? second / (1000 * PRIOR_CTR) : second
    toBeat = Math.max(floor, Math.ceil(inWinnerUnit))
  }
  return { winner, priceCents: Math.min(bid, toBeat) }
}

// ─── Validação dos eventos (antifraude da primeira versão) ─────────────────────────────────────

export interface ImpressionFacts {
  servedAt: Date
  viewableAt: Date | null
  clickedAt: Date | null
  hiddenAt: Date | null
}

export interface EventFacts {
  type: 'IMPRESSION' | 'VIEWABLE_IMPRESSION' | 'CLICK' | 'HIDE' | 'HIDE_ADVERTISER' | 'REPORT'
  occurredAt: Date
  visibleMs?: number
}

/**
 * Confere um evento contra a exibição e a hora. Devolve o motivo se for inválido (não é cobrado) ou `null`.
 * `clicksTodayForUserAd`: cliques já cobrados da mesma pessoa no mesmo anúncio hoje.
 */
export function validateEvent(event: EventFacts, impression: ImpressionFacts, now: Date, clicksTodayForUserAd: number): AdInvalidReason | null {
  const ttlMs = AD_DELIVERY.IMPRESSION_EVENT_TTL_HOURS * 3600_000
  if (now.getTime() - impression.servedAt.getTime() > ttlMs) return 'IMPRESSION_EXPIRED'

  // Uma exibição vale uma vez por ação: repetir não cobra de novo (esconder a empresa inteira pode vir depois de esconder o anúncio).
  if (event.type === 'VIEWABLE_IMPRESSION' && impression.viewableAt) return 'DUPLICATE_ACTION'
  if (event.type === 'CLICK' && impression.clickedAt) return 'DUPLICATE_ACTION'
  if (event.type === 'HIDE' && impression.hiddenAt) return 'DUPLICATE_ACTION'

  const skew = AD_FRAUD.MAX_CLOCK_SKEW_MS
  const at = event.occurredAt.getTime()
  if (at > now.getTime() + skew || at < impression.servedAt.getTime() - skew) return 'CLOCK_SKEW'

  if (event.type === 'VIEWABLE_IMPRESSION') {
    if ((event.visibleMs ?? 0) < AD_VIEWABILITY.MIN_VISIBLE_MS) return 'NOT_VIEWABLE'
    // Ninguém fica visível por mais tempo do que passou desde a entrega (com folga para o relógio).
    if ((event.visibleMs ?? 0) > now.getTime() - impression.servedAt.getTime() + skew) return 'CLOCK_SKEW'
  }
  if (event.type === 'CLICK') {
    if (now.getTime() - impression.servedAt.getTime() < AD_FRAUD.MIN_CLICK_DELAY_MS) return 'CLICK_TOO_FAST'
    if (clicksTodayForUserAd >= AD_FRAUD.MAX_BILLED_CLICKS_PER_USER_AD_DAY) return 'TOO_MANY_CLICKS'
  }
  return null
}

/** Sobra, em millicents, que não completa um centavo, e os centavos inteiros prontos para o livro-caixa. */
export function splitSpend(pendingMillicents: number): { cents: number; remainderMillicents: number } {
  const cents = Math.floor(pendingMillicents / MILLICENTS_PER_CENT)
  return { cents, remainderMillicents: pendingMillicents - cents * MILLICENTS_PER_CENT }
}
