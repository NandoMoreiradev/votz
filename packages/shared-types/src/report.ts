import { Category, RecipientType, ReportStatus } from './enums'
import type { MediaItemDto } from './media'

export interface PublicReport {
  id: string
  title: string
  description: string
  category: Category
  status: ReportStatus
  anonymous: boolean
  latitude?: number
  longitude?: number
  normalizedAddress?: string
  city?: string
  state?: string
  neighborhood?: string
  media: string[]
  /** Só no detalhe: tamanho e moldura das fotos e vídeos (relato aparece inteiro, sem recorte). PDF e áudio ficam só em `media`. */
  mediaItems?: MediaItemDto[]
  pressureScore: number
  recipientType?: RecipientType
  recipientId?: string
  totalSupport: number
  totalMeToo: number
  totalComments: number
  createdAt: string
  updatedAt: string
  author?: {
    id: string
    name: string
    avatarUrl?: string
  }
}

export interface PublicTimelineEvent {
  id: string
  type: string
  content: string
  metadata?: Record<string, unknown>
  createdAt: string
  /** Pessoa que escreveu. Em ação de instituição ou da moderação vem vazio: quem fala é `actorOrg`. */
  author?: {
    id: string
    name: string
  } | null
  /** Instituição (ou a moderação do Votz) que agiu neste evento. */
  actorOrg?: TimelineActorOrg | null
}

export interface TimelineActorOrg {
  type: 'POLITICIAN' | 'ENTITY' | 'MODERATION'
  id: string | null
  name: string
  avatarUrl?: string | null
}

/** Avocação como aparece na página pública do relato. */
export interface PublicReportAdvocacy {
  orgType: 'POLITICIAN' | 'ENTITY'
  orgId: string
  name: string
  avatarUrl?: string | null
  subtitle?: string | null
  message?: string | null
  promisedFor?: string | null
  createdAt: string
  closedAt?: string | null
  closedReason?: 'WITHDRAWN' | 'MANDATE_ENDED' | null
}
