import { Injectable, Optional } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { NotificationsRepository } from './notifications.repository'
import { NotificationsGateway } from './notifications.gateway'

@Injectable()
export class NotificationsService {
  constructor(
    private readonly repo: NotificationsRepository,
    @Optional() private readonly gateway: NotificationsGateway,
  ) {}

  async notify(data: {
    userId: string
    type: NotificationType
    reportId: string
    metadata?: Record<string, unknown>
  }) {
    const notification = await this.repo.create(data)
    this.gateway?.emitToUser(data.userId, 'notification', {
      id: notification.id,
      type: notification.type,
      reportId: notification.reportId,
      metadata: notification.metadata,
      createdAt: notification.createdAt,
    })
    return notification
  }

  async list(userId: string, page = 1, limit = 20) {
    return this.repo.findByUser(userId, page, limit)
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
