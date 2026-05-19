import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Category, ReportStatus, VoteType } from '@votz/shared-types'
import { ListPublicReportsDto } from './dto/list-public-reports.dto'
import { ListPublicSurtosDto } from './dto/list-public-surtos.dto'
import { ListPublicEntitiesDto } from './dto/list-public-entities.dto'

const PUBLIC_REPORT_SELECT = {
  id: true,
  title: true,
  description: true,
  category: true,
  status: true,
  anonymous: true,
  latitude: true,
  longitude: true,
  normalizedAddress: true,
  city: true,
  state: true,
  neighborhood: true,
  pressureScore: true,
  recipientType: true,
  recipientId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { votes: true, comments: true } },
} as const

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000)
}

@Injectable()
export class PublicApiRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Reports ─────────────────────────────────────────────────────────────────

  async findReports(dto: ListPublicReportsDto) {
    const page  = dto.page  ?? 1
    const limit = dto.limit ?? 20

    const where = {
      ...(dto.category && { category: dto.category }),
      status: dto.status ?? { not: ReportStatus.ARCHIVED },
      ...(dto.city  && { city:  { contains: dto.city,  mode: 'insensitive' as const } }),
      ...(dto.state && { state: dto.state.toUpperCase() }),
    }

    const [total, items] = await Promise.all([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        orderBy: [{ pressureScore: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: PUBLIC_REPORT_SELECT,
      }),
    ])

    const withMeToo = await this.mergeMeToo(items)
    return { data: withMeToo, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
  }

  async findReportById(id: string) {
    return this.prisma.report.findUnique({
      where: { id },
      select: {
        ...PUBLIC_REPORT_SELECT,
        timeline: {
          select: {
            id: true, type: true, content: true, createdAt: true,
            author: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
  }

  // ── Surtos ──────────────────────────────────────────────────────────────────

  async findSurtos(dto: ListPublicSurtosDto) {
    return this.prisma.surto.findMany({
      where: {
        ...(dto.active   !== undefined && { active: dto.active }),
        ...(dto.state    && { state: dto.state.toUpperCase() }),
        ...(dto.category && { category: dto.category }),
      },
      orderBy: [{ active: 'desc' }, { count: 'desc' }],
    })
  }

  // ── Tendências ──────────────────────────────────────────────────────────────

  async getTendencias(days: number) {
    const since = daysAgo(days)
    const baseWhere = {
      createdAt: { gte: since },
      status: { not: ReportStatus.ARCHIVED },
    } as const

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
      period: days,
      byCategory: byCategory.map((c) => ({
        category: c.category as Category,
        count: c._count._all,
        pct: total > 0 ? +((c._count._all / total) * 100).toFixed(1) : 0,
      })),
      topCidades: topCidades.map((c) => ({
        city: c.city,
        state: c.state,
        count: c._count._all,
      })),
      generatedAt: new Date().toISOString(),
    }
  }

  // ── Entidades ────────────────────────────────────────────────────────────────

  async findEntities(dto: ListPublicEntitiesDto) {
    const page  = dto.page  ?? 1
    const limit = dto.limit ?? 20

    const where = {
      ...(dto.type  && { type: dto.type }),
      ...(dto.state && { state: dto.state.toUpperCase() }),
      ...(dto.city  && { city: { contains: dto.city, mode: 'insensitive' as const } }),
    }

    const [total, data] = await Promise.all([
      this.prisma.entity.count({ where }),
      this.prisma.entity.findMany({
        where,
        orderBy: { votzScore: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, legalName: true, type: true, verified: true,
          votzScore: true, city: true, state: true, logoUrl: true, website: true,
          createdAt: true,
        },
      }),
    ])

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
  }

  async findEntityById(id: string) {
    const [entity, reportStats] = await Promise.all([
      this.prisma.entity.findUnique({
        where: { id },
        select: {
          id: true, legalName: true, type: true, verified: true,
          votzScore: true, slaHours: true, city: true, state: true,
          logoUrl: true, website: true, createdAt: true,
        },
      }),
      this.prisma.report.groupBy({
        by: ['status'],
        where: { recipientId: id, recipientType: 'ENTITY' },
        _count: { _all: true },
      }),
    ])

    if (!entity) return null

    const statsByStatus = Object.fromEntries(
      reportStats.map((s) => [s.status, s._count._all]),
    )
    const total    = reportStats.reduce((n, s) => n + s._count._all, 0)
    const resolved = statsByStatus[ReportStatus.RESOLVED] ?? 0

    return {
      ...entity,
      stats: {
        total,
        resolved,
        resolutionRate: total > 0 ? +((resolved / total) * 100).toFixed(1) : 0,
        byStatus: statsByStatus,
      },
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async mergeMeToo<T extends { id: string; _count: { votes: number; comments: number } }>(
    items: T[],
  ): Promise<Array<T & { _count: T['_count'] & { meTooVotes: number } }>> {
    if (items.length === 0) return []
    const groups = await this.prisma.vote.groupBy({
      by: ['reportId'],
      where: { reportId: { in: items.map((r) => r.id) }, type: VoteType.ME_TOO },
      _count: { _all: true },
    })
    const map = new Map(groups.map((g) => [g.reportId, g._count._all]))
    return items.map((r) => ({ ...r, _count: { ...r._count, meTooVotes: map.get(r.id) ?? 0 } }))
  }
}
