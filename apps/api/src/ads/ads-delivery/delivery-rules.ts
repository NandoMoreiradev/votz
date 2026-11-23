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

// ─── Chance de clique medida ───────────────────────────────────────────────────────────────────

/** Chance de clique de partida (1%): vale até haver exibições medidas. Só serve para comparar CPM com CPC. */
export const PRIOR_CTR = 0.01

/**
 * Medição de clique (Etapa 3). A chance de clique de cada anúncio é a média de uma Beta: parte da chance de partida
 * (`PRIOR_STRENGTH` exibições "imaginárias") e vai sendo trocada pelo que o anúncio fez nos últimos dias. Anúncio com
 * poucas exibições vistas é sorteado dessa Beta (amostragem de Thompson), para o Votz aprender com ele sem ficar
 * escondido; com muitas, vale a média, sem sorte.
 */
export const CTR_MODEL = {
  /** Quantas exibições vistas "imaginárias" a chance de partida vale. */
  PRIOR_STRENGTH: 200,
  /** Abaixo disso o anúncio ainda explora (é sorteado); a partir daí vale a média. */
  EXPLORE_BELOW_VIEWABLE: 500,
  /** Janela dos dados, em dias. */
  WINDOW_DAYS: 14,
  /** Plataforma com menos exibições vistas que isto: a chance de partida é a fixa, não a medida. */
  MIN_PLATFORM_VIEWABLE: 2000,
} as const

export interface ClickRate {
  /** Média da Beta: o que o preço e o relatório usam. */
  mean: number
  alpha: number
  beta: number
}

export function clickRatePosterior(clicks: number, viewable: number, prior: number = PRIOR_CTR, strength: number = CTR_MODEL.PRIOR_STRENGTH): ClickRate {
  const safeViewable = Math.max(viewable, 0)
  // Clique sem exibição vista (sinal ruim) não conta mais que a exibição.
  const safeClicks = Math.min(Math.max(clicks, 0), safeViewable)
  const alpha = prior * strength + safeClicks
  const beta = (1 - prior) * strength + (safeViewable - safeClicks)
  return { mean: alpha / (alpha + beta), alpha, beta }
}

function gaussian(random: () => number): number {
  // Box-Muller; 1 - random() evita log(0).
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())
}

/** Sorteio de uma Gama(forma, 1) (Marsaglia e Tsang); forma menor que 1 usa o truque do expoente. */
export function sampleGamma(shape: number, random: () => number = Math.random): number {
  if (shape < 1) return sampleGamma(shape + 1, random) * Math.pow(1 - random(), 1 / shape)
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    const x = gaussian(random)
    const v = Math.pow(1 + c * x, 3)
    if (v <= 0) continue
    const u = 1 - random()
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v
  }
}

export function sampleBeta(alpha: number, beta: number, random: () => number = Math.random): number {
  const x = sampleGamma(alpha, random)
  const y = sampleGamma(beta, random)
  return x / (x + y)
}

/** A chance de clique que entra no leilão: sorteada para anúncio novo, a média para o resto. */
export function auctionClickRate(rate: ClickRate, viewable: number, random: () => number = Math.random): number {
  return viewable < CTR_MODEL.EXPLORE_BELOW_VIEWABLE ? sampleBeta(rate.alpha, rate.beta, random) : rate.mean
}

// ─── Exploração com teto e piso ────────────────────────────────────────────────────────────────

/**
 * Anúncio com pouca história (menos de `CTR_MODEL.EXPLORE_BELOW_VIEWABLE` exibições vistas) disputa em separado dos
 * experientes, para o Votz aprender com ele sem que ele tome o feed nem fique escondido. Só vale quando os dois grupos
 * existem na disputa: se só há anúncios novos (começo do beta), eles recebem tudo.
 *
 * - **Alvo:** cada entrega disputada sorteia, com esta chance, uma disputa só entre os novos.
 * - **Teto e piso:** pelos contadores da hora (Redis), se a parte dos novos já passou do teto, não explora; se está abaixo
 *   do piso (com amostra mínima), explora na hora. Sem contadores (Redis fora), vale só o sorteio do alvo.
 */
export const EXPLORATION = {
  TARGET_SHARE: 0.075,
  MAX_SHARE: 0.1,
  MIN_SHARE: 0.05,
  /** Menos entregas disputadas que isto na hora: ainda não dá para julgar a parte (vale o alvo). */
  MIN_SAMPLE: 40,
} as const

/**
 * `targetShare`: o alvo do braço do experimento (padrão: `EXPLORATION.TARGET_SHARE`). O teto e o piso por hora valem para
 * todos os braços: um experimento muda o alvo, nunca solta o teto.
 */
export function explorationChance(counters: { total: number; explored: number } | null, targetShare: number = EXPLORATION.TARGET_SHARE): number {
  if (!counters || counters.total < EXPLORATION.MIN_SAMPLE) return targetShare
  const share = counters.explored / counters.total
  if (share >= EXPLORATION.MAX_SHARE) return 0
  if (share < EXPLORATION.MIN_SHARE) return 1
  return targetShare
}

/**
 * Quem entra no leilão desta entrega. `contested`: há anúncio novo e experiente na disputa (só aí o teto e o piso
 * valem e as entregas entram nos contadores).
 */
export function pickAuctionPool<T extends { isNew: boolean }>(
  candidates: readonly T[],
  exploreChance: number,
  random: () => number = Math.random,
): { pool: T[]; contested: boolean } {
  const fresh = candidates.filter((candidate) => candidate.isNew)
  const proven = candidates.filter((candidate) => !candidate.isNew)
  if (!fresh.length || !proven.length) return { pool: [...candidates], contested: false }
  return { pool: random() < exploreChance ? fresh : proven, contested: true }
}

// ─── Qualidade: o que as pessoas rejeitam ──────────────────────────────────────────────────────

/**
 * Penalidade por rejeição prevista (plano 6.5). Anúncio que muita gente esconde ou denuncia perde valor no leilão, para o
 * feed não ficar cheio do que incomoda. A rejeição é "esconder" mais denúncia (que pesa `REPORT_WEIGHT` vezes: quem
 * denuncia diz que o anúncio é enganoso ou abusivo, não só chato), sobre as exibições entregues, suavizada como a chance
 * de clique; só pesa o que passa da taxa normal (`BASELINE`).
 *
 * **Qualidade do anunciante:** o ponto de partida da taxa de um anúncio é a taxa da própria empresa em todos os anúncios
 * dela (`advertiserRejectionRate`), não a taxa normal. Anúncio novo de quem costuma incomodar já começa com a
 * penalidade; anúncio novo de quem nunca incomodou começa limpo. Sem dados suficientes da empresa, vale a taxa normal.
 */
export const QUALITY = {
  /** Taxa de esconder que consideramos normal. */
  BASELINE: 0.02,
  /** Exibições "imaginárias" na taxa de partida. */
  PRIOR_STRENGTH: 200,
  /** Cada ponto de esconder acima da taxa normal tira este tanto do valor. */
  WEIGHT: 5,
  /** Nunca tira mais que isto: o anunciante ainda pode vencer pagando mais. */
  MAX_PENALTY: 0.5,
  /** Uma denúncia vale tantos "esconder". */
  REPORT_WEIGHT: 5,
  /** A taxa da empresa só vale a partir de tantas exibições (antes disso, é a taxa normal). */
  ADVERTISER_MIN_IMPRESSIONS: 2000,
  /** Quanto a taxa normal pesa na taxa da empresa (exibições "imaginárias"). */
  ADVERTISER_PRIOR_STRENGTH: 1000,
  /** A taxa da empresa nunca passa disto, para um mau período não condenar a empresa para sempre. */
  ADVERTISER_MAX_RATE: 0.2,
} as const

/** Rejeições de um conjunto de exibições: "esconder" mais denúncia (que pesa mais), nunca mais que as exibições. */
function rejections(hides: number, reports: number, impressions: number, reportWeight: number = QUALITY.REPORT_WEIGHT): number {
  return Math.min(Math.max(hides || 0, 0) + reportWeight * Math.max(reports || 0, 0), impressions)
}

/**
 * Taxa de rejeição da empresa (todos os anúncios dela), suavizada. Com poucas exibições devolve a taxa normal.
 * É o ponto de partida da taxa de cada anúncio novo dela.
 */
export function advertiserRejectionRate(
  stats: { impressions: number; hides: number; reports: number } | undefined | null,
  reportWeight: number = QUALITY.REPORT_WEIGHT,
): number {
  const impressions = Math.max(stats?.impressions || 0, 0)
  if (!stats || impressions < QUALITY.ADVERTISER_MIN_IMPRESSIONS) return QUALITY.BASELINE
  const rate = (QUALITY.BASELINE * QUALITY.ADVERTISER_PRIOR_STRENGTH + rejections(stats.hides, stats.reports, impressions, reportWeight)) / (QUALITY.ADVERTISER_PRIOR_STRENGTH + impressions)
  return Math.min(Math.max(rate, 0), QUALITY.ADVERTISER_MAX_RATE)
}

/**
 * Multiplicador do valor no leilão, de 1 (sem problema) até `1 - MAX_PENALTY`. `reports`: denúncias do anúncio.
 * `priorRate`: de onde a taxa parte (a da empresa, ou a normal). `reportWeight`, `weight` e `maxPenalty`: os valores do braço
 * de um experimento (padrão: os de `QUALITY`).
 */
export function qualityFactor(
  hides: number,
  impressions: number,
  extra: { reports?: number; priorRate?: number; reportWeight?: number; weight?: number; maxPenalty?: number } = {},
): number {
  const safeImpressions = Math.max(impressions || 0, 0)
  const prior = Math.min(Math.max(extra.priorRate ?? QUALITY.BASELINE, 0), QUALITY.ADVERTISER_MAX_RATE)
  const rate = (prior * QUALITY.PRIOR_STRENGTH + rejections(hides, extra.reports ?? 0, safeImpressions, extra.reportWeight)) / (QUALITY.PRIOR_STRENGTH + safeImpressions)
  const penalty = Math.min(extra.maxPenalty ?? QUALITY.MAX_PENALTY, (extra.weight ?? QUALITY.WEIGHT) * Math.max(0, rate - QUALITY.BASELINE))
  return 1 - penalty
}

// ─── Ritmo do orçamento (pacing) ───────────────────────────────────────────────────────────────

export const PACING = {
  /** O conjunto pode estar este tanto do orçamento à frente do relógio sem ser freado. */
  SLACK: 0.1,
  /** A partir da folga, a chance de entrar no leilão cai até zero neste tanto de adiantamento. */
  BAND: 0.15,
} as const

/** Hora cheia (0 a 23) no relógio de São Paulo: a janela dos contadores de exploração. */
export function saoPauloHour(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  return Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
}

/** Quanto do dia já passou (0 a 1), no relógio de São Paulo. */
export function dayElapsedFraction(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  return (hour * 60 + minute) / 1440
}

/**
 * Chance de o conjunto entrar no leilão agora. Gastando no ritmo (ou atrás), é 1. Se já gastou bem mais do que o
 * relógio permite, cai até 0, para o orçamento render o dia todo em vez de acabar de manhã.
 */
export function pacingChance(input: { spentMillicents: number; dailyBudgetMillicents: number; elapsedFraction: number }): number {
  if (input.dailyBudgetMillicents <= 0) return 0
  const spent = input.spentMillicents / input.dailyBudgetMillicents
  const allowed = Math.min(1, input.elapsedFraction + PACING.SLACK)
  if (spent <= allowed) return 1
  return Math.max(0, 1 - (spent - allowed) / PACING.BAND)
}

// ─── Leilão ────────────────────────────────────────────────────────────────────────────────────

export interface AuctionCandidate {
  adId: string
  objective: Objective
  /** Lance máximo em centavos da unidade cobrada (mil exibições ou clique). Nulo: o Votz usa o preço mínimo. */
  bidCapCents: number | null
  /** Chance de clique que vale neste leilão (média ou sorteio). Sem ela, vale a de partida. */
  clickRate?: number
  /** Multiplicador de qualidade (1 = sem penalidade). Veja `qualityFactor`. */
  quality?: number
}

export interface AuctionResult {
  winner: AuctionCandidate
  /** Preço da unidade cobrada, em centavos: o mínimo que mantém a vitória, nunca abaixo do piso nem acima do lance. */
  priceCents: number
}

const rateOf = (candidate: AuctionCandidate) => Math.max(candidate.clickRate ?? PRIOR_CTR, 1e-6)
const qualityOf = (candidate: AuctionCandidate) => Math.min(Math.max(candidate.quality ?? 1, 0.01), 1)

/** Quanto vale o lance por mil exibições (eCPM, em centavos). Clique vira exibição com a chance de clique do anúncio. */
function ecpm(candidate: AuctionCandidate): number {
  const bid = candidate.bidCapCents ?? adFloorCents(candidate.objective)
  const value = adChargeUnit(candidate.objective) === 'CLICK' ? bid * 1000 * rateOf(candidate) : bid
  return value * qualityOf(candidate)
}

/**
 * Valor por mil exibições (em centavos) do preço fixado numa entrega: o preço de mil exibições já é isso; o de clique
 * vira mil exibições com a chance de clique. É a medida que permite comparar dois caminhos (modo sombra).
 */
export function ecpmOfPrice(objective: Objective, priceCents: number, clickRate: number): number {
  return adChargeUnit(objective) === 'CLICK' ? priceCents * 1000 * Math.max(clickRate, 0) : priceCents
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
    const perUnit = adChargeUnit(winner.objective) === 'CLICK' ? 1000 * rateOf(winner) : 1
    const inWinnerUnit = second / (perUnit * qualityOf(winner))
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
