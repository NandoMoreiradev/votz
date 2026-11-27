import { FollowerActorType } from '@prisma/client'

/** Quem está agindo num relato. A moderação fala como "Moderação do Votz", nunca pelo nome da pessoa. */
export type LifecycleActor =
  | { kind: 'MODERATION'; userId: string; userType: 'MODERATOR' | 'ADMIN' }
  | {
      kind: 'ORG'
      userId: string
      orgType: FollowerActorType
      orgId: string
      orgName: string
      isRecipient: boolean
      hasActiveAdvocacy: boolean
    }

/** Campos do relato que o ciclo de vida lê antes de decidir. */
export interface LifecycleReport {
  id: string
  title: string
  status: string
  category: string
  anonymous: boolean
  authorId: string | null
  recipientType: string | null
  recipientId: string | null
  moderationStatus: string
  firstResponseAt: Date | null
  resolvedAt: Date | null
  archivedAt: Date | null
  resolutionConfirmedAt: Date | null
  state: string | null
  city: string | null
  cityKey: string | null
  disputeDates: Date[]
}

export const LIFECYCLE_QUEUE = 'report-lifecycle'

export interface MandatometerRefreshJob {
  politicianId: string
}
