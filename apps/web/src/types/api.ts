import { Category, EntityType, ReportStatus, RecipientType, EventType, UserType } from '@votz/shared-types'

export interface Author {
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
  author: { id: string; name: string } | null
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
  _count: { votes: number; comments: number }
  author: Author | null
  timeline?: TimelineEvent[]
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
  user: { id: string; name: string; avatarUrl: string | null }
  stats?: {
    total: number
    resolved: number
    byStatus: Record<string, number>
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
}

export interface Politician {
  id: string
  party: string
  office: string
  termStart: string
  termEnd: string
  electoralZone: string
  state: string
  city: string | null
  verified: boolean
  mandatometer: Mandatometer | null
  createdAt: string
  user: { id: string; name: string; avatarUrl: string | null }
}

export interface PoliticiansResponse {
  data: Politician[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

export type LoginResponse =
  | { requiresMfa: false; user: AuthUser; accessToken: string }
  | { requiresMfa: true; mfaToken: string }
