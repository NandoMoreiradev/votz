import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { VoteType } from '@votz/shared-types'

const POLITICIAN_PUBLIC_SELECT = {
  id: true,
  name: true,
  office: true,
  termStart: true,
  termEnd: true,
  electoralZone: true,
  state: true,
  city: true,
  verified: true,
  mandatometer: true,
  createdAt: true,
  party: { select: { id: true, name: true, abbreviation: true, number: true, logoUrl: true } },
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
export class PoliticiansRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(createdByUserId: string, data: {
    name: string
    partyId: string
    office: string
    termStart: Date
    termEnd: Date
    electoralZone: string
    state: string
    city?: string
  }) {
    return this.prisma.politician.create({
      data: { createdByUserId, ...data },
      select: POLITICIAN_PUBLIC_SELECT,
    })
  }

  findById(id: string) {
    return this.prisma.politician.findUnique({
      where: { id },
      select: POLITICIAN_PUBLIC_SELECT,
    })
  }

  async findAll(params: {
    state?: string
    city?: string
    party?: string
    office?: string
    search?: string
    verified?: boolean
    page: number
    limit: number
  }) {
    const where: Prisma.PoliticianWhereInput = {
      ...(params.state && { state: params.state }),
      ...(params.city && { city: { contains: params.city, mode: 'insensitive' } }),
      ...(params.party && { party: { abbreviation: { contains: params.party, mode: 'insensitive' } } }),
      ...(params.office && { office: { contains: params.office, mode: 'insensitive' } }),
      ...(params.search && { name: { contains: params.search, mode: 'insensitive' } }),
      ...(params.verified !== undefined && { verified: params.verified }),
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.politician.findMany({
        where,
        select: POLITICIAN_PUBLIC_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.politician.count({ where }),
    ])

    return {
      data,
      meta: { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) },
    }
  }

  async findCities(state?: string): Promise<string[]> {
    const rows = await this.prisma.politician.findMany({
      where: { city: { not: null }, ...(state && { state }) },
      select: { city: true },
      distinct: ['city'],
      orderBy: { city: 'asc' },
    })
    return rows.map((r) => r.city).filter(Boolean) as string[]
  }

  update(id: string, data: Prisma.PoliticianUpdateInput) {
    return this.prisma.politician.update({
      where: { id },
      data,
      select: POLITICIAN_PUBLIC_SELECT,
    })
  }

  async findReports(politicianId: string, page: number, limit: number, status?: string) {
    const where: Prisma.ReportWhereInput = {
      recipientType: 'POLITICIAN',
      recipientId: politicianId,
      ...(status && { status: status as any }),
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

  async mandatometerStats(politicianId: string) {
    const where = { recipientType: 'POLITICIAN' as const, recipientId: politicianId }
    const [byStatusRaw, byCategoryRaw] = await Promise.all([
      this.prisma.report.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.report.groupBy({ by: ['category'], where, _count: true }),
    ])

    const byStatus = byStatusRaw.reduce((acc, r) => ({ ...acc, [r.status]: r._count }), {} as Record<string, number>)
    const byCategory = byCategoryRaw
      .sort((a, b) => b._count - a._count)
      .map((r) => ({ category: r.category, count: r._count }))
    const total = byStatusRaw.reduce((s, r) => s + r._count, 0)
    const resolved = byStatus['RESOLVED'] ?? 0
    const inProgress = byStatus['IN_PROGRESS'] ?? 0
    const open = byStatus['OPEN'] ?? 0

    return { total, resolved, inProgress, open, ignored: open, byStatus, byCategory }
  }

  updateMandatometer(id: string, mandatometer: object) {
    return this.prisma.politician.update({
      where: { id },
      data: { mandatometer: mandatometer as Prisma.InputJsonValue },
    })
  }
}
