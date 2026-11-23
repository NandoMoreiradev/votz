// Credenciamento de imprensa: valores e textos que API e site usam do mesmo jeito.

export const PRESS_OUTLET_TYPES = [
  'TV',
  'RADIO',
  'NEWSPAPER',
  'PORTAL',
  'AGENCY',
  'INDEPENDENT',
  'FREELANCER',
  'OTHER',
] as const
export type PressOutletType = (typeof PRESS_OUTLET_TYPES)[number]

export const PRESS_OUTLET_LABELS: Record<PressOutletType, string> = {
  TV: 'TV',
  RADIO: 'Rádio',
  NEWSPAPER: 'Jornal ou revista',
  PORTAL: 'Portal ou site de notícias',
  AGENCY: 'Agência de notícias',
  INDEPENDENT: 'Mídia independente ou blog',
  FREELANCER: 'Jornalista freelancer',
  OTHER: 'Outro',
}

export const PRESS_CREDENTIAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'REVOKED'] as const
export type PressCredentialStatus = (typeof PRESS_CREDENTIAL_STATUSES)[number]

export const PRESS_CREDENTIAL_STATUS_LABELS: Record<PressCredentialStatus, string> = {
  PENDING: 'Em análise',
  APPROVED: 'Aprovada',
  REJECTED: 'Recusada',
  REVOKED: 'Cancelada',
}

export const PRESS_CREDENTIAL_LIMITS = {
  OUTLET_NAME_MAX: 120,
  JOB_TITLE_MAX: 80,
  WEBSITE_MAX: 300,
  EMAIL_MAX: 200,
  COVERAGE_MAX: 160,
  NOTE_MAX: 500,
  REVIEW_NOTE_MAX: 500,
  PORTFOLIO_MAX: 5,
  PORTFOLIO_MIN: 1,
} as const

/** Dado que o jornalista vê do próprio pedido (nunca devolve o código do e-mail). */
export interface MyPressCredential {
  id: string
  status: PressCredentialStatus
  outletName: string
  outletType: PressOutletType
  jobTitle: string | null
  website: string
  newsroomEmail: string
  coverageArea: string | null
  portfolioUrls: string[]
  note: string | null
  emailConfirmed: boolean
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
}

// ── Plano da imprensa ────────────────────────────────────────────────────────

export const PRESS_PLANS = ['GRATUITA', 'PRO'] as const
export type PressPlan = (typeof PRESS_PLANS)[number]

export const PRESS_PLAN_LABELS: Record<PressPlan, string> = {
  GRATUITA: 'Credencial gratuita',
  PRO: 'Imprensa Pro',
}

export const PRESS_RADAR_KINDS = ['SURGE', 'PRESSURE', 'UNANSWERED'] as const
export type PressRadarKind = (typeof PRESS_RADAR_KINDS)[number]

export const PRESS_RADAR_KIND_LABELS: Record<PressRadarKind, string> = {
  SURGE: 'Surto detectado',
  PRESSURE: 'Relato com muita pressão',
  UNANSWERED: 'Relato sem resposta da entidade',
}

export const PRESS_RADAR_KIND_HELP: Record<PressRadarKind, string> = {
  SURGE: 'Avisa quando o Votz detecta um aumento de relatos do mesmo tema na mesma cidade.',
  PRESSURE: 'Avisa quando um relato passa da pressão que você escolher.',
  UNANSWERED: 'Avisa quando um relato fica sem nenhuma resposta da entidade pelo número de dias que você escolher.',
}

export const PRESS_RADAR_FREQUENCIES = ['IMMEDIATE', 'DAILY'] as const
export type PressRadarFrequency = (typeof PRESS_RADAR_FREQUENCIES)[number]

export const PRESS_RADAR_FREQUENCY_LABELS: Record<PressRadarFrequency, string> = {
  IMMEDIATE: 'Na hora (até 15 minutos)',
  DAILY: 'Um resumo por dia',
}

export const PRESS_RADAR_LIMITS = {
  NAME_MAX: 80,
  NAME_MIN: 2,
  MAX_STATES: 5,
  MAX_CITIES: 5,
  CITY_MAX: 100,
  MIN_PRESSURE_MIN: 1,
  MIN_PRESSURE_MAX: 10000,
  STALLED_DAYS_MIN: 1,
  STALLED_DAYS_MAX: 90,
} as const

/** O que cada plano libera. A credencial gratuita já traz radar pequeno e CSV de 90 dias. */
export interface PressPlanLimits {
  maxRadarRules: number
  radarFrequencies: readonly PressRadarFrequency[]
  exportMaxDays: number
  exportMaxRows: number
  /** CSV com descrição e destinatário do relato. */
  richExport: boolean
  jsonExport: boolean
  /** Série histórica (relatos, respondidos e resolvidos por semana ou mês). */
  timeSeries: boolean
  /** Quantos relatos a busca por significado devolve. */
  searchResults: number
  /** Briefing de surto escrito por IA. */
  aiBriefing: boolean
  /**
   * O plano pode pedir contato a cidadãos. Sem teto por dia: a proteção do cidadão é a recusa, o bloqueio e a
   * suspensão do jornalista por denúncias de abuso.
   */
  canRequestContact: boolean
}

export const PRESS_PLAN_LIMITS: Record<PressPlan, PressPlanLimits> = {
  GRATUITA: {
    maxRadarRules: 2,
    radarFrequencies: ['DAILY'],
    exportMaxDays: 90,
    exportMaxRows: 1000,
    richExport: false,
    jsonExport: false,
    timeSeries: false,
    searchResults: 10,
    aiBriefing: false,
    canRequestContact: false,
  },
  PRO: {
    maxRadarRules: 20,
    radarFrequencies: ['IMMEDIATE', 'DAILY'],
    exportMaxDays: 365,
    exportMaxRows: 5000,
    richExport: true,
    jsonExport: true,
    timeSeries: true,
    searchResults: 30,
    aiBriefing: true,
    canRequestContact: true,
  },
}

export interface PressRadarRuleView {
  id: string
  name: string
  kind: PressRadarKind
  states: string[]
  cities: string[]
  categories: string[]
  minPressure: number | null
  stalledDays: number | null
  frequency: PressRadarFrequency
  active: boolean
  lastDigestAt: string | null
  createdAt: string
}

/** Resposta de GET /imprensa/plano: o plano de quem está logado e o que ele libera. */
export interface PressPlanInfo {
  plan: PressPlan
  limits: PressPlanLimits
  /** Existe preço do plano Pro configurado no Stripe (senão, só a equipe libera). */
  checkoutAvailable: boolean
  hasSubscription: boolean
  supportEmail: string
}

// ── Busca por significado e briefing de surto (IA) ────────────────────────────

export const PRESS_SEARCH_LIMITS = { QUERY_MIN: 3, QUERY_MAX: 300 } as const

export interface PressSearchResult {
  id: string
  title: string
  excerpt: string
  category: string
  status: string
  city: string | null
  state: string | null
  pressureScore: number
  createdAt: string
  /** O autor aceita pedido de contato da imprensa (o botão fica na página do relato). */
  pressContactOk: boolean
  /** 0 a 100: o quanto o relato "fala do mesmo assunto" da busca. */
  score: number
}

export interface PressSearchResponse {
  query: string
  total: number
  results: PressSearchResult[]
  /** Relatos que ainda não entraram no índice da busca (são indexados aos poucos). */
  indexing: { missing: number }
}

export interface PressBriefingComplaint {
  title: string
  detail: string
  /** Números dos relatos de apoio (ver `references`). */
  refs: number[]
}

/** Texto escrito pela IA. Nunca traz número: os números ficam em `stats`, calculados no banco. */
export interface PressBriefingContent {
  headline: string
  summary: string
  complaints: PressBriefingComplaint[]
  questions: string[]
  caveats: string[]
}

export interface PressBriefingStats {
  category: string
  city: string
  state: string
  totalReports: number
  publicReports: number
  answeredReports: number
  firstReportAt: string | null
  lastReportAt: string | null
  avgPressure: number
  maxPressure: number
  byStatus: Record<string, number>
  topNeighborhoods: Array<{ name: string; count: number }>
  topEntities: Array<{ name: string; count: number }>
}

export interface PressBriefingReference {
  n: number
  id: string
  title: string
  city: string | null
  state: string | null
}

export interface PressBriefing {
  surtoId: string
  generatedAt: string
  /** `false` quando a IA não respondeu ou não passou na checagem: só os números, sem texto escrito por IA. */
  aiGenerated: boolean
  stats: PressBriefingStats
  content: PressBriefingContent | null
  references: PressBriefingReference[]
  disclaimer: string
}

// ── Pedido de contato da imprensa ao cidadão (consentimento) ──────────────────

export const PRESS_CONTACT_LIMITS = {
  MESSAGE_MIN: 20,
  MESSAGE_MAX: 500,
  REPLY_MAX: 300,
  /** Dias até o pedido sem resposta deixar de valer. */
  EXPIRES_DAYS: 14,
  /** Depois que a pessoa recusa, o mesmo jornalista não pede de novo por este tempo. */
  DECLINE_COOLDOWN_DAYS: 7,
  /** Denúncias de abuso (recusa "abusivo") que suspendem os pedidos do jornalista até a moderação revisar. */
  ABUSE_SUSPEND_AT: 5,
} as const

export const PRESS_CONTACT_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'] as const
export type PressContactStatusView = (typeof PRESS_CONTACT_STATUSES)[number]

export const PRESS_CONTACT_STATUS_LABELS: Record<PressContactStatusView, string> = {
  PENDING: 'Aguardando resposta',
  ACCEPTED: 'Aceito',
  DECLINED: 'Sem disponibilidade',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Venceu sem resposta',
}

export const PRESS_CONTACT_DECLINE_REASONS = ['NOT_NOW', 'NOT_INTERESTED', 'ABUSIVE'] as const
export type PressContactDeclineReason = (typeof PRESS_CONTACT_DECLINE_REASONS)[number]

export const PRESS_CONTACT_DECLINE_LABELS: Record<PressContactDeclineReason, string> = {
  NOT_NOW: 'Agora não posso',
  NOT_INTERESTED: 'Não quero falar sobre isso',
  ABUSIVE: 'Este pedido é abusivo ou suspeito (denunciar)',
}

/** O que o cidadão vê de um pedido que recebeu. Nenhum contato do jornalista além do que ele mesmo escreveu. */
export interface PressContactReceived {
  id: string
  status: PressContactStatusView
  createdAt: string
  expiresAt: string
  message: string
  outlet: { name: string; type: PressOutletType; website: string }
  journalist: { id: string; name: string }
  report: { id: string; title: string }
  reply: string | null
  viaVotzChat: boolean
  respondedAt: string | null
}

/** O que o jornalista vê de um pedido que enviou. Recusa nunca mostra o motivo. */
export interface PressContactSent {
  id: string
  status: PressContactStatusView
  createdAt: string
  expiresAt: string
  message: string
  recipient: { name: string }
  report: { id: string; title: string }
  /** Só preenchido quando o cidadão aceitou. */
  reply: string | null
  viaVotzChat: boolean
  respondedAt: string | null
}

/** Estado do "aceito falar com a imprensa" de um relato, do ponto de vista de quem está olhando. */
export interface PressContactReportStatus {
  optIn: boolean
  isAuthor: boolean
  /** O jornalista (Pro, credenciado) pode pedir contato agora? */
  canRequest: boolean
  /** Quando não pode, o porquê em português. */
  reason: string | null
  alreadyRequested: boolean
}
