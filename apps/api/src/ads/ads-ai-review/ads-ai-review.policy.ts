import {
  AD_INTEREST_IDS,
  AD_PROHIBITED_CATEGORIES,
  AD_RESTRICTED_CATEGORIES,
  type AdProhibitedCategoryId,
  type AdRestrictedCategoryId,
} from '@votz/shared-types'

/** O que a IA devolve sobre um anúncio, já validado contra as listas fechadas. */
export interface AiAnalysisResult {
  category: string | null
  restricted: AdRestrictedCategoryId | null
  violations: { id: AdProhibitedCategoryId; confidence: number }[]
  sensitive: boolean
  confidence: number
  explanation: string
  /** O que a IA viu na foto ou nos quadros do vídeo (nulo se o anúncio não tem mídia ou a IA não descreveu). */
  mediaSummary: string | null
  /** Texto escrito dentro da mídia. */
  mediaText: string | null
}

/** Só com confiança igual ou acima disso a IA pode aprovar sozinha. */
export const AI_AUTO_APPROVE_MIN_CONFIDENCE = 0.9
/** Qualquer suspeita de violação com confiança acima disso já manda para a pessoa. */
export const AI_VIOLATION_FLOOR = 0.2
export const AI_EXPLANATION_MAX = 400
export const AI_MEDIA_SUMMARY_MAX = 400
export const AI_MEDIA_TEXT_MAX = 500

const PROHIBITED_IDS = new Set<string>(AD_PROHIBITED_CATEGORIES.map((c) => c.id))
const RESTRICTED_IDS = new Set<string>(AD_RESTRICTED_CATEGORIES.map((c) => c.id))
const INTEREST_IDS = new Set<string>(AD_INTEREST_IDS)

const clamp01 = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)

/**
 * Valida a resposta crua do modelo. Resposta fora do formato vira `null` (o anúncio segue para a fila humana).
 * Ids fora das listas fechadas são descartados: o modelo não inventa categoria.
 */
export function sanitizeAnalysis(raw: unknown): AiAnalysisResult | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  if (typeof data.confidence !== 'number' || typeof data.sensitive !== 'boolean' || typeof data.explanation !== 'string') return null

  const violations = (Array.isArray(data.violations) ? data.violations : [])
    .map((v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {}))
    .filter((v): v is { id: AdProhibitedCategoryId; confidence: number } => typeof v.id === 'string' && PROHIBITED_IDS.has(v.id))
    .map((v) => ({ id: v.id, confidence: clamp01(v.confidence) }))

  const restricted = typeof data.restricted === 'string' && RESTRICTED_IDS.has(data.restricted) ? (data.restricted as AdRestrictedCategoryId) : null
  const category = typeof data.category === 'string' && INTEREST_IDS.has(data.category) ? data.category : null
  const explanation = data.explanation.replace(/\s+/g, ' ').trim().slice(0, AI_EXPLANATION_MAX)
  if (!explanation) return null

  const mediaSummary = cleanText(data.mediaSummary, AI_MEDIA_SUMMARY_MAX)
  const mediaText = cleanText(data.mediaText, AI_MEDIA_TEXT_MAX)

  return { category, restricted, violations, sensitive: data.sensitive, confidence: clamp01(data.confidence), explanation, mediaSummary, mediaText }
}

/** Texto curto do modelo: sem quebras de linha, limitado, e vazio vira nulo. */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim().slice(0, max)
  return text || null
}

// Tira os acentos: o intervalo entre colchetes são as marcas combinantes U+0300 a U+036F.
const strip = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Trava independente do modelo: palavras que, sozinhas, já tiram o anúncio da aprovação automática. Não decide nada
 * contra o anunciante (a pessoa da moderação é quem recusa); só impede que um texto esperto convença a IA a aprovar.
 */
const OBVIOUS_TERMS: { id: AdProhibitedCategoryId; pattern: RegExp }[] = [
  { id: 'gambling', pattern: /\b(cassino|apostas?|bet|bets|tigrinho|jogo do bicho|roleta|bingo)\b/ },
  { id: 'weapons', pattern: /\b(armas? de fogo|municao|pistola|revolver|espingarda|explosivos?)\b/ },
  { id: 'tobacco', pattern: /\b(cigarros?|vapes?|narguile|tabaco|charuto)\b/ },
  { id: 'adult', pattern: /\b(porn\w*|sexo|erotic\w*|acompanhantes?|nudes?)\b/ },
  { id: 'predatory-credit', pattern: /\b(dinheiro facil|emprestimo sem consulta|nome sujo aprovado|ganhe dinheiro rapido)\b/ },
  { id: 'health-claims', pattern: /\b(cura definitiva|cura milagrosa|milagr\w+|emagreca \d+ ?kg|resultado garantido|cura garantida|cura (o |a |de )?cancer)\b/ },
  { id: 'political', pattern: /\b(candidat[oa]s?|elei[cç]\w+|eleicao|eleicoes|partido|vote em|voto)\b/ },
  { id: 'government', pattern: /\b(governo (federal|estadual|municipal)|prefeitura|secretaria (de|do|da)|gov\.br)\b/ },
]

/** Categorias proibidas que o texto entrega à primeira vista (confiança 1: é achado exato, não estimativa). */
export function obviousViolations(texts: string[]): { id: AdProhibitedCategoryId; confidence: number }[] {
  const haystack = strip(texts.join(' \n '))
  return OBVIOUS_TERMS.filter(({ pattern }) => pattern.test(haystack)).map(({ id }) => ({ id, confidence: 1 }))
}

/** Junta os achados da IA e da trava por palavras (fica o de maior confiança por categoria). */
export function mergeViolations(
  ai: AiAnalysisResult['violations'],
  guard: AiAnalysisResult['violations'],
): AiAnalysisResult['violations'] {
  const best = new Map<AdProhibitedCategoryId, number>()
  for (const v of [...ai, ...guard]) best.set(v.id, Math.max(best.get(v.id) ?? 0, v.confidence))
  return [...best.entries()].map(([id, confidence]) => ({ id, confidence }))
}

/** A mídia do anúncio como a IA a enxergou: o tipo e se ela leu de fato (descreveu o que viu). */
export interface AiMediaStatus {
  kind: 'IMAGE' | 'VIDEO'
  read: boolean
}

/**
 * A IA só aprova sozinha quando TUDO isto vale: nenhuma suspeita de violação, tema não sensível, fora das categorias
 * restritas (que sempre passam por pessoa) e confiança alta. Qualquer dúvida segue para a fila humana.
 *
 * Mídia: anúncio só de texto passa pela regra normal. Com **foto**, só se a IA leu a foto de fato. Com **vídeo**,
 * nunca: ela vê quadros espaçados e não ouve o som, então uma pessoa sempre assiste e escuta.
 */
export function canAutoApprove(analysis: AiAnalysisResult, media: AiMediaStatus | null = null): boolean {
  if (media) {
    if (media.kind !== 'IMAGE' || !media.read) return false
  }
  if (analysis.violations.some((v) => v.confidence >= AI_VIOLATION_FLOOR)) return false
  if (analysis.sensitive) return false
  if (analysis.restricted) return false
  return analysis.confidence >= AI_AUTO_APPROVE_MIN_CONFIDENCE
}
