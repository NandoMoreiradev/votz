import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

const POLITICIAN_PUBLIC_SELECT = {
  id: true,
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
export class PoliticiansRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, data: {
    partyId: string
    office: string
    termStart: Date
    termEnd: Date
    electoralZone: string
    state: string
    city?: string
  }) {
    return this.prisma.politician.create({
      data: { userId, ...data },
      select: POLITICIAN_PUBLIC_SELECT,
    })
  }

  findByUserId(userId: string) {
    return this.prisma.politician.findUnique({ where: { userId }, select: { id: true } })
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
    page: number
    limit: number
  }) {
    const where: Prisma.PoliticianWhereInput = {
      ...(params.state && { state: params.state }),
      ...(params.city && { city: { contains: params.city, mode: 'insensitive' } }),
      ...(params.party && { party: { abbreviation: { contains: params.party, mode: 'insensitive' } } }),
      ...(params.office && { office: { contains: params.office, mode: 'insensitive' } }),
      ...(params.search && {
        user: { name: { contains: params.search, mode: 'insensitive' } },
      }),
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

  update(id: string, data: Prisma.PoliticianUpdateInput) {
    return this.prisma.politician.update({
      where: { id },
      data,
      select: POLITICIAN_PUBLIC_SELECT,
    })
  }

  async findReports(politicianId: string, page: number, limit: number) {
    const where = { recipientType: 'POLITICIAN' as const, recipientId: politicianId }
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

  async mandatometerStats(politicianId: string) {
    const reports = await this.prisma.report.findMany({
      where: { recipientType: 'POLITICIAN', recipientId: politicianId },
      select: { status: true },
    })

    const total = reports.length
    const resolved = reports.filter((r) => r.status === 'RESOLVED').length
    const inProgress = reports.filter((r) => r.status === 'IN_PROGRESS').length
    const open = reports.filter((r) => r.status === 'OPEN').length

    return { total, resolved, inProgress, open, ignored: open }
  }

  updateMandatometer(id: string, mandatometer: object) {
    return this.prisma.politician.update({
      where: { id },
      data: { mandatometer: mandatometer as Prisma.InputJsonValue },
    })
  }
}
