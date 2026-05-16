import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { NotificacoesRepository } from './notificacoes.repository'

@Injectable()
export class NotificacoesService {
  constructor(private readonly repo: NotificacoesRepository) {}

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
