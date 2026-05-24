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

export interface SwitchContextResponse {
  accessToken: string
  ctx: ActiveContext | null
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

export interface Comment {
  id: string
  content: string
  parentId: string | null
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
  createdAt: string
}

export interface AuthResponse {
  user: AuthUser
  accessToken: string
}

export interface UserProfile {
  id: string
  name: string
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

export interface Entity {
  id: string
  legalName: string
  cnpj: string
  type: EntityType
  verified: boolean
  votzScore: number
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
}

export interface EntityListItem extends Omit<Entity, 'stats'> {}

export interface EntitiesResponse {
  data: EntityListItem[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

export interface Mandatometer {
  total: number
  resolved: number
  inProgress: number
  open: number
  ignored: number
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
  termStart: string
  termEnd: string
  electoralZone: string
  state: string
  city: string | null
  verified: boolean
  mandatometer: Mandatometer | null
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
