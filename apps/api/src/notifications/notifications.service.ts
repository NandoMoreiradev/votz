import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { NotificationType, RecipientType } from '@prisma/client'
import type { Queue } from 'bullmq'
import { NotificationsRepository } from './notifications.repository'
import { NotificationsGateway } from './notifications.gateway'
import {
  buildPushPayload,
  shouldDeliverInApp,
  shouldDeliverPush,
} from './notification-preferences.helper'
import {
  NOTIFICATIONS_PUSH_QUEUE,
  type NotificationPushJobData,
} from './notifications-push.processor'

export interface NotifyInput {
  userId: string
  type: NotificationType
  reportId?: string | null
  metadata?: Record<string, unknown>
  /** Se definido, suprime duplicata idêntica na janela (em ms), ex.: toggle de like/repost. */
  dedupWindowMs?: number
  /** Pares chave/valor em metadata usados na checagem de duplicata. */
  dedupMeta?: Record<string, string>
}

export interface NotifyManyInput {
  userIds: string[]
  type: NotificationType
  reportId?: string | null
  metadata?: Record<string, unknown>
  excludeUserIds?: string[]
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  constructor(
    private readonly repo: NotificationsRepository,
    @Optional() private readonly gateway?: NotificationsGateway,
    @Optional() @InjectQueue(NOTIFICATIONS_PUSH_QUEUE) private readonly pushQueue?: Queue,
  ) {}

  async notify(data: NotifyInput) {
    const prefsMap = this.repo.findPreferencesForUsers
      ? await this.repo.findPreferencesForUsers([data.userId])
      : new Map()
    const pref = prefsMap.get(data.userId)

    const inAppAllowed = shouldDeliverInApp(data.type, pref)
    const pushAllowed = shouldDeliverPush(data.type, pref)

    if (!inAppAllowed && !pushAllowed) {
      return null
    }

    if (data.dedupWindowMs && data.dedupWindowMs > 0 && this.repo.hasRecentDuplicate) {
      const duplicated = await this.repo.hasRecentDuplicate(
        data.userId,
        data.type,
        data.dedupWindowMs,
        { reportId: data.reportId ?? null, metadataMatch: data.dedupMeta },
      )
      if (duplicated) return null
    }

    let notification = null
    if (inAppAllowed) {
      notification = await this.repo.create({
        userId: data.userId,
        type: data.type,
        reportId: data.reportId ?? null,
        metadata: data.metadata,
      })
      this.gateway?.emitToUser(data.userId, 'notification', {
        id: notification.id,
        type: notification.type,
        reportId: notification.reportId,
        metadata: notification.metadata,
        createdAt: notification.createdAt,
      })
    }

    if (pushAllowed) {
      this.enqueuePush([data.userId], data.type, data.reportId, data.metadata)
    }

    return notification
  }

  async notifyMany(input: NotifyManyInput): Promise<number> {
    const excluded = new Set((input.excludeUserIds ?? []).filter(Boolean))
    const uniqueUserIds = Array.from(new Set(input.userIds)).filter((id) => id && !excluded.has(id))
    if (uniqueUserIds.length === 0) return 0

    const prefsMap = this.repo.findPreferencesForUsers
      ? await this.repo.findPreferencesForUsers(uniqueUserIds)
      : new Map()

    const now = new Date()
    const inAppUserIds: string[] = []
    const pushUserIds: string[] = []

    for (const userId of uniqueUserIds) {
      const pref = prefsMap.get(userId)
      if (shouldDeliverInApp(input.type, pref)) inAppUserIds.push(userId)
      if (shouldDeliverPush(input.type, pref, now)) pushUserIds.push(userId)
    }

    let createdCount = 0
    if (inAppUserIds.length > 0) {
      if (this.repo.createMany) {
        const created = await this.repo.createMany(
          inAppUserIds.map((userId) => ({
            userId,
            type: input.type,
            reportId: input.reportId ?? null,
            metadata: input.metadata,
          })),
        )
        createdCount = created.length
        for (const notification of created) {
          this.gateway?.emitToUser(notification.userId, 'notification', {
            id: notification.id,
            type: notification.type,
            reportId: notification.reportId,
            metadata: notification.metadata,
            createdAt: notification.createdAt,
          })
        }
      } else {
        for (const userId of inAppUserIds) {
          const notification = await this.repo.create({
            userId,
            type: input.type,
            reportId: input.reportId ?? null,
            metadata: input.metadata,
          })
          createdCount++
          this.gateway?.emitToUser(userId, 'notification', {
            id: notification.id,
            type: notification.type,
            reportId: notification.reportId,
            metadata: notification.metadata,
            createdAt: notification.createdAt,
          })
        }
      }
    }

    if (pushUserIds.length > 0) {
      this.enqueuePush(pushUserIds, input.type, input.reportId, input.metadata)
    }

    return createdCount
  }

  async notifyRecipient(
    recipientType: RecipientType | string | null | undefined,
    recipientId: string | null | undefined,
    payload: {
      type: NotificationType
      reportId?: string | null
      metadata?: Record<string, unknown>
      excludeUserIds?: string[]
    },
  ): Promise<number> {
    if (!this.repo.resolveRecipientUserIds) return 0
    const userIds = await this.repo.resolveRecipientUserIds(recipientType, recipientId)
    if (userIds.length === 0) return 0
    return this.notifyMany({
      userIds,
      type: payload.type,
      reportId: payload.reportId,
      metadata: payload.metadata,
      excludeUserIds: payload.excludeUserIds,
    })
  }

  private enqueuePush(
    userIds: string[],
    type: NotificationType,
    reportId?: string | null,
    metadata?: Record<string, unknown>,
  ) {
    if (!this.pushQueue || userIds.length === 0) return
    const { title, body, data } = buildPushPayload(type, reportId, metadata)
    this.pushQueue
      .add(
        'send-push',
        { userIds, title, body, data } satisfies NotificationPushJobData,
        {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
        },
      )
      .catch((err) => this.logger.warn(`Falha ao enfileirar push (${type}): ${err instanceof Error ? err.message : String(err)}`))
  }

  async list(userId: string, page = 1, limit = 20, unreadOnly = false) {
    return this.repo.findByUser(userId, page, limit, unreadOnly)
  }

  async unreadCount(userId: string) {
    return this.repo.countUnread(userId)
  }

  async markRead(id: string, userId: string) {
    return this.repo.markRead(id, userId)
  }

  async markAllRead(userId: string) {
    return this.repo.markAllRead(userId)
  }
}
