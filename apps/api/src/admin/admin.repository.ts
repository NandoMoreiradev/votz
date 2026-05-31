import { Injectable } from '@nestjs/common'
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

  async setBan(id: string, banned: boolean) {
    return this.prisma.user.update({ where: { id }, data: { banned }, select: { id: true, banned: true } })
  }

  async setUserType(id: string, type: string) {
    return this.prisma.user.update({ where: { id }, data: { type: type as any }, select: { id: true, type: true } })
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

  async deleteReport(id: string) {
    return this.prisma.report.delete({ where: { id } })
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
