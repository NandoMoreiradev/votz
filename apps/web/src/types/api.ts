import { Category, EntityType, ReportStatus, RecipientType, EventType, UserType, ActiveContext, OrgContextType } from '@votz/shared-types'

export type { ActiveContext, OrgContextType }

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
    type: UserType
    avatarUrl: string | null
  }
  orgs: OrgProfile[]
}

export type SwitchContextResponse =
  | { requiresMfa: true }
  | { requiresMfaSetup: true }
  | { accessToken: string; ctx: ActiveContext | null }

export interface MfaEnableResponse {
  backupCodes: string[]
}

export interface MfaRegenerateBackupCodesResponse {
  backupCodes: string[]
}

export interface Author {
  id: string
  name: string
  avatarUrl: string | null
}

export interface AdvocacyAuthor {
  id: string
  name: string
  avatarUrl: string | null
}

export interface TimelineEvent {
  id: string
  type: EventType
  content: string
  metadata: unknown
  createdAt: string
  author: AdvocacyAuthor | null
}

export interface ReportAdvocacy {
  author: AdvocacyAuthor | null
  createdAt: string
}

export interface Report {
  id: string
  title: string
  description: string
  category: Category
  status: ReportStatus
  anonymous: boolean
  latitude: number | null
  longitude: number | null
  normalizedAddress: string | null
  city: string | null
  state: string | null
  neighborhood: string | null
  media: string[]
  pressureScore: number
  recipientType: RecipientType | null
  recipientId: string | null
  createdAt: string
  updatedAt: string
  _count: { votes: number; comments: number; meTooVotes: number }
  author: Author | null
  timeline?: TimelineEvent[]
  advocacy?: ReportAdvocacy | null
}

export interface ReportsResponse {
  data: Report[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export type CommentMediaType = 'TEXT' | 'AUDIO' | 'VIDEO'

export interface Comment {
  id: string
  content: string
  parentId: string | null
  mediaType: CommentMediaType
  mediaUrl: string | null
  mediaDuration: number | null
  transcript: string | null
  createdAt: string
  updatedAt: string
  author: { id: string; name: string; avatarUrl: string | null }
  _count: { replies: number }
  replies?: Comment[]
}

export interface VoteCounts {
  SUPPORT: number
  ME_TOO: number
}

export interface AuthUser {
  id: string
  name: string
  email: string
  type: UserType
  verified: boolean
  reputation: number
  avatarUrl: string | null
  emailVerified: boolean
  mfaEnabled: boolean
  hasPassword?: boolean
  termsAcceptedAt?: string | null
  termsVersion?: string | null
  privacyVersion?: string | null
  ageConfirmedAt?: string | null
  createdAt: string
}

export interface AuthResponse {
  user: AuthUser
  accessToken: string
}

export interface UserProfile {
  id: string
  name: string
  username?: string | null
  type: UserType
  verified: boolean
  reputation: number
  avatarUrl: string | null
  bio?: string
  createdAt: string
  _count: { reports: number; votes: number; comments: number }
}

export interface UserReport {
  id: string
  title: string
  category: Category
  status: ReportStatus
  city: string | null
  state: string | null
  pressureScore: number
  createdAt: string
  _count: { votes: number; comments: number }
}

export interface UserReportsResponse {
  data: UserReport[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface CategoryStat {
  category: Category
  count: number
}

export interface MonthlyVolumeDatum {
  month: string
  count: number
}

export interface ProfileMetrics {
  responseRate: number
  resolutionRate: number
  contestationRate: number
  trustBadge: boolean
  classification: string
}

export type { EntityPlan, PoliticianPlan } from '@votz/shared-types'
import type { EntityPlan, PoliticianPlan } from '@votz/shared-types'
export type PoliticianStatus = 'ATIVO' | 'ENCERRADO' | 'AFASTADO'

export interface Entity {
  id: string
  legalName: string
  cnpj: string | null
  ibgeCode: string | null
  type: EntityType
  verified: boolean
  votzScore: number
  plan: EntityPlan
  slaHours: Record<string, number> | null
  city: string | null
  state: string | null
  logoUrl: string | null
  website: string | null
  createdAt: string
  stats?: {
    total: number
    resolved: number
    byStatus: Record<string, number>
    byCategory: CategoryStat[]
  }
  monthlyVolume?: MonthlyVolumeDatum[]
  metrics?: ProfileMetrics
}

export interface EntityListItem extends Omit<Entity, 'stats' | 'monthlyVolume' | 'metrics'> {}

export interface EntitiesResponse {
  data: EntityListItem[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

export interface Mandatometer {
  total: number
  resolved: number
  inProgress: number
  open: number
  disputed: number
  byStatus: Record<string, number>
  byCategory: CategoryStat[]
}

export interface PoliticianParty {
  id: string
  name: string
  abbreviation: string
  number: number
  logoUrl: string | null
}

export interface Politician {
  id: string
  name: string
  party: PoliticianParty
  office: string
  status: PoliticianStatus
  termStart: string
  termEnd: string
  electoralZone: string
  state: string
  city: string | null
  avatarUrl: string | null
  website: string | null
  verified: boolean
  plan: PoliticianPlan
  mandatometer: Mandatometer | null
  monthlyVolume?: MonthlyVolumeDatum[]
  metrics?: ProfileMetrics
  createdAt: string
}

export interface PoliticiansResponse {
  data: Politician[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

export interface CompanyBranch {
  id: string
  name: string
  city: string
  state: string
}

export interface Company {
  id: string
  legalName: string
  tradeName: string
  cnpj: string
  sector: string
  size: string
  verified: boolean
  plan: string
  votzScore: number
  slaHours: number
  logoUrl: string | null
  website: string | null
  createdAt: string
  branches: CompanyBranch[]
  stats?: {
    total: number
    resolved: number
    byStatus: Record<string, number>
    byCategory: CategoryStat[]
  }
}

export interface CompanyListItem extends Omit<Company, 'stats'> {}

export interface CompaniesResponse {
  data: CompanyListItem[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

export interface SimilarReport {
  id: string
  title: string
  description: string
  category: string
  status: string
  city: string | null
  state: string | null
  createdAt: string
  pressureScore: number
  score: number
  sources: string[]
}

export type LoginResponse =
  | { requiresMfa: false; requiresMfaSetup: false; user: AuthUser; accessToken: string }
  | { requiresMfa: true; requiresMfaSetup: false; mfaToken: string }
  | { requiresMfa: false; requiresMfaSetup: true; mfaSetupToken: string }

export interface MfaSetupResponse {
  secret: string
  otpauthUrl: string
  qrCode: string
}

export interface MfaEnableForcedResponse {
  backupCodes: string[]
  accessToken: string
  user: AuthUser
}

export interface FollowerPolitician {
  id: string
  name: string
  office: string
  state: string
}

export interface FollowerEntity {
  id: string
  legalName: string
  type: string
}

export interface FollowersResponse {
  count: number
  politicians: FollowerPolitician[]
  entities: FollowerEntity[]
}

// ==================== DEBATES ====================

export type DebateStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED'
export type InviteStatus = 'PENDING' | 'CONFIRMED' | 'DECLINED'
export type ParticipantRole = 'MODERATOR' | 'DEBATER'
export type ReactionType = 'APPLAUSE' | 'FIRE' | 'POSITIVE' | 'QUESTION' | 'DISAGREEMENT'

export interface DebateParticipantPolitician {
  id: string
  name: string
  avatarUrl: string | null
  office: string
  party: { abbreviation: string }
}

export interface DebateParticipant {
  id: string
  politicianId: string
  role: ParticipantRole
  inviteStatus: InviteStatus
  createdAt: string
  politician: DebateParticipantPolitician
}

export interface DebateQuestion {
  id: string
  debateId: string
  text: string
  upvotes: number
  answered: boolean
  createdAt: string
  author: { id: string; name: string; avatarUrl: string | null }
}

export interface DebateMessage {
  id: string
  debateId: string
  text: string
  createdAt: string
  author: { id: string; name: string; avatarUrl: string | null }
}

export interface DebatePollOption {
  id: string
  text: string
  totalVotes: number
}

export interface DebatePoll {
  id: string
  debateId: string
  question: string
  active: boolean
  createdAt: string
  options: DebatePollOption[]
}

export interface Debate {
  id: string
  title: string
  description: string | null
  scheduledFor: string
  status: DebateStatus
  livekitRoomName: string | null
  hlsUrl: string | null
  recordingUrl: string | null
  viewerCount: number
  chatCooldownSecs: number
  creatorId: string
  creator: DebateParticipantPolitician
  participants: DebateParticipant[]
  createdAt: string
  updatedAt: string
}

export interface DebatesResponse {
  data: Debate[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

// ==================== PUBLICAÇÕES & PAUTAS CÍVICAS ====================

export type {
  CivicTopicSummaryDto,
  EmbeddedDebateDto,
  EmbeddedDebatePollDto,
  EmbeddedPropostaDto,
  EmbeddedReportDto,
  FeedSortMode,
  GifSearchItem,
  PostAuthorInfo,
  PostCommentDto,
  PostDto,
  PostPollDto,
  PostPollOptionDto,
  PostQuoteDto,
} from '@votz/shared-types'

import type {
  CivicTopicSummaryDto,
  GifSearchItem,
  PostDto,
} from '@votz/shared-types'

export interface PostsResponse {
  data: PostDto[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface GifSearchResponse {
  enabled: boolean
  provider: 'klipy' | 'giphy' | null
  items: GifSearchItem[]
  next: string | null
}

export interface TopicDetailResponse {
  topic: CivicTopicSummaryDto
  reports: Array<{
    id: string
    title: string
    description: string
    category: Category
    status: ReportStatus
    city: string | null
    state: string | null
    pressureScore: number
    media: string[]
    createdAt: string
    _count: { votes: number; comments: number }
  }>
  debates: Array<{
    id: string
    title: string
    description: string | null
    status: string
    scheduledFor: string
    viewerCount: number
    creator: { id: string; name: string; avatarUrl: string | null }
  }>
  topCities: Array<{ name: string; count: number }>
  following: boolean
}
