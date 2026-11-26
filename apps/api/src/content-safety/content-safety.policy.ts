import { FlagReason } from '@prisma/client'

export type ContentSafetyCategory =
  | 'profanity_insult'
  | 'hate_speech'
  | 'threat_violence'
  | 'personal_data'
  | 'defamation'
  | 'spam'

export interface SyncSafetyCheckResult {
  blocked: boolean
  blockCategory: ContentSafetyCategory | null
  blockMessage: string | null
  /** Categorias suspeitas que não bloqueiam na hora, mas priorizam a triagem por IA / humana. */
  softCategories: ContentSafetyCategory[]
  manipulationDetected: boolean
}

export interface AiSafetyFinding {
  category: ContentSafetyCategory
  confidence: number
}

export interface AiSafetyAnalysis {
  findings: AiSafetyFinding[]
  confidence: number
  explanation: string
}

/** Confiança mínima para abrir sinalização automática na fila humana. */
export const AI_FLAG_THRESHOLD = 0.5
/** Confiança mínima em abuso grave para colocar relato em quarentena (oculto até humano revisar). */
export const AI_QUARANTINE_THRESHOLD = 0.85
export const AI_EXPLANATION_MAX = 400

const VALID_CATEGORIES = new Set<ContentSafetyCategory>([
  'profanity_insult',
  'hate_speech',
  'threat_violence',
  'personal_data',
  'defamation',
  'spam',
])

const SEVERE_QUARANTINE_CATEGORIES = new Set<ContentSafetyCategory>([
  'hate_speech',
  'threat_violence',
  'personal_data',
  'profanity_insult',
])

const stripAccents = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  '$': 's',
}

/**
 * Normaliza texto para detecção anti-evasão:
 * - remove acentos e converte para minúsculas
 * - converte leetspeak quando colado a letras (ex.: "v4g4bund0", "f0d4")
 * - junta letras soltas separadas por espaços/pontos/traços (ex.: "f.d.p" -> "fdp", "p u t a" -> "puta")
 * - gera versão com letras repetidas colapsadas (ex.: "pooooorra" -> "pora")
 */
export function normalizeForSafety(text: string): { normalized: string; collapsed: string } {
  const base = stripAccents(text)

  // Converte leetspeak apenas em tokens que contenham pelo menos uma letra (não mexe em datas/números puros).
  // "!" só vira "i" quando está no meio de letras (evita corromper exclamações normais como "Absurdo!!").
  const deLeet = base.replace(/\S+/g, (token) => {
    if (!/[a-z]/.test(token)) return token
    return token
      .replace(/(?<=[a-z])!(?=[a-z])/g, 'i')
      .replace(/[013457@$]/g, (ch) => LEET_MAP[ch] ?? ch)
  })

  // Junta sequências de 3+ letras únicas separadas por espaço/ponto/hífen/underscore (ex.: "p u t a", "f.d.p").
  const joinedSpaced = deLeet.replace(/\b([a-z])(?:[\s._-]+[a-z]){2,}\b/g, (match) =>
    match.replace(/[\s._-]+/g, ''),
  )

  const normalized = joinedSpaced.replace(/[^a-z0-9*]+/g, ' ').replace(/\s+/g, ' ').trim()
  const collapsed = normalized.replace(/([a-z])\1+/g, '$1')
  return { normalized, collapsed }
}

/** Valida dígitos verificadores de um CPF (11 dígitos) para evitar falso positivo com protocolos/números aleatórios. */
export function isValidCpfDigits(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false
  if (/^(\d)\1{10}$/.test(digits)) return false
  const calc = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i)
    const mod = (sum * 10) % 11
    return mod === 10 ? 0 : mod
  }
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10])
}

/** Detecta CPF válido (com ou sem pontuação) exposto no texto. */
export function containsValidCpf(text: string): boolean {
  const matches = text.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g)
  if (!matches) return false
  return matches.some((m) => isValidCpfDigits(m.replace(/\D/g, '')))
}

/** Detecta telefone pessoal com DDD (ignora 0800/0300 e números de emergência). */
export function containsPersonalPhone(text: string): boolean {
  return /(?:\+55\s*)?(?:\([1-9]\d\)\s*|\b[1-9]\d\s+)9\d{4}[-.\s]?\d{4}\b/.test(text)
}

// ── Regras de bloqueio imediato (Camada 1) ───────────────────────────────────

const HARD_PROFANITY_PATTERNS: RegExp[] = [
  /\b(filh[oa]s? da puta|fdp|pqp|puta que pariu|vai tomar no cu|vtnc|toma no cu|vsf|vai se foder|vai se fuder|arrombad[oa]s?|desgracad[oa]s?|caralh[oa]s?|porras?|bucetas?|xoxotas?|boquetes?|punhetas?|cuz[ao]o|cuzao|cuzoes|pau no cu|foda se|fodase|fuder|foder)\b/,
  /\b(p\*rra|c\*ralho|b\*ceta|f\*da|f\*der|p\*ta)\b/,
]

const HARD_HATE_PATTERNS: RegExp[] = [
  /\b(macac[oa]s? de merda|preto imundo|pret[oa] safad[oa]|crioul[oa]|viad[oa] de merda|bicha imunda|sapatao imunda|traveco imundo|nordestin[oa] de merda|baian[oa] de merda|judeu de merda|cigano de merda|nazista de bem|hitler tinha razao|volta pra senzala|lugar de mulher e na cozinha)\b/,
]

const HARD_THREAT_PATTERNS: RegExp[] = [
  /\b(vou te matar|vamos te matar|tem que morrer|merece morrer|merecem morrer|vou quebrar sua cara|te quebrar na porrada|dar um tiro na cara|meter bala|tocar fogo na casa|vou atras da sua familia)\b/,
]

// ── Regras de alerta contextual (não bloqueiam, mas ativam triagem) ──────────

const SOFT_INSULT_PATTERNS: RegExp[] = [
  /\b(idiotas?|imbecis?|imbecil|otari[oa]s?|palhac[oa]s?|incompetentes?|merdas?|bostas?|lixos?|babacas?|cretin[oa]s?|escroto[s]?)\b/,
]

const SOFT_DEFAMATION_PATTERNS: RegExp[] = [
  /\b(ladrao|ladroes|corrupt[oa]s?|bandid[oa]s?|pilantras?|safad[oa]s?|vagabund[oa]s?|estelionatari[oa]s?|quadrilha|roubando o dinheiro)\b/,
]

const MANIPULATION_PATTERNS: RegExp[] = [
  /\bignor\w*\s+(as\s+|todas\s+as\s+|essas\s+|estas\s+|suas\s+)?(regras|instrucoes|ordens|diretrizes)\b/,
  /\b(aprove|libere|classifique)\s+(este|esse|o)\s+(relato|comentario|conteudo|texto)\s+como\s+seguro\b/,
]

function matchesAny(patterns: RegExp[], normalized: string, collapsed: string): boolean {
  return patterns.some((p) => p.test(normalized) || p.test(collapsed))
}

const BLOCK_MESSAGES: Record<ContentSafetyCategory, (label: string) => string> = {
  profanity_insult: (label) =>
    `Seu ${label} contém palavrões ou xingamentos. Descreva o problema de forma objetiva para que ele ganhe força.`,
  hate_speech: (label) =>
    `Seu ${label} contém linguagem discriminatória ou discurso de ódio, o que viola as Diretrizes da Comunidade.`,
  threat_violence: (label) =>
    `Seu ${label} contém ameaça ou incitação à violência, o que não é permitido no Votz.`,
  personal_data: (label) =>
    `Não inclua CPF no texto do ${label} para proteger dados pessoais (LGPD). Remova o número e tente novamente.`,
  defamation: (label) =>
    `Seu ${label} contém acusação pessoal direta. Descreva os fatos de forma objetiva.`,
  spam: (label) =>
    `Seu ${label} parece conter spam ou divulgação não permitida.`,
}

/**
 * Avaliação determinística síncrona (Camada 1): roda em < 5ms sem chamar IA.
 * Bloqueia apenas casos inequívocos (palavrão pesado, ódio, ameaça explícita, CPF válido).
 * Casos contextuais viram `softCategories` para a Camada 2 (IA) avaliar com contexto.
 */
export function evaluateTextSync(texts: string[], contextLabel = 'conteúdo'): SyncSafetyCheckResult {
  const raw = texts.filter(Boolean).join(' \n ')
  if (!raw.trim()) {
    return { blocked: false, blockCategory: null, blockMessage: null, softCategories: [], manipulationDetected: false }
  }

  // 1. Dados pessoais (CPF válido verificado no texto cru antes de qualquer normalização)
  if (containsValidCpf(raw)) {
    return {
      blocked: true,
      blockCategory: 'personal_data',
      blockMessage: BLOCK_MESSAGES.personal_data(contextLabel),
      softCategories: [],
      manipulationDetected: false,
    }
  }

  const { normalized, collapsed } = normalizeForSafety(raw)

  // 2. Bloqueios diretos (ameaça, ódio, palavrão pesado)
  if (matchesAny(HARD_THREAT_PATTERNS, normalized, collapsed)) {
    return {
      blocked: true,
      blockCategory: 'threat_violence',
      blockMessage: BLOCK_MESSAGES.threat_violence(contextLabel),
      softCategories: [],
      manipulationDetected: false,
    }
  }
  if (matchesAny(HARD_HATE_PATTERNS, normalized, collapsed)) {
    return {
      blocked: true,
      blockCategory: 'hate_speech',
      blockMessage: BLOCK_MESSAGES.hate_speech(contextLabel),
      softCategories: [],
      manipulationDetected: false,
    }
  }
  if (matchesAny(HARD_PROFANITY_PATTERNS, normalized, collapsed)) {
    return {
      blocked: true,
      blockCategory: 'profanity_insult',
      blockMessage: BLOCK_MESSAGES.profanity_insult(contextLabel),
      softCategories: [],
      manipulationDetected: false,
    }
  }

  // 3. Sinais contextuais (deixa publicar, mas ativa triagem detalhada)
  const softCategories: ContentSafetyCategory[] = []
  if (matchesAny(SOFT_INSULT_PATTERNS, normalized, collapsed)) softCategories.push('profanity_insult')
  if (matchesAny(SOFT_DEFAMATION_PATTERNS, normalized, collapsed)) softCategories.push('defamation')
  if (containsPersonalPhone(raw)) softCategories.push('personal_data')

  const manipulationDetected = matchesAny(MANIPULATION_PATTERNS, normalized, collapsed)

  return {
    blocked: false,
    blockCategory: null,
    blockMessage: null,
    softCategories,
    manipulationDetected,
  }
}

const clamp01 = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0

/** Valida resposta JSON crua do Gemini contra as categorias fechadas. */
export function sanitizeSafetyAnalysis(raw: unknown): AiSafetyAnalysis | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  if (typeof data.confidence !== 'number' || typeof data.explanation !== 'string') return null

  const findings = (Array.isArray(data.findings) ? data.findings : [])
    .map((f) => (f && typeof f === 'object' ? (f as Record<string, unknown>) : {}))
    .filter((f): f is { category: ContentSafetyCategory; confidence: number } =>
      typeof f.category === 'string' && VALID_CATEGORIES.has(f.category as ContentSafetyCategory),
    )
    .map((f) => ({ category: f.category, confidence: clamp01(f.confidence) }))

  const explanation = data.explanation.replace(/\s+/g, ' ').trim().slice(0, AI_EXPLANATION_MAX)
  if (!explanation) return null

  return { findings, confidence: clamp01(data.confidence), explanation }
}

/** Mapeia categoria de segurança para o enum FlagReason existente na tabela content_flags. */
export function mapSafetyCategoryToFlagReason(category: ContentSafetyCategory): FlagReason {
  switch (category) {
    case 'personal_data':
      return FlagReason.PERSONAL_DATA
    case 'threat_violence':
      return FlagReason.SEXUAL_OR_VIOLENT
    case 'spam':
      return FlagReason.SPAM_OR_ADS
    case 'defamation':
    case 'hate_speech':
    case 'profanity_insult':
    default:
      return FlagReason.OFFENSIVE
  }
}

export type SafetyDecisionAction = 'ALLOW' | 'FLAG_FOR_REVIEW' | 'QUARANTINE'

export interface SafetyDecision {
  action: SafetyDecisionAction
  topCategory: ContentSafetyCategory | null
  reason: FlagReason | null
  details: string | null
}

/** Decide entre liberar, abrir sinalização na fila humana ou colocar em quarentena. */
export function decideSafetyAction(
  ai: AiSafetyAnalysis | null,
  sync: SyncSafetyCheckResult,
): SafetyDecision {
  if (ai) {
    const sorted = [...ai.findings].sort((a, b) => b.confidence - a.confidence)
    const top = sorted[0]

    if (
      top &&
      top.confidence >= AI_QUARANTINE_THRESHOLD &&
      SEVERE_QUARANTINE_CATEGORIES.has(top.category)
    ) {
      return {
        action: 'QUARANTINE',
        topCategory: top.category,
        reason: mapSafetyCategoryToFlagReason(top.category),
        details: `[Triagem IA — ${Math.round(top.confidence * 100)}%] ${ai.explanation}`.slice(0, 500),
      }
    }

    if (top && top.confidence >= AI_FLAG_THRESHOLD) {
      return {
        action: 'FLAG_FOR_REVIEW',
        topCategory: top.category,
        reason: mapSafetyCategoryToFlagReason(top.category),
        details: `[Triagem IA — ${Math.round(top.confidence * 100)}%] ${ai.explanation}`.slice(0, 500),
      }
    }

    if (sync.manipulationDetected) {
      return {
        action: 'FLAG_FOR_REVIEW',
        topCategory: 'spam',
        reason: FlagReason.OTHER,
        details: '[Triagem automática] Texto contém possível tentativa de instrução oculta para a moderação.',
      }
    }

    return { action: 'ALLOW', topCategory: null, reason: null, details: null }
  }

  // Fallback quando a IA está desligada ou falhou: sinaliza apenas se houve alerta contextual ou manipulação.
  if (sync.softCategories.length > 0) {
    const top = sync.softCategories[0]
    return {
      action: 'FLAG_FOR_REVIEW',
      topCategory: top,
      reason: mapSafetyCategoryToFlagReason(top),
      details: `[Triagem automática] Possível violação detectada por regras (${sync.softCategories.join(', ')}). Revisão humana necessária.`,
    }
  }

  if (sync.manipulationDetected) {
    return {
      action: 'FLAG_FOR_REVIEW',
      topCategory: 'spam',
      reason: FlagReason.OTHER,
      details: '[Triagem automática] Possível tentativa de manipulação da moderação.',
    }
  }

  return { action: 'ALLOW', topCategory: null, reason: null, details: null }
}
