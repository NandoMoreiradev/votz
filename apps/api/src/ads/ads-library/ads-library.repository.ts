import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { CREATIVE_WITH_MEDIA } from '../ad-creative-media'

const LIBRARY_INCLUDE = {
  creative: CREATIVE_WITH_MEDIA,
  adSet: {
    select: {
      startAt: true,
      endAt: true,
      status: true,
      states: true,
      cities: true,
      campaign: {
        select: {
          status: true,
          account: {
            select: {
              balanceCents: true,
              company: { select: { id: true, tradeName: true, username: true, logoUrl: true, verified: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.AdInclude

export type LibraryAdRecord = Prisma.AdGetPayload<{ include: typeof LIBRARY_INCLUDE }>

export interface LibraryFilter {
  now: Date
  /** Primeiro dia (data de calendário) que ainda entra na biblioteca. */
  since: Date
  q?: string
  company?: string
  activeOnly: boolean
}

/** Condição de "está rodando agora". Igual à da entrega: campanha ligada, no período, com saldo. */
export function runningNow(now: Date): Prisma.AdWhereInput {
  return {
    status: { notIn: ['PAUSED', 'ARCHIVED', 'DRAFT'] },
    adSet: {
      status: { notIn: ['PAUSED', 'ARCHIVED', 'DRAFT'] },
      startAt: { lte: now },
      OR: [{ endAt: null }, { endAt: { gt: now } }],
      campaign: { status: 'ACTIVE', account: { balanceCents: { gt: 0 } } },
    },
  }
}

/**
 * Só aprovados. Entram os que estão rodando e os que tiveram exibição nos últimos 12 meses. Anúncio com vídeo ainda
 * sendo preparado fica de fora.
 */
export function libraryWhere(filter: LibraryFilter): Prisma.AdWhereInput {
  const visibility: Prisma.AdWhereInput = filter.activeOnly
    ? runningNow(filter.now)
    : { OR: [runningNow(filter.now), { dailyStats: { some: { day: { gte: filter.since }, impressions: { gt: 0 } } } }] }
  const and: Prisma.AdWhereInput[] = [
    { reviewStatus: 'APPROVED' },
    visibility,
    { creative: { OR: [{ media: { is: null } }, { media: { is: { status: 'READY' } } }] } },
  ]
  if (filter.company) {
    and.push({ adSet: { campaign: { account: { company: { OR: [{ id: filter.company }, { username: { equals: filter.company, mode: 'insensitive' } }] } } } } })
  }
  if (filter.q) {
    and.push({
      OR: [
        { creative: { headline: { contains: filter.q, mode: 'insensitive' } } },
        { creative: { body: { contains: filter.q, mode: 'insensitive' } } },
        { adSet: { campaign: { account: { company: { tradeName: { contains: filter.q, mode: 'insensitive' } } } } } },
      ],
    })
  }
  return { AND: and }
}

/** Só tabelas de anúncio e o cadastro público da empresa. Nada de pessoa, relato ou voto. */
@Injectable()
export class AdsLibraryRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: LibraryFilter, skip: number, take: number): Promise<LibraryAdRecord[]> {
    return this.prisma.ad.findMany({
      where: libraryWhere(filter),
      include: LIBRARY_INCLUDE,
      orderBy: [{ adSet: { startAt: 'desc' } }, { id: 'desc' }],
      skip,
      take,
    })
  }

  /** Total de exibições e gasto (milésimos de centavo) dos últimos 12 meses por anúncio. */
  async totals(adIds: string[], since: Date): Promise<Map<string, { impressions: number; spendMillicents: number }>> {
    if (!adIds.length) return new Map()
    const rows = await this.prisma.adDailyStat.groupBy({
      by: ['adId'],
      where: { adId: { in: adIds }, day: { gte: since } },
      _sum: { impressions: true, spendMillicents: true },
    })
    return new Map(rows.map((row) => [row.adId, { impressions: row._sum.impressions ?? 0, spendMillicents: row._sum.spendMillicents ?? 0 }]))
  }
}
