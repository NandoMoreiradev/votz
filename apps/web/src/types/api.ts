import { Category, ReportStatus, RecipientType, EventType, UserType } from '@votz/shared-types'

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

export type LoginResponse =
  | { requiresMfa: false; user: AuthUser; accessToken: string }
  | { requiresMfa: true; mfaToken: string }
