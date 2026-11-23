import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

const MAX_REPORTS_LOADED = 300

@Injectable()
export class PressBriefingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSurto(id: string) {
    return this.prisma.surto.findUnique({ where: { id }, select: { id: true, category: true, city: true, state: true } })
  }

  /** Relatos ligados ao surto (sem os arquivados), os de maior pressão primeiro. */
  loadReports(surtoId: string) {
    return this.prisma.report.findMany({
      where: { surtoId, status: { not: 'ARCHIVED' } },
      orderBy: { pressureScore: 'desc' },
      take: MAX_REPORTS_LOADED,
      select: {
        id: true, title: true, description: true, anonymous: true, status: true, neighborhood: true,
        pressureScore: true, createdAt: true, firstResponseAt: true, recipientType: true, recipientId: true,
        city: true, state: true,
      },
    })
  }

  countReports(surtoId: string) {
    return this.prisma.report.count({ where: { surtoId, status: { not: 'ARCHIVED' } } })
  }

  async entityNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map()
    const rows = await this.prisma.entity.findMany({ where: { id: { in: ids } }, select: { id: true, legalName: true } })
    return new Map(rows.map((r) => [r.id, r.legalName]))
  }

  latestBriefing(surtoId: string) {
    return this.prisma.pressSurtoBriefing.findFirst({ where: { surtoId }, orderBy: { generatedAt: 'desc' } })
  }

  saveBriefing(data: {
    surtoId: string
    aiGenerated: boolean
    model: string | null
    content: Prisma.InputJsonValue | null
    stats: Prisma.InputJsonValue
    references: Prisma.InputJsonValue
  }) {
    return this.prisma.pressSurtoBriefing.create({
      data: { ...data, content: data.content ?? Prisma.JsonNull },
    })
  }
}
