import { Injectable } from '@nestjs/common'
import { Prisma, CompanySector } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ReportStatus } from '@votz/shared-types'

const COMPANY_PUBLIC_SELECT = {
  id: true,
  legalName: true,
  tradeName: true,
  cnpj: true,
  sector: true,
  size: true,
  verified: true,
  plan: true,
  votzScore: true,
  slaHours: true,
  logoUrl: true,
  website: true,
  createdAt: true,
  branches: {
    select: { id: true, name: true, city: true, state: true },
    orderBy: { name: 'asc' as const },
    take: 20,
  },
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
export class CompaniesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.company.findUnique({ where: { id }, select: COMPANY_PUBLIC_SELECT })
  }

  findByCnpj(cnpj: string) {
    return this.prisma.company.findUnique({ where: { cnpj }, select: { id: true } })
  }

  async findAll(params: {
    sector?: CompanySector
    city?: string
    state?: string
    search?: string
    page: number
    limit: number
  }) {
    const where: Prisma.CompanyWhereInput = {
      ...(params.sector && { sector: params.sector }),
      ...(params.search && {
        OR: [
          { legalName: { contains: params.search, mode: 'insensitive' } },
          { tradeName: { contains: params.search, mode: 'insensitive' } },
        ],
      }),
      ...(params.city && {
        branches: { some: { city: { contains: params.city, mode: 'insensitive' } } },
      }),
      ...(params.state && {
        branches: { some: { state: params.state } },
      }),
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        select: COMPANY_PUBLIC_SELECT,
        orderBy: { votzScore: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.company.count({ where }),
    ])

    return {
      data,
      meta: { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) },
    }
  }

  update(id: string, data: Prisma.CompanyUpdateInput) {
    return this.prisma.company.update({ where: { id }, data, select: COMPANY_PUBLIC_SELECT })
  }

  async findReports(companyId: string, page: number, limit: number, status?: string) {
    const where: Prisma.ReportWhereInput = {
      recipientType: 'COMPANY',
      recipientId: companyId,
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

  async stats(companyId: string) {
    const where = { recipientType: 'COMPANY' as const, recipientId: companyId }
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

  hasMemberWithPermission(userId: string, companyId: string, permission: string) {
    return this.prisma.orgMembership.findFirst({
      where: {
        userId,
        orgType: 'COMPANY',
        orgId: companyId,
        status: 'ACTIVE',
        role: { permissions: { has: permission as any } },
      },
      select: { id: true },
    })
  }
}
