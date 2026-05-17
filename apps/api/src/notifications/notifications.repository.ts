import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationType, Prisma } from '@prisma/client'

const NOTIF_SELECT = {
  id: true,
  type: true,
  read: true,
  createdAt: true,
  metadata: true,
  report: { select: { id: true, title: true } },
} as const

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    userId: string
    type: NotificationType
    reportId: string
    metadata?: Record<string, unknown>
  }) {
    return this.prisma.notification.create({
      data: { ...data, metadata: data.metadata as Prisma.InputJsonValue | undefined },
    })
  }

  async findByUser(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        select: NOTIF_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ])
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
  }

  async countUnread(userId: string) {
    return this.prisma.notification.count({ where: { userId, read: false } })
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    })
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    })
  }
}
