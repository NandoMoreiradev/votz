import { ContextNoteKind, ContextNoteRatingValue, ContextNoteStatus } from '@prisma/client'
import {
  CONTEXT_NOTE_KINDS_BY_TARGET,
  CONTEXT_NOTE_SOURCES_MAX,
  CONTEXT_NOTE_TEXT_MAX,
  CONTEXT_NOTE_TEXT_MIN,
  ContextNoteTargetType,
} from '@votz/shared-types'

/**
 * Regras do Contexto da Comunidade (etapa 1, regra simples, sem "ponto de vista").
 * Os números são ponto de partida para calibrar com dado do beta, não verdade
 * (docs/dev/contexto-da-comunidade-analise-2026-11-23.md, seção 6).
 */
export const RULES = {
  /** Avaliações de pessoas diferentes antes de a nota poder aparecer. */
  MIN_RATINGS_TO_SHOW: 7,
  /** Parcela "útil" (ajuda = 1, ajuda um pouco = 0,5, não ajuda = 0) para a nota aparecer. */
  SHOW_SHARE: 0.7,
  /** Nota já exibida só sai do ar se ficar abaixo disto por duas rodadas seguidas (inércia). */
  KEEP_SHARE: 0.6,
  BAD_ROUNDS_TO_HIDE: 2,
  /** Nota que não chegou à régua mesmo com tantas avaliações deixa de esperar e vira "não exibida". */
  GIVE_UP_AT_RATINGS: 15,
  /** Abaixo disto, com avaliações suficientes, a nota já é "não exibida". */
  CLEARLY_BAD_SHARE: 0.4,
  /** Conta com pelo menos tantos dias para avaliar ou escrever. */
  MIN_ACCOUNT_AGE_DAYS: 30,
  /** Avaliações dadas para destravar a escrita de notas. */
  RATINGS_TO_WRITE: 5,
  /** Coincidência mínima com o resultado final para escrever (só vale com avaliações resolvidas suficientes). */
  ALIGNMENT_TO_WRITE: 0.6,
  MIN_RESOLVED_FOR_ALIGNMENT: 5,
  MAX_NOTES_PER_DAY: 5,
  /** Pedidos de contexto por pessoa por dia. */
  MAX_REQUESTS_PER_DAY: 20,
  MAX_SOURCE_LENGTH: 300,
  MAX_RATING_REASONS: 3,
} as const

export const RATING_WEIGHT: Record<ContextNoteRatingValue, number> = {
  [ContextNoteRatingValue.HELPFUL]: 1,
  [ContextNoteRatingValue.SOMEWHAT]: 0.5,
  [ContextNoteRatingValue.NOT_HELPFUL]: 0,
}

export type RatingTally = Record<ContextNoteRatingValue, number>

export function emptyTally(): RatingTally {
  return {
    [ContextNoteRatingValue.HELPFUL]: 0,
    [ContextNoteRatingValue.SOMEWHAT]: 0,
    [ContextNoteRatingValue.NOT_HELPFUL]: 0,
  }
}

export function tallyCount(tally: RatingTally): number {
  return tally.HELPFUL + tally.SOMEWHAT + tally.NOT_HELPFUL
}

/** Parcela "útil" de 0 a 1, ou `null` sem nenhuma avaliação. */
export function helpfulShare(tally: RatingTally): number | null {
  const total = tallyCount(tally)
  if (total === 0) return null
  const score = tally.HELPFUL * RATING_WEIGHT.HELPFUL + tally.SOMEWHAT * RATING_WEIGHT.SOMEWHAT
  return Math.round((score / total) * 10_000) / 10_000
}

export interface NoteEvaluationInput {
  status: ContextNoteStatus
  ratingsCount: number
  share: number | null
  badStreak: number
}

export interface NoteEvaluationResult {
  status: ContextNoteStatus
  badStreak: number
}

/**
 * Decide o estado da nota a cada rodada do job (de hora em hora). Nota removida pela moderação nunca volta aqui.
 * - Espera: precisa de `MIN_RATINGS_TO_SHOW` avaliações. Com 70% de útil, aparece.
 * - Exibida: só sai depois de duas rodadas seguidas abaixo de 60% (a nota não pisca entrando e saindo).
 * - Sem chegar lá com 15 avaliações, ou claramente ruim (abaixo de 40%) com o mínimo de avaliações, vira "não exibida".
 *   "Não exibida" continua aberta a novas avaliações e pode voltar a aparecer.
 */
export function evaluateNote(input: NoteEvaluationInput): NoteEvaluationResult {
  const { status, ratingsCount, share, badStreak } = input
  if (status === ContextNoteStatus.REMOVED) return { status, badStreak: 0 }
  if (share === null || ratingsCount < RULES.MIN_RATINGS_TO_SHOW) {
    // Pouca avaliação: quem já era exibida se mantém (não derruba por amostra pequena).
    return { status, badStreak: status === ContextNoteStatus.SHOWN ? badStreak : 0 }
  }

  if (status === ContextNoteStatus.SHOWN) {
    if (share >= RULES.KEEP_SHARE) return { status, badStreak: 0 }
    const streak = badStreak + 1
    if (streak >= RULES.BAD_ROUNDS_TO_HIDE) return { status: ContextNoteStatus.NOT_SHOWN, badStreak: 0 }
    return { status, badStreak: streak }
  }

  if (share >= RULES.SHOW_SHARE) return { status: ContextNoteStatus.SHOWN, badStreak: 0 }
  if (share < RULES.CLEARLY_BAD_SHARE || ratingsCount >= RULES.GIVE_UP_AT_RATINGS) {
    return { status: ContextNoteStatus.NOT_SHOWN, badStreak: 0 }
  }
  return { status: ContextNoteStatus.NEEDS_RATINGS, badStreak: 0 }
}

/** A avaliação da pessoa coincidiu com o resultado final? Quem disse "ajuda" ou "ajuda um pouco" acertou numa nota exibida. */
export function isAligned(value: ContextNoteRatingValue, finalStatus: ContextNoteStatus): boolean {
  if (finalStatus === ContextNoteStatus.SHOWN) return value !== ContextNoteRatingValue.NOT_HELPFUL
  if (finalStatus === ContextNoteStatus.NOT_SHOWN) return value === ContextNoteRatingValue.NOT_HELPFUL
  return false
}

export interface ContributorProgress {
  ratingsGiven: number
  ratingsResolved: number
  ratingsAligned: number
  writeGrantedAt: Date | null
}

export function canWriteNotes(c: ContributorProgress): boolean {
  if (c.writeGrantedAt) return true
  if (c.ratingsGiven < RULES.RATINGS_TO_WRITE) return false
  if (c.ratingsResolved < RULES.MIN_RESOLVED_FOR_ALIGNMENT) return true
  return c.ratingsAligned / c.ratingsResolved >= RULES.ALIGNMENT_TO_WRITE
}

export function accountOldEnough(createdAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - createdAt.getTime() >= RULES.MIN_ACCOUNT_AGE_DAYS * 86_400_000
}

export function kindAllowedFor(target: ContextNoteTargetType, kind: ContextNoteKind): boolean {
  return (CONTEXT_NOTE_KINDS_BY_TARGET[target] as readonly string[]).includes(kind)
}

const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.test)$/i

/**
 * Link de fonte: só http ou https, sem usuário e senha, com nome de site de verdade (nada de IP, localhost ou rede interna).
 * Não abrimos o link no servidor; isto só evita fonte falsa óbvia e link para a rede interna de quem clica.
 */
export function normalizeSourceUrl(raw: string): string | null {
  const text = raw.trim()
  if (text.length === 0 || text.length > RULES.MAX_SOURCE_LENGTH) return null
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password) return null
  const host = url.hostname.toLowerCase()
  if (!host.includes('.') || PRIVATE_HOST.test(host)) return null
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[')) return null
  url.hash = ''
  return url.toString()
}

export interface NoteDraftCheck {
  ok: boolean
  error?: string
  text?: string
  sources?: string[]
}

/** Confere o texto e as fontes depois da limpeza do texto (DOMPurify é aplicado antes, no serviço). */
export function checkDraft(text: string, sources: string[]): NoteDraftCheck {
  const cleanText = text.replace(/\s+/g, ' ').trim()
  if (cleanText.length < CONTEXT_NOTE_TEXT_MIN) {
    return { ok: false, error: `Escreva pelo menos ${CONTEXT_NOTE_TEXT_MIN} caracteres, explicando o fato.` }
  }
  if (cleanText.length > CONTEXT_NOTE_TEXT_MAX) {
    return { ok: false, error: `A nota pode ter até ${CONTEXT_NOTE_TEXT_MAX} caracteres.` }
  }
  const normalized: string[] = []
  for (const source of sources.slice(0, CONTEXT_NOTE_SOURCES_MAX + 1)) {
    const url = normalizeSourceUrl(source)
    if (!url) return { ok: false, error: `Esta fonte não serve: ${source.slice(0, 80)}. Use um link de site (http ou https).` }
    if (!normalized.includes(url)) normalized.push(url)
  }
  if (normalized.length === 0) return { ok: false, error: 'Cole pelo menos um link de fonte que qualquer pessoa consiga abrir.' }
  if (normalized.length > CONTEXT_NOTE_SOURCES_MAX) {
    return { ok: false, error: `Use no máximo ${CONTEXT_NOTE_SOURCES_MAX} fontes.` }
  }
  return { ok: true, text: cleanText, sources: normalized }
}
