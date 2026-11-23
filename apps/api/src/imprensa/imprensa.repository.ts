import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Category, EventType, RecipientType, ReportStatus, normalizeLocationKey } from '@votz/shared-types'

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
      respondedNonArchived,
    ] = await Promise.all([
      this.prisma.report.count(),
      this.prisma.report.count({ where: { createdAt: { gte: since30 } } }),
      this.prisma.report.count({ where: { status: ReportStatus.RESOLVED } }),
      this.prisma.vote.count(),
      this.prisma.surto.count({ where: { active: true } }),
      this.prisma.report.count({ where: { status: { not: ReportStatus.ARCHIVED } } }),
      // Mesma base do denominador (relatos não arquivados): antes o numerador contava também os arquivados.
      this.prisma.report.count({
        where: { status: { not: ReportStatus.ARCHIVED }, timeline: { some: { type: EventType.RESPONDED } } },
      }),
    ])

    return {
      totalReports,
      reportsLast30,
      totalResolved,
      totalVotes,
      activeSurtos,
      responseRate:
        totalNonArchived > 0
          ? ((respondedNonArchived / totalNonArchived) * 100).toFixed(1)
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

    const [byCategory, cityRows] = await Promise.all([
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
      }),
    ])

    // "Sao Paulo" e "São Paulo" são a mesma cidade: junta pelo nome sem acento e sem maiúscula.
    const merged = new Map<string, { city: string; state: string | null; count: number; best: number }>()
    for (const row of cityRows) {
      if (!row.city) continue
      const key = `${(row.state ?? '').toUpperCase()}|${normalizeLocationKey(row.city)}`
      const current = merged.get(key)
      const n = row._count._all
      if (!current) merged.set(key, { city: row.city, state: row.state, count: n, best: n })
      else {
        current.count += n
        // O nome exibido é o da grafia mais usada.
        if (n > current.best) {
          current.best = n
          current.city = row.city
        }
      }
    }
    const topCidades = [...merged.values()].sort((a, b) => b.count - a.count).slice(0, 10)

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
        count: c.count,
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

  private exportWhere(days: number, state?: string, city?: string, category?: string) {
    const cityKey = city ? normalizeLocationKey(city) : ''
    return {
      status: { not: ReportStatus.ARCHIVED },
      createdAt: { gte: daysAgo(days) },
      ...(state && { state: { equals: state.toUpperCase() } }),
      // Cidade sem acento e sem maiúscula (cityKey), com o texto original como segunda chance
      // para relatos antigos sem cityKey.
      ...(city && {
        OR: [
          { cityKey: { contains: cityKey } },
          { city: { contains: city, mode: 'insensitive' as const } },
        ],
      }),
      ...(category && { category: category as Category }),
    }
  }

  /** Relatos públicos (não anônimos) para o CSV e o JSON. `rich` (plano Pro) inclui a descrição. */
  async getReportsForExport(
    days: number,
    state?: string,
    city?: string,
    category?: string,
    take = 1000,
    rich = false,
  ) {
    return this.prisma.report.findMany({
      where: { ...this.exportWhere(days, state, city, category), anonymous: false },
      orderBy: { pressureScore: 'desc' },
      take,
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
        firstResponseAt: true,
        resolvedAt: true,
        slaState: true,
        recipientType: true,
        ...(rich && { description: true }),
        _count: { select: { votes: true, comments: true } },
      },
    })
  }

  /**
   * Linhas mínimas para a série histórica. Só contagem e datas, sem texto, por isso entram também os
   * relatos anônimos (mesma base dos totais públicos de tendências).
   */
  async getReportsForSeries(days: number, state?: string, city?: string, category?: string) {
    return this.prisma.report.findMany({
      where: this.exportWhere(days, state, city, category),
      orderBy: { createdAt: 'asc' },
      take: 20_000,
      select: { createdAt: true, status: true, pressureScore: true, firstResponseAt: true },
    })
  }
}
