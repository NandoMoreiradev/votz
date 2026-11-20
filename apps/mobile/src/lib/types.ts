import type { Category, PostDto, ReportStatus, AuthenticatedUser } from '@votz/shared-types'

export type { PostDto }
export type User = AuthenticatedUser
export interface Page<T> {
  data: T[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}
export interface Report {
  id: string; title: string; description: string; category: Category; status: ReportStatus
  city: string | null; state: string | null; anonymous: boolean; media: string[]
  pressureScore: number; createdAt: string
  author: { id: string; name: string; avatarUrl: string | null } | null
  _count: { votes: number; comments: number }
  timeline?: { id: string; content: string; createdAt: string; type: string }[]
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
