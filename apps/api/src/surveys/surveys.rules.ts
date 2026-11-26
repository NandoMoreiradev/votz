import {
  type SurveyDistributionMode,
  type SurveyIneligibleReason,
  type SurveyQuestionType,
  type SurveyScope,
  type SurveyStatus,
  type SurveyVerificationLevel,
} from '@votz/shared-types'

export interface EligibilitySurveyInput {
  status: SurveyStatus
  scope: SurveyScope
  targetState: string | null
  targetCity: string | null
  verificationLevel: SurveyVerificationLevel
  minAccountAgeDays: number
  distributionMode: SurveyDistributionMode
  startsAt: Date | null
  endsAt: Date | null
}

export interface EligibilityUserInput {
  emailVerified: boolean
  banned: boolean
  createdAt: Date
  hasValidCpf: boolean
  state: string | null
  city: string | null
}

export interface EligibilityResult {
  eligible: boolean
  reason: SurveyIneligibleReason | null
}

function normalizeCity(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

/** Avalia se um cidadão pode participar desta pesquisa neste momento. */
export function evaluateEligibility(
  survey: EligibilitySurveyInput,
  user: EligibilityUserInput | null,
  hasVoted: boolean,
  now: Date = new Date(),
  hasActiveInvitation = false,
): EligibilityResult {
  if (survey.status !== 'OPEN') {
    return { eligible: false, reason: 'SURVEY_NOT_OPEN' }
  }
  if (survey.startsAt && now < survey.startsAt) {
    return { eligible: false, reason: 'SURVEY_NOT_OPEN' }
  }
  if (survey.endsAt && now > survey.endsAt) {
    return { eligible: false, reason: 'SURVEY_NOT_OPEN' }
  }
  if (!user) {
    return { eligible: false, reason: 'UNAUTHENTICATED' }
  }
  if (user.banned) {
    return { eligible: false, reason: 'UNAUTHENTICATED' }
  }
  if (hasVoted) {
    return { eligible: false, reason: 'ALREADY_VOTED' }
  }
  if (survey.distributionMode === 'INVITED_SAMPLE' && !hasActiveInvitation) {
    return { eligible: false, reason: 'INVITE_REQUIRED' }
  }
  if (!user.emailVerified) {
    return { eligible: false, reason: 'EMAIL_NOT_VERIFIED' }
  }

  const accountAgeMs = now.getTime() - user.createdAt.getTime()
  const minAgeMs = survey.minAccountAgeDays * 86_400_000
  if (accountAgeMs < minAgeMs) {
    return { eligible: false, reason: 'ACCOUNT_TOO_NEW' }
  }

  if (survey.verificationLevel === 'VERIFIED_CPF' && !user.hasValidCpf) {
    return { eligible: false, reason: 'CPF_REQUIRED' }
  }

  if (survey.scope === 'STATE') {
    const targetUf = (survey.targetState ?? '').trim().toUpperCase()
    const userUf = (user.state ?? '').trim().toUpperCase()
    if (!targetUf || userUf !== targetUf) {
      return { eligible: false, reason: 'OUT_OF_TERRITORY' }
    }
  } else if (survey.scope === 'MUNICIPAL') {
    const targetUf = (survey.targetState ?? '').trim().toUpperCase()
    const userUf = (user.state ?? '').trim().toUpperCase()
    const targetCity = normalizeCity(survey.targetCity)
    const userCity = normalizeCity(user.city)
    if (!targetUf || !targetCity || userUf !== targetUf || userCity !== targetCity) {
      return { eligible: false, reason: 'OUT_OF_TERRITORY' }
    }
  }

  return { eligible: true, reason: null }
}

export interface QuestionRuleInput {
  id: string
  type: SurveyQuestionType
  required: boolean
  maxSelections: number
  optionIds: readonly string[]
}

/**
 * Valida a cédula enviada pelo cidadão contra a estrutura da pesquisa.
 * Retorna mapa normalizado `{ [questionId]: optionIds[] }` ou lista de erros.
 */
export function validateBallotAnswers(
  questions: readonly QuestionRuleInput[],
  rawAnswers: Record<string, string[]>,
): { ok: true; normalized: Record<string, string[]> } | { ok: false; error: string } {
  const questionMap = new Map(questions.map((q) => [q.id, q]))
  const normalized: Record<string, string[]> = {}

  for (const key of Object.keys(rawAnswers)) {
    if (!questionMap.has(key)) {
      return { ok: false, error: `Pergunta desconhecida na cédula: ${key}` }
    }
  }

  for (const q of questions) {
    const submitted = rawAnswers[q.id] ?? []
    const unique = [...new Set(submitted)]
    if (unique.length !== submitted.length) {
      return { ok: false, error: 'A cédula contém opções duplicadas na mesma pergunta.' }
    }

    if (unique.length === 0) {
      if (q.required) {
        return { ok: false, error: 'Responda todas as perguntas obrigatórias antes de confirmar.' }
      }
      continue
    }

    const allowedOptions = new Set(q.optionIds)
    for (const optId of unique) {
      if (!allowedOptions.has(optId)) {
        return { ok: false, error: 'Uma das opções escolhidas não pertence a esta pergunta.' }
      }
    }

    if ((q.type === 'SINGLE_CHOICE' || q.type === 'SCALE_5') && unique.length > 1) {
      return { ok: false, error: 'Esta pergunta aceita apenas uma escolha.' }
    }
    if (q.type === 'MULTIPLE_CHOICE' && unique.length > q.maxSelections) {
      return { ok: false, error: `Escolha no máximo ${q.maxSelections} opções nesta pergunta.` }
    }

    normalized[q.id] = unique
  }

  return { ok: true, normalized }
}

/**
 * Trava de conformidade eleitoral (TSE): quando ligada (`SURVEYS_ELECTORAL_LOCK=true`),
 * impede publicar pesquisa marcada como eleitoral sem código de registro PesqEle e CONRE.
 */
export function validateTsePublishLock(
  survey: {
    isElectoral: boolean
    tseRegistrationCode: string | null
    statisticianConre: string | null
  },
  electoralLockEnabled: boolean,
): { ok: true } | { ok: false; error: string } {
  if (!survey.isElectoral || !electoralLockEnabled) return { ok: true }
  if (!survey.tseRegistrationCode?.trim() || !survey.statisticianConre?.trim()) {
    return {
      ok: false,
      error:
        'Trava eleitoral ativa: pesquisas eleitorais exigem código de registro no TSE (PesqEle) e CONRE do estatístico responsável antes da publicação.',
    }
  }
  return { ok: true }
}

export interface DecryptedBallotPayload {
  answers: Record<string, string[]>
  ageBand: string | null
  gender: string | null
  state: string | null
  ibgeCode: string | null
  submittedBucket: string
}

export interface AggregateRowInput {
  questionId: string
  optionId: string
  segmentKey: string
  votesCount: number
  segmentTotal: number
}

/**
 * Calcula todos os segmentos agregados (`ALL`, `STATE:<UF>`, `AGE:<band>`, `GENDER:<gender>`)
 * a partir de uma lista de cédulas anônimas.
 */
export function computeAggregatesFromBallots(
  ballots: readonly {
    answersJson: unknown
    ageBand: string | null
    gender: string | null
    state: string | null
  }[],
): AggregateRowInput[] {
  const segmentTotals = new Map<string, number>()
  const counts = new Map<string, { questionId: string; optionId: string; segmentKey: string; votesCount: number }>()

  for (const ballot of ballots) {
    const segments: string[] = ['ALL']
    if (ballot.state) segments.push(`STATE:${ballot.state.toUpperCase()}`)
    if (ballot.ageBand) segments.push(`AGE:${ballot.ageBand}`)
    if (ballot.gender) segments.push(`GENDER:${ballot.gender}`)

    const answers = (ballot.answersJson ?? {}) as Record<string, unknown>

    for (const seg of segments) {
      segmentTotals.set(seg, (segmentTotals.get(seg) ?? 0) + 1)
      for (const [questionId, rawSelected] of Object.entries(answers)) {
        if (!Array.isArray(rawSelected)) continue
        for (const optionId of rawSelected) {
          if (typeof optionId !== 'string') continue
          const key = `${seg}|${questionId}|${optionId}`
          const existing = counts.get(key)
          if (existing) {
            existing.votesCount += 1
          } else {
            counts.set(key, { questionId, optionId, segmentKey: seg, votesCount: 1 })
          }
        }
      }
    }
  }

  return Array.from(counts.values()).map((row) => ({
    ...row,
    segmentTotal: segmentTotals.get(row.segmentKey) ?? 0,
  }))
}

/**
 * Filtra os segmentos disponíveis respeitando k-anonimato (`segmentTotal >= kAnonymityThreshold`).
 * O segmento `ALL` só aparece se `totalBallots >= minQuorumToPublish`.
 */
export function filterKAnonymousSegments(
  segmentTotals: ReadonlyMap<string, number>,
  totalBallots: number,
  minQuorumToPublish: number,
  kAnonymityThreshold: number,
): string[] {
  if (totalBallots < minQuorumToPublish) return []
  const allowed: string[] = ['ALL']
  for (const [seg, count] of segmentTotals.entries()) {
    if (seg === 'ALL') continue
    if (count >= kAnonymityThreshold) {
      allowed.push(seg)
    }
  }
  return allowed.sort((a, b) => (a === 'ALL' ? -1 : b === 'ALL' ? 1 : a.localeCompare(b)))
}

function escapeCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

/** Gera CSV UTF-8 (separador ';' para Excel em português) exclusivamente de agregados k-anônimos. */
export function formatSurveyResultsCsv(params: {
  surveyTitle: string
  segmentKey: string
  totalBallots: number
  questions: {
    prompt: string
    options: { label: string; subtitle: string | null; votesCount: number; percentage: number }[]
  }[]
}): string {
  const header = ['Pesquisa', 'Recorte', 'TotalCedulas', 'Pergunta', 'Opcao', 'Subtitulo', 'Votos', 'Percentual']
  const lines = [header.join(';')]
  for (const q of params.questions) {
    for (const o of q.options) {
      lines.push(
        [
          escapeCsvCell(params.surveyTitle),
          escapeCsvCell(params.segmentKey),
          String(params.totalBallots),
          escapeCsvCell(q.prompt),
          escapeCsvCell(o.label),
          escapeCsvCell(o.subtitle ?? ''),
          String(o.votesCount),
          o.percentage.toFixed(1).replace('.', ','),
        ].join(';'),
      )
    }
  }
  return `\uFEFF${lines.join('\r\n')}`
}
