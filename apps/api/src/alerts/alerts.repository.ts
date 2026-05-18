import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Category, ReportStatus, RecipientType } from '@votz/shared-types'

@Injectable()
export class AlertsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countRecentReports(category: string, city: string, since: Date): Promise<number> {
    return this.prisma.report.count({
      where: {
        category: category as Category,
        city: { equals: city, mode: 'insensitive' },
        createdAt: { gte: since },
        status: { not: ReportStatus.ARCHIVED },
      },
    })
  }

  async upsertSurto(data: {
    category: string
    city: string
    state: string
    count: number
    active: boolean
  }): Promise<{ surto: { id: string; active: boolean }; justActivated: boolean }> {
    const existing = await this.prisma.surto.findUnique({
      where: { category_city: { category: data.category as Category, city: data.city } },
      select: { id: true, active: true },
    })

    const surto = await this.prisma.surto.upsert({
      where: { category_city: { category: data.category as Category, city: data.city } },
      create: {
        category: data.category as Category,
        city: data.city,
        state: data.state,
        count: data.count,
        active: data.active,
      },
      update: { count: data.count, active: data.active },
    })

    const justActivated = data.active && (!existing || !existing.active)
    return { surto, justActivated }
  }

  async findTopEntityUserForSurto(
    category: string,
    city: string,
    since: Date,
  ): Promise<string | null> {
    // Conta a entidade mais citada nos relatos deste surto
    const groups = await this.prisma.report.groupBy({
      by: ['recipientId'],
      where: {
        category: category as Category,
        city: { equals: city, mode: 'insensitive' },
        createdAt: { gte: since },
        status: { not: ReportStatus.ARCHIVED },
        recipientType: RecipientType.ENTITY,
        recipientId: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { recipientId: 'desc' } },
      take: 1,
    })

    const topEntityId = groups[0]?.recipientId
    if (!topEntityId) return null

    const entity = await this.prisma.entity.findUnique({
      where: { id: topEntityId },
      select: { userId: true },
    })

    return entity?.userId ?? null
  }

  async linkReportsToSurto(surtoId: string, category: string, city: string, since: Date): Promise<number> {
    const { count } = await this.prisma.report.updateMany({
      where: {
        category: category as Category,
        city: { equals: city, mode: 'insensitive' },
        createdAt: { gte: since },
        status: { not: ReportStatus.ARCHIVED },
      },
      data: { surtoId },
    })
    return count
  }

  async reassessAll(since: Date, threshold: number): Promise<void> {
    // Recount all category+city combos with reports in the window
    const combos = await this.prisma.report.groupBy({
      by: ['category', 'city', 'state'],
      where: {
        createdAt: { gte: since },
        status: { not: ReportStatus.ARCHIVED },
        city: { not: null },
      },
      _count: { _all: true },
    })

    for (const combo of combos) {
      if (!combo.city) continue
      const isActive = combo._count._all >= threshold
      const { surto } = await this.upsertSurto({
        category: combo.category,
        city: combo.city,
        state: combo.state ?? '',
        count: combo._count._all,
        active: isActive,
      })
      if (isActive) {
        await this.linkReportsToSurto(surto.id, combo.category, combo.city, since)
      }
    }

    // Deactivate surtos whose combination had no recent activity
    const activeKeys = new Set(combos.map((c) => `${c.category}:${c.city}`))
    const activeSurtos = await this.prisma.surto.findMany({ where: { active: true } })

    const toDeactivate = activeSurtos.filter(
      (s) => !activeKeys.has(`${s.category}:${s.city}`),
    )

    if (toDeactivate.length > 0) {
      await this.prisma.surto.updateMany({
        where: { id: { in: toDeactivate.map((s) => s.id) } },
        data: { active: false, count: 0 },
      })
    }
  }

  findVerifiedPressUsers() {
    return this.prisma.user.findMany({
      where: { type: 'PRESS', verified: true },
      select: { id: true, email: true, name: true },
    })
  }

  findActive() {
    return this.prisma.surto.findMany({
      where: { active: true },
      orderBy: { count: 'desc' },
    })
  }

  async findOneWithReports(id: string) {
    const surto = await this.prisma.surto.findUnique({ where: { id } })
    if (!surto) return null

    const reports = await this.prisma.report.findMany({
      where: { surtoId: id },
      orderBy: [{ pressureScore: 'desc' }, { createdAt: 'desc' }],
      take: 50,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        status: true,
        anonymous: true,
        city: true,
        state: true,
        neighborhood: true,
        pressureScore: true,
        createdAt: true,
        _count: { select: { votes: true, comments: true } },
        author: { select: { id: true, name: true, avatarUrl: true } },
        timeline: {
          where: { type: 'RESPONDED' },
          select: { id: true },
          take: 1,
        },
      },
    })

    const entityResponded = reports.some((r) => r.timeline.length > 0)

    return {
      ...surto,
      reports: reports.map(({ timeline, ...r }) => ({ ...r, entityResponded: timeline.length > 0 })),
      entityResponded,
    }
  }
}
