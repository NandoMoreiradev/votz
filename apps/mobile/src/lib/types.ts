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
export type ProfileKind = 'users' | 'politicians' | 'entities'
export interface PublicProfile {
  id: string; name?: string; legalName?: string; avatarUrl?: string | null
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
export interface Session { user: User; accessToken: string; refreshToken: string }
export type LoginResult = Session | { requiresMfa: true; mfaToken: string } | { requiresMfaSetup: true; mfaSetupToken: string }
