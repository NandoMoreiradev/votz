import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Category, EventType, RecipientType, ReportStatus } from '@votz/shared-types'

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000)
}

@Injectable()
export class ImprensaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getResumo() {
    const since30 = daysAgo(30)

    const [
      totalReports,
      reportsLast30,
      totalResolved,
      totalVotes,
      activeSurtos,
      totalNonArchived,
      respondedDistinct,
    ] = await Promise.all([
      this.prisma.report.count(),
      this.prisma.report.count({ where: { createdAt: { gte: since30 } } }),
      this.prisma.report.count({ where: { status: ReportStatus.RESOLVED } }),
      this.prisma.vote.count(),
      this.prisma.surto.count({ where: { active: true } }),
      this.prisma.report.count({ where: { status: { not: ReportStatus.ARCHIVED } } }),
      this.prisma.timelineEvent
        .groupBy({ by: ['reportId'], where: { type: EventType.RESPONDED } })
        .then((g) => g.length),
    ])

    return {
      totalReports,
      reportsLast30,
      totalResolved,
      totalVotes,
      activeSurtos,
      responseRate:
        totalNonArchived > 0
          ? ((respondedDistinct / totalNonArchived) * 100).toFixed(1)
          : '0.0',
      resolvedRate:
        totalNonArchived > 0
          ? ((totalResolved / totalNonArchived) * 100).toFixed(1)
          : '0.0',
      generatedAt: new Date().toISOString(),
    }
  }

  async getTendencias(days: number) {
    const since = daysAgo(days)
    const baseWhere = { createdAt: { gte: since }, status: { not: ReportStatus.ARCHIVED } } as const

    const [byCategory, topCidades] = await Promise.all([
      this.prisma.report.groupBy({
        by: ['category'],
        where: baseWhere,
        _count: { _all: true },
        orderBy: { _count: { category: 'desc' } },
      }),
      this.prisma.report.groupBy({
        by: ['city', 'state'],
        where: { ...baseWhere, city: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { city: 'desc' } },
        take: 10,
      }),
    ])

    const total = byCategory.reduce((s, c) => s + c._count._all, 0)

    return {
      byCategory: byCategory.map((c) => ({
        category: c.category as Category,
        count: c._count._all,
        pct: total > 0 ? ((c._count._all / total) * 100).toFixed(1) : '0.0',
      })),
      topCidades: topCidades.map((c) => ({
        city: c.city,
        state: c.state,
        count: c._count._all,
      })),
      period: days,
    }
  }

  async getRelatosDestaque(limit: number) {
    return this.prisma.report.findMany({
      where: {
        anonymous: false,
        status: { not: ReportStatus.ARCHIVED },
      },
      orderBy: { pressureScore: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        city: true,
        state: true,
        neighborhood: true,
        pressureScore: true,
        status: true,
        createdAt: true,
        _count: { select: { votes: true, comments: true } },
      },
    })
  }

  async getEntidadesRanking(limit: number) {
    const since = daysAgo(90)

    const counts = await this.prisma.report.groupBy({
      by: ['recipientId'],
      where: {
        recipientType: RecipientType.ENTITY,
        recipientId: { not: null },
        createdAt: { gte: since },
        status: { not: ReportStatus.ARCHIVED },
      },
      _count: { _all: true },
      orderBy: { _count: { recipientId: 'desc' } },
      take: limit,
    })

    const entityIds = counts.map((c) => c.recipientId!).filter(Boolean)
    if (entityIds.length === 0) return []

    const entities = await this.prisma.entity.findMany({
      where: { id: { in: entityIds } },
      select: {
        id: true,
        legalName: true,
        type: true,
        city: true,
        state: true,
        verified: true,
        votzScore: true,
        logoUrl: true,
      },
    })

    const entityMap = new Map(entities.map((e) => [e.id, e]))

    return counts
      .map((c) => {
        const entity = entityMap.get(c.recipientId!)
        if (!entity) return null
        return { ...entity, reportCount: c._count._all }
      })
      .filter(Boolean)
  }

  async getSurtosAtivos() {
    return this.prisma.surto.findMany({
      where: { active: true },
      orderBy: { count: 'desc' },
    })
  }

  async getReportsForExport(days: number, state?: string, category?: string) {
    const since = daysAgo(days)
    return this.prisma.report.findMany({
      where: {
        anonymous: false,
        status: { not: ReportStatus.ARCHIVED },
        createdAt: { gte: since },
        ...(state && { state: { equals: state.toUpperCase() } }),
        ...(category && { category: category as Category }),
      },
      orderBy: { pressureScore: 'desc' },
      take: 5000,
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        city: true,
        state: true,
        neighborhood: true,
        pressureScore: true,
        createdAt: true,
        _count: { select: { votes: true, comments: true } },
      },
    })
  }
}
