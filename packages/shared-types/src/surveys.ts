/**
 * Pesquisa Votz (pesquisas oficiais anonimizadas) — tipos, enums, limites e textos compartilhados
 * entre API, Web e Mobile.
 */

export const SURVEY_KINDS = ['VOTING_INTENTION', 'APPROVAL_RATING', 'CIVIC_TOPIC'] as const
export type SurveyKind = (typeof SURVEY_KINDS)[number]

export const SURVEY_ORIGINS = ['VOTZ', 'PARTNER_INSTITUTE', 'PUBLIC_ENTITY'] as const
export type SurveyOrigin = (typeof SURVEY_ORIGINS)[number]

export const SURVEY_DISTRIBUTION_MODES = ['OPEN', 'INVITED_SAMPLE'] as const
export type SurveyDistributionMode = (typeof SURVEY_DISTRIBUTION_MODES)[number]

export const SURVEY_METHODOLOGY_TYPES = ['OPEN_PANEL', 'WEIGHTED_QUOTA', 'REGISTERED_TSE'] as const
export type SurveyMethodologyType = (typeof SURVEY_METHODOLOGY_TYPES)[number]

export const SURVEY_STATUSES = ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'ARCHIVED', 'CANCELLED'] as const
export type SurveyStatus = (typeof SURVEY_STATUSES)[number]

export const SURVEY_SCOPES = ['NATIONAL', 'STATE', 'MUNICIPAL'] as const
export type SurveyScope = (typeof SURVEY_SCOPES)[number]

export const SURVEY_VERIFICATION_LEVELS = ['STANDARD', 'VERIFIED_CPF'] as const
export type SurveyVerificationLevel = (typeof SURVEY_VERIFICATION_LEVELS)[number]

export const SURVEY_QUESTION_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SCALE_5'] as const
export type SurveyQuestionType = (typeof SURVEY_QUESTION_TYPES)[number]

export const SURVEY_RESULTS_VISIBILITIES = ['AFTER_VOTE', 'AFTER_CLOSE'] as const
export type SurveyResultsVisibility = (typeof SURVEY_RESULTS_VISIBILITIES)[number]

export const SURVEY_REVIEW_STATUSES = ['APPROVED', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'REJECTED'] as const
export type SurveyReviewStatus = (typeof SURVEY_REVIEW_STATUSES)[number]

export const SURVEY_INVITATION_STATUSES = ['INVITED', 'RESPONDED', 'DECLINED', 'EXPIRED'] as const
export type SurveyInvitationStatus = (typeof SURVEY_INVITATION_STATUSES)[number]

export const SURVEY_REVIEW_LABELS: Record<SurveyReviewStatus, string> = {
  APPROVED: 'Aprovada',
  PENDING_REVIEW: 'Em revisão',
  CHANGES_REQUESTED: 'Ajustes pedidos',
  REJECTED: 'Recusada',
}

export interface ResearchInstituteView {
  id: string
  slug: string
  name: string
  legalName: string
  cnpj: string | null
  logoUrl: string | null
  website: string | null
  description: string | null
  statisticianLead: string | null
  conreLead: string | null
  verified: boolean
  surveysCount?: number
}

export interface SurveyInvitationView {
  invitationId: string
  status: SurveyInvitationStatus
  invitedAt: string
  expiresAt: string | null
  survey: SurveySummaryView
}

export interface SurveyComparisonItem {
  surveyId: string
  slug: string
  title: string
  origin: SurveyOrigin
  partnerName: string | null
  instituteSlug: string | null
  methodologyType: SurveyMethodologyType
  tseRegistrationCode: string | null
  marginOfError: number | null
  closedAt: string | null
  startsAt: string | null
  totalBallots: number
  topQuestionPrompt: string | null
  options: { label: string; subtitle: string | null; percentage: number; votesCount: number }[]
}

export const SURVEY_DEFAULTS = {
  MIN_QUORUM_TO_PUBLISH: 100,
  K_ANONYMITY_THRESHOLD: 30,
  MIN_ACCOUNT_AGE_DAYS: 7,
  MIX_POOL_BATCH_SIZE: 20,
  MAX_QUESTIONS: 20,
  MAX_OPTIONS_PER_QUESTION: 25,
} as const

export const SURVEY_KIND_LABELS: Record<SurveyKind, string> = {
  VOTING_INTENTION: 'Intenção de voto',
  APPROVAL_RATING: 'Avaliação de gestão',
  CIVIC_TOPIC: 'Pesquisa cívica',
}

export const SURVEY_ORIGIN_LABELS: Record<SurveyOrigin, string> = {
  VOTZ: 'Pesquisa Votz · Oficial',
  PARTNER_INSTITUTE: 'Instituto Credenciado',
  PUBLIC_ENTITY: 'Consulta Pública',
}

export const SURVEY_METHODOLOGY_LABELS: Record<SurveyMethodologyType, string> = {
  OPEN_PANEL: 'Sondagem aberta entre usuários do Votz (amostra não probabilística)',
  WEIGHTED_QUOTA: 'Amostra estratificada / ponderada por cotas (IBGE)',
  REGISTERED_TSE: 'Pesquisa eleitoral registrada no TSE (PesqEle)',
}

export const SURVEY_ANONYMITY_NOTICE =
  'Seu voto é anônimo e definitivo. Ao confirmar, o Votz separa sua identidade da sua resposta: nem você nem o sistema poderão alterar ou consultar em quem você votou.'

export type SurveyIneligibleReason =
  | 'UNAUTHENTICATED'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_TOO_NEW'
  | 'CPF_REQUIRED'
  | 'OUT_OF_TERRITORY'
  | 'SURVEY_NOT_OPEN'
  | 'ALREADY_VOTED'
  | 'INVITE_REQUIRED'

export interface SurveyOptionView {
  id: string
  position: number
  label: string
  subtitle: string | null
  imageUrl: string | null
  politicianId: string | null
  isPinnedBottom: boolean
}

export interface SurveyQuestionView {
  id: string
  position: number
  prompt: string
  helpText: string | null
  type: SurveyQuestionType
  required: boolean
  maxSelections: number
  randomizeOptions: boolean
  options: SurveyOptionView[]
}

export interface SurveySummaryView {
  id: string
  slug: string
  title: string
  subtitle: string | null
  kind: SurveyKind
  origin: SurveyOrigin
  distributionMode: SurveyDistributionMode
  methodologyType: SurveyMethodologyType
  status: SurveyStatus
  scope: SurveyScope
  targetState: string | null
  targetCity: string | null
  verificationLevel: SurveyVerificationLevel
  resultsVisibility: SurveyResultsVisibility
  featuredInFeed: boolean
  partnerName: string | null
  partnerLogoUrl: string | null
  instituteSlug?: string | null
  contractorName: string | null
  topicKey?: string | null
  reviewStatus?: SurveyReviewStatus
  reviewNote?: string | null
  isElectoral: boolean
  tseRegistrationCode: string | null
  startsAt: string | null
  endsAt: string | null
  closedAt: string | null
  totalBallots: number
  quorumReached: boolean
  hasVoted: boolean | null
  eligible: boolean | null
  ineligibleReason: SurveyIneligibleReason | null
}

export interface SurveyDetailView extends SurveySummaryView {
  description: string
  minAccountAgeDays: number
  minQuorumToPublish: number
  kAnonymityThreshold: number
  marginOfError: number | null
  confidenceLevel: number | null
  statisticianName: string | null
  statisticianConre: string | null
  methodologyNote: string
  disclaimerText: string
  questions: SurveyQuestionView[]
}

export interface SurveyOptionResultView {
  optionId: string
  label: string
  subtitle: string | null
  imageUrl: string | null
  votesCount: number
  percentage: number
}

export interface SurveyQuestionResultView {
  questionId: string
  prompt: string
  type: SurveyQuestionType
  totalResponses: number
  options: SurveyOptionResultView[]
}

export interface SurveyResultsView {
  surveyId: string
  slug: string
  status: SurveyStatus
  segmentKey: string
  totalBallots: number
  segmentTotal: number
  quorumReached: boolean
  kAnonymitySuppressed: boolean
  kAnonymityThreshold: number
  availableSegments: string[]
  updatedAt: string | null
  questions: SurveyQuestionResultView[]
}
