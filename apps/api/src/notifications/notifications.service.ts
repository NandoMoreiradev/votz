import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { NotificationsRepository } from './notifications.repository'

@Injectable()
export class NotificationsService {
  constructor(private readonly repo: NotificationsRepository) {}

  async notify(data: {
    userId: string
    type: NotificationType
    reportId: string
    metadata?: Record<string, unknown>
  }) {
    return this.repo.create(data)
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
