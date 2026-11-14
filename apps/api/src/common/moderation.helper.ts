import { Logger } from '@nestjs/common'
import { MailService, ModerationNoticeKind } from '../mail/mail.service'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'

/**
 * Deletes R2 storage keys post-commit in fire-and-forget mode so external
 * storage failures never roll back or fail a moderation action.
 */
export function cleanupR2Keys(
  storage: StorageService,
  keys: Array<string | null | undefined>,
  logger: Logger,
): void {
  const uniqueKeys = new Set(keys.filter((k): k is string => typeof k === 'string' && k.length > 0))
  for (const key of uniqueKeys) {
    storage.delete(key).catch((err) => {
      logger.error(`Failed to delete R2 object "${key}" after moderation`, err)
    })
  }
}

/**
 * Sends a moderation notice to an identified author and stamps notifiedAt
 * on the corresponding ModerationAction only when delivery succeeds.
 */
export async function deliverModerationNotice(
  mail: MailService,
  prisma: PrismaService,
  logger: Logger,
  params: {
    actionId: string
    email?: string | null
    name?: string | null
    kind: ModerationNoticeKind
    reason: string
  },
): Promise<void> {
  if (!params.email) return
  try {
    const sent = await mail.sendModerationNotice(
      params.email,
      params.name ?? '',
      params.kind,
      params.reason,
    )
    if (sent) {
      await prisma.moderationAction.update({
        where: { id: params.actionId },
        data: { notifiedAt: new Date() },
      })
    }
  } catch (err) {
    logger.error(`Failed moderation notice / notifiedAt update for action ${params.actionId}`, err)
  }
}
