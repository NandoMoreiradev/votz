import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { EntityType, ReportStatus } from '@votz/shared-types'

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
  user: { select: { id: true, name: true, avatarUrl: true } },
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
  _count: { select: { votes: true, comments: true } },
} as const

@Injectable()
export class EntitiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, data: {
    legalName: string
    cnpj: string
    type: EntityType
    city?: string
    state?: string
    website?: string
  }) {
    return this.prisma.entity.create({
      data: { userId, ...data },
      select: ENTITY_PUBLIC_SELECT,
    })
  }

  findByUserId(userId: string) {
    return this.prisma.entity.findUnique({ where: { userId }, select: { id: true } })
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
    page: number
    limit: number
  }) {
    const where: Prisma.EntityWhereInput = {
      ...(params.type && { type: params.type }),
      ...(params.city && { city: { contains: params.city, mode: 'insensitive' } }),
      ...(params.state && { state: params.state }),
      ...(params.search && { legalName: { contains: params.search, mode: 'insensitive' } }),
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

  update(id: string, data: Prisma.EntityUpdateInput) {
    return this.prisma.entity.update({
      where: { id },
      data,
      select: ENTITY_PUBLIC_SELECT,
    })
  }

  async findReports(entityId: string, page: number, limit: number) {
    const where = { recipientType: 'ENTITY' as const, recipientId: entityId }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        select: REPORT_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ])
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
  }

  async stats(entityId: string) {
    const reports = await this.prisma.report.groupBy({
      by: ['status'],
      where: { recipientType: 'ENTITY', recipientId: entityId },
      _count: true,
    })
    const byStatus = reports.reduce(
      (acc, r) => ({ ...acc, [r.status]: r._count }),
      {} as Record<ReportStatus, number>,
    )
    const total = reports.reduce((s, r) => s + r._count, 0)
    const resolved = byStatus[ReportStatus.RESOLVED] ?? 0
    return { total, resolved, byStatus }
  }
}
