import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { EntityType, ReportStatus, VoteType } from '@votz/shared-types'

const ENTITY_PUBLIC_SELECT = {
  id: true,
  legalName: true,
  cnpj: true,
  type: true,
  verified: true,
  votzScore: true,
  slaHours: true,
  city: true,
  state: true,
  logoUrl: true,
  website: true,
  createdAt: true,
} as const

const REPORT_SELECT = {
  id: true,
  title: true,
  category: true,
  status: true,
  pressureScore: true,
  city: true,
  state: true,
  createdAt: true,
  _count: { select: { votes: { where: { type: VoteType.SUPPORT } }, comments: true } },
} as const

@Injectable()
export class EntitiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(createdByUserId: string, data: {
    legalName: string
    cnpj: string
    type: EntityType
    city?: string
    state?: string
    website?: string
  }) {
    return this.prisma.entity.create({
      data: { createdByUserId, ...data },
      select: ENTITY_PUBLIC_SELECT,
    })
  }

  findByIdFull(id: string) {
    return this.prisma.entity.findUnique({
      where: { id },
      select: ENTITY_PUBLIC_SELECT,
    })
  }

  async findAll(params: {
    type?: EntityType
    city?: string
    state?: string
    search?: string
    verified?: boolean
    page: number
    limit: number
  }) {
    const where: Prisma.EntityWhereInput = {
      ...(params.type && { type: params.type }),
      ...(params.city && { city: { contains: params.city, mode: 'insensitive' } }),
      ...(params.state && { state: params.state }),
      ...(params.search && { legalName: { contains: params.search, mode: 'insensitive' } }),
      ...(params.verified !== undefined && { verified: params.verified }),
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.entity.findMany({
        where,
        select: ENTITY_PUBLIC_SELECT,
        orderBy: { votzScore: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.entity.count({ where }),
    ])

    return {
      data,
      meta: { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) },
    }
  }

  async findCities(state?: string): Promise<string[]> {
    const rows = await this.prisma.entity.findMany({
      where: { city: { not: null }, ...(state && { state }) },
      select: { city: true },
      distinct: ['city'],
      orderBy: { city: 'asc' },
    })
    return rows.map((r) => r.city).filter(Boolean) as string[]
  }

  update(id: string, data: Prisma.EntityUpdateInput) {
    return this.prisma.entity.update({
      where: { id },
      data,
      select: ENTITY_PUBLIC_SELECT,
    })
  }

  async findReports(entityId: string, page: number, limit: number, status?: string, from?: Date) {
    const where: Prisma.ReportWhereInput = {
      recipientType: 'ENTITY',
      recipientId: entityId,
      ...(status && { status: status as any }),
      ...(from && { createdAt: { gte: from } }),
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        select: REPORT_SELECT,
        orderBy: { pressureScore: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ])
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
  }

  async monthlyVolume(entityId: string): Promise<{ month: string; count: number }[]> {
    const since = new Date()
    since.setMonth(since.getMonth() - 11)
    since.setDate(1)
    since.setHours(0, 0, 0, 0)

    const reports = await this.prisma.report.findMany({
      where: { recipientType: 'ENTITY', recipientId: entityId, createdAt: { gte: since } },
      select: { createdAt: true },
    })

    const months: Record<string, number> = {}
    for (let i = 11; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months[key] = 0
    }
    for (const r of reports) {
      const d = new Date(r.createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (key in months) months[key]++
    }
    return Object.entries(months).map(([month, count]) => ({ month, count }))
  }

  async stats(entityId: string) {
    const where = { recipientType: 'ENTITY' as const, recipientId: entityId }
    const [byStatusRaw, byCategoryRaw] = await Promise.all([
      this.prisma.report.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.report.groupBy({ by: ['category'], where, _count: true }),
    ])
    const byStatus = byStatusRaw.reduce(
      (acc, r) => ({ ...acc, [r.status]: r._count }),
      {} as Record<ReportStatus, number>,
    )
    const byCategory = byCategoryRaw
      .sort((a, b) => b._count - a._count)
      .map((r) => ({ category: r.category, count: r._count }))
    const total = byStatusRaw.reduce((s, r) => s + r._count, 0)
    const resolved = byStatus[ReportStatus.RESOLVED] ?? 0
    return { total, resolved, byStatus, byCategory }
  }
}
