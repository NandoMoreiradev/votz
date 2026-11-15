import { Injectable } from '@nestjs/common'
import { ApiKeyTier, ModerationActionType, UserType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Users ────────────────────────────────────────────────────────────────

  async listUsers(params: { search?: string; page: number; limit: number }) {
    const where = params.search
      ? { OR: [{ name: { contains: params.search, mode: 'insensitive' as const } }, { email: { contains: params.search, mode: 'insensitive' as const } }] }
      : {}
    const skip = (params.page - 1) * params.limit
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, type: true, verified: true, banned: true, createdAt: true, _count: { select: { reports: true, comments: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.user.count({ where }),
    ])
    return { data, meta: { total, page: params.page, limit: params.limit, totalPages: Math.ceil(total / params.limit) } }
  }

  async findUserForBan(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, type: true, banned: true },
    })
  }

  async setBan(id: string, banned: boolean, actorId: string | null, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { banned },
        select: { id: true, banned: true },
      })
      const action = await tx.moderationAction.create({
        data: {
          action: banned ? ModerationActionType.USER_BANNED : ModerationActionType.USER_UNBANNED,
          targetType: 'USER',
          targetId: id,
          reason,
          actorId,
        },
      })
      return { user, actionId: action.id }
    })
  }

  async countAdmins() {
    return this.prisma.user.count({ where: { type: UserType.ADMIN } })
  }

  async setUserType(id: string, type: string, actorId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { type: type as UserType },
        select: { id: true, type: true },
      })
      const action = await tx.moderationAction.create({
        data: {
          action: ModerationActionType.USER_TYPE_CHANGED,
          targetType: 'USER',
          targetId: id,
          reason,
          actorId,
        },
      })
      return { user, actionId: action.id }
    })
  }

  // ── Reports ───────────────────────────────────────────────────────────────

  async listReports(params: { search?: string; page: number; limit: number }) {
    const where = params.search
      ? { title: { contains: params.search, mode: 'insensitive' as const } }
      : {}
    const skip = (params.page - 1) * params.limit
    const [data, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        select: {
          id: true, title: true, category: true, status: true, anonymous: true, createdAt: true,
          author: { select: { id: true, name: true } },
          _count: { select: { votes: true, comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.report.count({ where }),
    ])
    return { data, meta: { total, page: params.page, limit: params.limit, totalPages: Math.ceil(total / params.limit) } }
  }

  async deleteReport(id: string, actorId: string | null, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.report.findUnique({
        where: { id },
        select: {
          id: true,
          anonymous: true,
          authorId: true,
          media: true,
          author: { select: { name: true, email: true } },
        },
      })
      if (!report) return null

      const comments = await tx.comment.findMany({
        where: { reportId: id },
        select: { mediaKey: true },
      })

      await tx.notification.deleteMany({ where: { reportId: id } })
      await tx.vote.deleteMany({ where: { reportId: id } })
      await tx.comment.updateMany({ where: { reportId: id }, data: { parentId: null } })
      await tx.comment.deleteMany({ where: { reportId: id } })
      await tx.reportFollower.deleteMany({ where: { reportId: id } })
      await tx.timelineEvent.deleteMany({ where: { reportId: id } })
      await tx.report.delete({ where: { id } })

      const action = await tx.moderationAction.create({
        data: {
          action: ModerationActionType.REPORT_REMOVED,
          targetType: 'REPORT',
          targetId: id,
          reason,
          actorId,
        },
      })

      return {
        actionId: action.id,
        reportMedia: report.media ?? [],
        commentMediaKeys: comments
          .map((c) => c.mediaKey)
          .filter((k): k is string => typeof k === 'string' && k.length > 0),
        author: !report.anonymous && report.authorId && report.author ? report.author : null,
      }
    })
  }

  // ── Entities ──────────────────────────────────────────────────────────────

  async listEntities(params: { verified?: boolean; page: number; limit: number }) {
    const where = params.verified !== undefined ? { verified: params.verified } : {}
    const skip = (params.page - 1) * params.limit
    const [data, total] = await Promise.all([
      this.prisma.entity.findMany({
        where,
        select: { id: true, legalName: true, cnpj: true, type: true, verified: true, city: true, state: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.entity.count({ where }),
    ])
    return { data, meta: { total, page: params.page, limit: params.limit, totalPages: Math.ceil(total / params.limit) } }
  }

  async setEntityVerified(id: string, verified: boolean) {
    return this.prisma.entity.update({ where: { id }, data: { verified }, select: { id: true, verified: true } })
  }

  async setEntityPlan(id: string, plan: string) {
    return this.prisma.entity.update({ where: { id }, data: { plan: plan as any }, select: { id: true, plan: true } })
  }

  // ── Politicians ───────────────────────────────────────────────────────────

  async listPoliticians(params: { verified?: boolean; page: number; limit: number }) {
    const where = params.verified !== undefined ? { verified: params.verified } : {}
    const skip = (params.page - 1) * params.limit
    const [data, total] = await Promise.all([
      this.prisma.politician.findMany({
        where,
        select: { id: true, name: true, party: true, office: true, state: true, verified: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.politician.count({ where }),
    ])
    return { data, meta: { total, page: params.page, limit: params.limit, totalPages: Math.ceil(total / params.limit) } }
  }

  async setPoliticianVerified(id: string, verified: boolean) {
    return this.prisma.politician.update({ where: { id }, data: { verified }, select: { id: true, verified: true } })
  }

  async setPoliticianPlan(id: string, plan: string) {
    return this.prisma.politician.update({ where: { id }, data: { plan: plan as any }, select: { id: true, plan: true } })
  }

  async setCompanyPlan(id: string, plan: string) {
    return this.prisma.company.update({ where: { id }, data: { plan: plan as any }, select: { id: true, plan: true } })
  }

  // ── API Keys ──────────────────────────────────────────────────────────────

  async findApiKeyForTier(id: string) {
    return this.prisma.apiKey.findUnique({
      where: { id },
      select: { id: true, name: true, prefix: true, tier: true, userId: true, revokedAt: true },
    })
  }

  async setApiKeyTier(id: string, tier: ApiKeyTier, actorId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const apiKey = await tx.apiKey.update({
        where: { id },
        data: { tier },
        select: { id: true, name: true, prefix: true, tier: true, userId: true, updatedAt: true },
      })
      const action = await tx.moderationAction.create({
        data: {
          action: ModerationActionType.API_KEY_TIER_CHANGED,
          targetType: 'API_KEY',
          targetId: id,
          reason,
          actorId,
        },
      })
      return { apiKey, actionId: action.id }
    })
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  async stats() {
    const [users, reports, entities, politicians] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.report.count(),
      this.prisma.entity.count({ where: { verified: false } }),
      this.prisma.politician.count({ where: { verified: false } }),
    ])
    return { users, reports, pendingEntities: entities, pendingPoliticians: politicians }
  }
}
