import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Interval } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsGateway } from '../notifications/notifications.gateway'

@Injectable()
export class ConversationsOutbox {
  private busy = false
  private readonly logger = new Logger(ConversationsOutbox.name)
  constructor(
    private readonly db: PrismaService,
    private readonly gateway: NotificationsGateway,
    private readonly config: ConfigService,
  ) {}

  @Interval(3600000)
  async pruneDelivered() {
    if (this.config.get('CONVERSATIONS_ENABLED') !== 'true') return
    try {
      // Bounded batches; pending retries are never discarded by retention.
      const before = new Date(Date.now() - 7 * 86400000)
      await this.db.$executeRaw`DELETE FROM conversation_outbox WHERE id IN (
        SELECT id FROM conversation_outbox WHERE sent_at < ${before}
        ORDER BY sent_at LIMIT 1000 FOR UPDATE SKIP LOCKED
      )`
    } catch {
      this.logger.error('Conversation outbox retention deferred.')
    }
  }

  @Interval(1500)
  async dispatch() {
    if (this.busy || this.config.get('CONVERSATIONS_ENABLED') !== 'true') return
    this.busy = true
    try {
      const rows = await this.db.$transaction(async (tx) => {
        const claimed = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM conversation_outbox
          WHERE sent_at IS NULL AND next_attempt_at <= NOW()
          ORDER BY created_at, id LIMIT 25 FOR UPDATE SKIP LOCKED`
        if (!claimed.length) return []
        const ids = claimed.map((r) => r.id)
        await tx.conversationOutbox.updateMany({
          where: { id: { in: ids } },
          data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 30000) },
        })
        return tx.conversationOutbox.findMany({ where: { id: { in: ids } } })
      })
      for (const row of rows) {
        try {
          this.gateway.emitToUser(row.recipientUserId, 'conversation:changed', {
            conversationId: row.conversationId,
            revision: row.revision,
          })
          await this.db.conversationOutbox.updateMany({
            where: { id: row.id, attempts: row.attempts, sentAt: null },
            data: { sentAt: new Date() },
          })
        } catch {
          this.logger.warn('Conversation invalidation deferred; durable retry remains pending.')
        }
      }
    } catch {
      this.logger.error('Conversation outbox unavailable; retry scheduled on next interval.')
    } finally {
      this.busy = false
    }
  }
}
