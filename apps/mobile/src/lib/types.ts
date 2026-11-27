import type { ActiveContext, Category, EventType, FeedSuggestions, MediaItemDto, OrgContextType, PostDto, RecipientType, ReportStatus, AuthenticatedUser } from '@votz/shared-types'

export type { ActiveContext, OrgContextType, PostDto }
export type User = AuthenticatedUser
export interface OrgProfile {
  id: string
  name: string
  type: OrgContextType
  logoUrl: string | null
  verified: boolean
  role: string
  permissions: string[]
}
export interface MyProfilesResponse {
  personal: {
    id: string
    name: string
    type: string
    avatarUrl: string | null
  }
  orgs: OrgProfile[]
}
export type SwitchContextResponse =
  | { requiresMfa: true }
  | { requiresMfaSetup: true }
  | { accessToken: string; ctx: ActiveContext | null }
export interface TimelineAuthor {
  id: string
  name: string
  avatarUrl: string | null
}
/** Quem fala na Memória pública: a instituição (ou a moderação), nunca a pessoa da equipe. */
export interface TimelineActorOrg {
  type: 'POLITICIAN' | 'ENTITY' | 'MODERATION'
  id: string | null
  name: string
  avatarUrl?: string | null
}
export interface TimelineEvent {
  id: string
  type: EventType | string
  content: string
  metadata?: Record<string, unknown> | null
  createdAt: string
  /** Cidadão que escreveu. Vem vazio quando quem fala é uma instituição ou a moderação. */
  author?: TimelineAuthor | null
  actorOrg?: TimelineActorOrg | null
}
/** Compromisso público de um político ou entidade (avocação), no detalhe do relato. */
export interface ReportAdvocacyCard {
  orgType: 'POLITICIAN' | 'ENTITY'
  orgId: string
  name: string
  avatarUrl: string | null
  subtitle: string | null
  message: string | null
  promisedFor: string | null
  createdAt: string
  closedAt: string | null
  closedReason: 'WITHDRAWN' | 'MANDATE_ENDED' | null
}
export interface ReportFollowersResponse {
  count: number
  politicians: { id: string; name: string; office: string; state: string }[]
  entities: { id: string; legalName: string }[]
}
export interface Page<T> {
  data: T[]
  /** "Para você" de quem segue poucas contas: cartão de perfis da cidade (só na página 1). */
  suggestions?: FeedSuggestions | null
  suggestionsAfter?: number
  meta: { page: number; limit: number; total: number; totalPages: number }
}
export interface Report {
  id: string; title: string; description: string; category: Category; status: ReportStatus
  neighborhood?: string | null; city: string | null; state: string | null; anonymous: boolean; media: string[]
  recipientType?: RecipientType | string | null; recipientId?: string | null
  /** Só no detalhe: tamanho e moldura das fotos e vídeos (relato aparece inteiro, sem recorte). */
  mediaItems?: MediaItemDto[]
  pressureScore: number; createdAt: string
  author: { id: string; name: string; avatarUrl: string | null } | null
  _count: { votes: number; meTooVotes?: number; comments: number }
  timeline?: TimelineEvent[]
  // Só no detalhe: ciclo de vida
  advocacies?: ReportAdvocacyCard[]
  resolvedAt?: string | null
  archivedAt?: string | null
  archiveReason?: string | null
  resolutionConfirmedAt?: string | null
  resolvedWithoutEvidence?: boolean
}
export interface SimilarReport {
  id: string; title: string; description: string; category: Category; status: ReportStatus
  city: string | null; state: string | null; createdAt: string; pressureScore: number
}
export type RecipientKind = 'ENTITY' | 'POLITICIAN' | 'COMPANY'
export interface Recipient { type: RecipientKind; id: string; name: string }
export type ReportSummary = Pick<Report, 'id' | 'title' | 'status' | 'city' | 'createdAt' | '_count'>
export type ProfileKind = 'users' | 'politicians' | 'entities' | 'companies'
export interface PublicProfile {
  id: string; name?: string; legalName?: string; tradeName?: string; sector?: string; avatarUrl?: string | null
  coverUrl?: string | null; followersCount?: number
  logoUrl?: string | null; bio?: string | null; description?: string | null
  office?: string; city?: string | null; state?: string | null; verified?: boolean
  votzScore?: number; reputation?: number
  username?: string | null; createdAt?: string
  _count?: { reports?: number; votes?: number; comments?: number }
}
export interface ReportComment {
  id: string; content: string; parentId: string | null; createdAt: string
  mediaType: 'TEXT' | 'AUDIO' | 'VIDEO'; mediaUrl: string | null
  author: { id: string; name: string; avatarUrl: string | null }
  _count: { replies: number }; replies?: ReportComment[]
}
export type DebateStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED'
export type StreamProvider = 'LIVEKIT' | 'YOUTUBE'
export type ReactionType = 'APPLAUSE' | 'FIRE' | 'POSITIVE' | 'QUESTION' | 'DISAGREEMENT'
export interface DebatePolitician { id: string; name: string; avatarUrl: string | null; office: string; party: { abbreviation: string } }
export interface DebateParticipant {
  id: string; politicianId: string; role: 'MODERATOR' | 'DEBATER'; inviteStatus: 'PENDING' | 'CONFIRMED' | 'DECLINED'
  /** Live do próprio debatedor ("Assistir pelo canal de X"), se ele colocou. */
  youtubeVideoId: string | null; youtubeChannelTitle: string | null
  politician: DebatePolitician
}
export interface Debate {
  id: string; title: string; description: string | null; scheduledFor: string; status: DebateStatus
  streamProvider: StreamProvider; youtubeVideoId: string | null; youtubeChannelTitle: string | null
  /** Anfitrião: político em `creator` ou entidade em `hostEntity` (um dos dois). */
  creator: DebatePolitician | null; hostEntity: { id: string; legalName: string; logoUrl: string | null } | null
  viewerCount: number; chatCooldownSecs: number; participants: DebateParticipant[]
}
export interface DebateAuthor { id: string; name: string; avatarUrl: string | null }
export interface DebateQuestion { id: string; text: string; upvotes: number; answered: boolean; createdAt: string; author: DebateAuthor }
export interface DebateMessage { id: string; text: string; createdAt: string; author: DebateAuthor }
export interface DebatePoll { id: string; question: string; active: boolean; options: { id: string; text: string; totalVotes: number }[] }
export interface Session { user: User; accessToken: string; refreshToken: string }
export type LoginResult = Session | { requiresMfa: true; mfaToken: string } | { requiresMfaSetup: true; mfaSetupToken: string }
