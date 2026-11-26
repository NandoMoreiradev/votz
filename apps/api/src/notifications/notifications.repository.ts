import { Injectable } from '@nestjs/common'
import { MembershipStatus, NotificationType, OrgType, Prisma, RecipientType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { NotificationPreferenceFlags } from './notification-preferences.helper'

const NOTIF_SELECT = {
  id: true,
  type: true,
  read: true,
  createdAt: true,
  metadata: true,
  report: { select: { id: true, title: true } },
} as const

export interface CreateNotificationRow {
  userId: string
  type: NotificationType
  reportId?: string | null
  metadata?: Record<string, unknown>
}

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateNotificationRow) {
    return this.prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        reportId: data.reportId ?? null,
        metadata: data.metadata as Prisma.InputJsonValue | undefined,
      },
    })
  }

  async createMany(rows: CreateNotificationRow[]) {
    if (rows.length === 0) return []
    const created: Array<{
      id: string
      userId: string
      type: NotificationType
      reportId: string | null
      metadata: Prisma.JsonValue
      createdAt: Date
    }> = []

    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200)
      const inserted = await this.prisma.notification.createManyAndReturn({
        data: chunk.map((row) => ({
          userId: row.userId,
          type: row.type,
          reportId: row.reportId ?? null,
          metadata: row.metadata as Prisma.InputJsonValue | undefined,
        })),
        select: {
          id: true,
          userId: true,
          type: true,
          reportId: true,
          metadata: true,
          createdAt: true,
        },
      })
      created.push(...inserted)
    }

    return created
  }

  async findPreferencesForUsers(
    userIds: string[],
  ): Promise<Map<string, NotificationPreferenceFlags>> {
    const map = new Map<string, NotificationPreferenceFlags>()
    if (userIds.length === 0) return map
    const rows = await this.prisma.userNotificationPreference.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        inAppEnabled: true,
        emailEnabled: true,
        pushEnabled: true,
        reportUpdates: true,
        reportComments: true,
        officialResponses: true,
        localSurges: true,
        officialSurveys: true,
        mentions: true,
        weeklyDigest: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    })
    for (const row of rows) {
      map.set(row.userId, row)
    }
    return map
  }

  async hasRecentDuplicate(
    userId: string,
    type: NotificationType,
    windowMs: number,
    match: { reportId?: string | null; metadataMatch?: Record<string, string> },
  ): Promise<boolean> {
    const since = new Date(Date.now() - windowMs)
    const recent = await this.prisma.notification.findMany({
      where: {
        userId,
        type,
        createdAt: { gte: since },
        ...(match.reportId !== undefined ? { reportId: match.reportId } : {}),
      },
      select: { metadata: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    if (recent.length === 0) return false
    const entries = Object.entries(match.metadataMatch ?? {})
    if (entries.length === 0) return true
    return recent.some((item) => {
      const meta = item.metadata as Record<string, unknown> | null
      if (!meta || typeof meta !== 'object') return false
      return entries.every(([k, v]) => meta[k] === v)
    })
  }

  async resolveRecipientUserIds(
    recipientType: RecipientType | string | null | undefined,
    recipientId: string | null | undefined,
  ): Promise<string[]> {
    if (!recipientType || !recipientId) return []

    let orgType: OrgType | null = null
    let orgId = recipientId

    if (recipientType === RecipientType.POLITICIAN || recipientType === 'POLITICIAN') {
      orgType = OrgType.POLITICIAN
    } else if (recipientType === RecipientType.ENTITY || recipientType === 'ENTITY') {
      orgType = OrgType.ENTITY
    } else if (recipientType === RecipientType.COMPANY || recipientType === 'COMPANY') {
      orgType = OrgType.COMPANY
    } else if (recipientType === RecipientType.BRANCH || recipientType === 'BRANCH') {
      const branch = await this.prisma.branch.findUnique({
        where: { id: recipientId },
        select: { companyId: true },
      })
      if (!branch?.companyId) return []
      orgType = OrgType.COMPANY
      orgId = branch.companyId
    }

    if (!orgType) return []

    const members = await this.prisma.orgMembership.findMany({
      where: { orgType, orgId, status: MembershipStatus.ACTIVE },
      select: { userId: true },
    })
    return Array.from(new Set(members.map((m) => m.userId)))
  }

  async findByUser(userId: string, page: number, limit: number, unreadOnly = false) {
    const skip = (page - 1) * limit
    const where: Prisma.NotificationWhereInput = unreadOnly ? { userId, read: false } : { userId }
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select: NOTIF_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
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
