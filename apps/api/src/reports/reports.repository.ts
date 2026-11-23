import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CreateReportDto } from './dto/create-report.dto'
import {
  Category,
  ReportStatus,
  RecipientType,
  VoteType,
  computeSla,
  encodeGeohash7,
  normalizeLocationKey,
} from '@votz/shared-types'
import { FollowerActorType, SlaState } from '@prisma/client'

export interface SimilarReportRow {
  id: string
  title: string
  description: string
  category: string
  status: string
  city: string | null
  state: string | null
  createdAt: Date
  pressureScore: number
  score: number
}

const ACTOR_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
} as const

const ADVOCACY_SELECT = {
  where: { type: 'RESPONDED' as const },
  select: {
    author: { select: ACTOR_SELECT },
    createdAt: true,
  },
  take: 1,
  orderBy: { createdAt: 'asc' as const },
} as const

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
  media: true,
  pressureScore: true,
  recipientType: true,
  recipientId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { votes: { where: { type: VoteType.SUPPORT } }, comments: true } },
  author: { select: { id: true, name: true, avatarUrl: true } },
} as const

type WithMeToo<T extends { id: string; _count: { votes: number; comments: number } }> =
  T & { _count: T['_count'] & { meTooVotes: number } }

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async mergeMeToo<T extends { id: string; _count: { votes: number; comments: number } }>(
    items: T[],
  ): Promise<WithMeToo<T>[]> {
    if (items.length === 0) return []
    const groups = await this.prisma.vote.groupBy({
      by: ['reportId'],
      where: { reportId: { in: items.map(r => r.id) }, type: VoteType.ME_TOO },
      _count: { _all: true },
    })
    const map = new Map(groups.map(g => [g.reportId, g._count._all]))
    return items.map(r => ({ ...r, _count: { ...r._count, meTooVotes: map.get(r.id) ?? 0 } }))
  }

  async create(dto: CreateReportDto, authorId: string | null) {
    const city = dto.city ?? null
    const neighborhood = dto.neighborhood ?? null
    const now = new Date()

    let slaFields: {
      slaStartedAt?: Date
      slaDueAt?: Date
      slaState?: SlaState
      resolutionSlaDueAt?: Date | null
      resolutionSlaState?: SlaState | null
    } = {}

    if (dto.recipientType === RecipientType.ENTITY && dto.recipientId) {
      const entity = await this.prisma.entity.findUnique({
        where: { id: dto.recipientId },
        select: { slaHours: true, resolutionSlaHours: true, slaEscalationHours: true },
      })
      const sla = computeSla(
        {
          category: dto.category,
          status: ReportStatus.OPEN,
          createdAt: now,
          slaStartedAt: now,
        },
        {
          slaHours: (entity?.slaHours as Record<string, number> | null) ?? null,
          resolutionSlaHours: (entity?.resolutionSlaHours as Record<string, number> | null) ?? null,
          escalationHours: entity?.slaEscalationHours ?? 24,
        },
        now,
      )
      slaFields = {
        slaStartedAt: sla.slaStartedAt,
        slaDueAt: sla.slaDueAt,
        slaState: (sla.slaState as SlaState | null) ?? SlaState.ON_TIME,
        resolutionSlaDueAt: sla.resolution?.dueAt ?? null,
        resolutionSlaState: (sla.resolution?.state as SlaState | null) ?? null,
      }
    }

    return this.prisma.report.create({
      data: {
        title: dto.title.trim(),
        description: dto.description.trim(),
        category: dto.category,
        anonymous: dto.anonymous ?? false,
        // Pedido de contato da imprensa só faz sentido em relato público: anônimo nem guarda quem escreveu.
        pressContactOk: dto.anonymous ? false : (dto.pressContactOk ?? false),
        latitude: dto.latitude,
        longitude: dto.longitude,
        cell7: encodeGeohash7(dto.latitude, dto.longitude),
        normalizedAddress: dto.typedAddress ?? null,
        city,
        cityKey: city ? normalizeLocationKey(city) || null : null,
        state: dto.state ?? null,
        neighborhood,
        neighborhoodKey: neighborhood ? normalizeLocationKey(neighborhood) || null : null,
        recipientType: dto.recipientType,
        recipientId: dto.recipientId,
        authorId: dto.anonymous ? null : authorId,
        media: dto.media ?? [],
        ...slaFields,
      },
      select: PUBLIC_REPORT_SELECT,
    })
  }

  async findById(id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      select: {
        ...PUBLIC_REPORT_SELECT,
        timeline: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            type: true,
            content: true,
            metadata: true,
            createdAt: true,
            author: { select: ACTOR_SELECT },
          },
        },
      },
    })
    if (!report) return null
    const [enriched] = await this.mergeMeToo([report])
    return enriched
  }

  async findAll(filters: {
    category?: Category
    status?: ReportStatus
    city?: string
    state?: string
    search?: string
    page: number
    limit: number
  }) {
    const search = filters.search?.trim()
    const where = {
      ...(filters.category && { category: filters.category }),
      ...(filters.status && { status: filters.status }),
      ...(filters.city && { city: { contains: filters.city, mode: 'insensitive' as const } }),
      ...(filters.state && { state: filters.state }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    }

    const [raw, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        select: {
          ...PUBLIC_REPORT_SELECT,
          timeline: ADVOCACY_SELECT,
        },
        orderBy: [{ pressureScore: 'desc' }, { createdAt: 'desc' }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.report.count({ where }),
    ])

    const reports = await this.mergeMeToo(raw)
    return { reports, total }
  }

  async updateStatus(id: string, status: ReportStatus) {
    const now = new Date()
    if (status === ReportStatus.RESOLVED) {
      await this.prisma.report.updateMany({
        where: { id, resolvedAt: null },
        data: { resolvedAt: now },
      })
    }
    const updated = await this.prisma.report.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    })
    await this.syncSlaState(id, now)
    return updated
  }

  async markFirstResponseIfUnset(id: string) {
    const now = new Date()
    const res = await this.prisma.report.updateMany({
      where: { id, firstResponseAt: null },
      data: { firstResponseAt: now },
    })
    await this.syncSlaState(id, now)
    return res
  }

  async syncSlaState(id: string, now = new Date()) {
    const row = await this.prisma.report.findUnique({
      where: { id },
      select: {
        category: true,
        status: true,
        recipientType: true,
        recipientId: true,
        createdAt: true,
        firstResponseAt: true,
        resolvedAt: true,
        slaStartedAt: true,
        slaDueAt: true,
        slaState: true,
        resolutionSlaDueAt: true,
      },
    })
    if (!row || row.recipientType !== RecipientType.ENTITY || !row.recipientId) return

    const entity = await this.prisma.entity.findUnique({
      where: { id: row.recipientId },
      select: { slaHours: true, resolutionSlaHours: true, slaEscalationHours: true },
    })

    const policy = {
      slaHours: row.slaDueAt && row.slaStartedAt
        ? {
            [row.category]: Math.max(
              1,
              Math.round((row.slaDueAt.getTime() - row.slaStartedAt.getTime()) / 3_600_000),
            ),
          }
        : ((entity?.slaHours as Record<string, number> | null) ?? null),
      resolutionSlaHours: row.resolutionSlaDueAt && row.slaStartedAt
        ? {
            [row.category]: Math.max(
              1,
              Math.round((row.resolutionSlaDueAt.getTime() - row.slaStartedAt.getTime()) / 3_600_000),
            ),
          }
        : ((entity?.resolutionSlaHours as Record<string, number> | null) ?? null),
      escalationHours: entity?.slaEscalationHours ?? 24,
    }

    const computed = computeSla(
      {
        category: row.category as Category,
        status: row.status as ReportStatus,
        createdAt: row.createdAt,
        firstResponseAt: row.firstResponseAt,
        resolvedAt: row.resolvedAt,
        slaStartedAt: row.slaStartedAt ?? row.createdAt,
        slaState: (row.slaState as any) ?? null,
      },
      policy,
      now,
    )

    await this.prisma.report.update({
      where: { id },
      data: {
        slaStartedAt: computed.slaStartedAt,
        slaDueAt: computed.slaDueAt,
        slaState: (computed.slaState as SlaState | null) ?? null,
        slaMetAt: computed.slaMetAt,
        resolutionSlaDueAt: computed.resolution?.dueAt ?? null,
        resolutionSlaState: (computed.resolution?.state as SlaState | null) ?? null,
        resolutionSlaMetAt: computed.resolution?.metAt ?? null,
      },
    })
  }

  async findAuthorId(id: string): Promise<string | null> {
    const report = await this.prisma.report.findUnique({
      where: { id },
      select: { authorId: true },
    })
    return report?.authorId ?? null
  }

  async setDisputed(id: string) {
    const updated = await this.prisma.report.update({
      where: { id },
      data: { status: ReportStatus.DISPUTED },
      select: { id: true, status: true },
    })
    await this.syncSlaState(id)
    return updated
  }

  async resolveDispute(id: string, status: ReportStatus.OPEN | ReportStatus.RESOLVED) {
    const now = new Date()
    if (status === ReportStatus.RESOLVED) {
      await this.prisma.report.updateMany({
        where: { id, resolvedAt: null },
        data: { resolvedAt: now },
      })
    }
    const updated = await this.prisma.report.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    })
    await this.syncSlaState(id, now)
    return updated
  }

  async updateRecipient(reportId: string, recipientType: string, recipientId: string) {
    const now = new Date()
    let extraSla: Record<string, unknown> = {
      slaStartedAt: null,
      slaDueAt: null,
      slaState: null,
      slaMetAt: null,
      resolutionSlaDueAt: null,
      resolutionSlaState: null,
      resolutionSlaMetAt: null,
    }

    if (recipientType === RecipientType.ENTITY) {
      const existing = await this.prisma.report.findUnique({
        where: { id: reportId },
        select: { category: true, status: true, firstResponseAt: true, resolvedAt: true },
      })
      const entity = await this.prisma.entity.findUnique({
        where: { id: recipientId },
        select: { slaHours: true, resolutionSlaHours: true, slaEscalationHours: true },
      })
      if (existing) {
        const computed = computeSla(
          {
            category: existing.category as Category,
            status: existing.status as ReportStatus,
            createdAt: now,
            firstResponseAt: existing.firstResponseAt,
            resolvedAt: existing.resolvedAt,
            slaStartedAt: now,
          },
          {
            slaHours: (entity?.slaHours as Record<string, number> | null) ?? null,
            resolutionSlaHours: (entity?.resolutionSlaHours as Record<string, number> | null) ?? null,
            escalationHours: entity?.slaEscalationHours ?? 24,
          },
          now,
        )
        extraSla = {
          slaStartedAt: computed.slaStartedAt,
          slaDueAt: computed.slaDueAt,
          slaState: (computed.slaState as SlaState | null) ?? null,
          slaMetAt: computed.slaMetAt,
          resolutionSlaDueAt: computed.resolution?.dueAt ?? null,
          resolutionSlaState: (computed.resolution?.state as SlaState | null) ?? null,
          resolutionSlaMetAt: computed.resolution?.metAt ?? null,
        }
      }
    }

    return this.prisma.report.update({
      where: { id: reportId },
      data: { recipientType: recipientType as any, recipientId, ...extraSla },
      select: { id: true, recipientType: true, recipientId: true },
    })
  }

  findAuthorIdByReport(reportId: string) {
    return this.prisma.report.findUnique({
      where: { id: reportId },
      select: { authorId: true, status: true, recipientType: true, recipientId: true },
    })
  }

  // ── Followers ────────────────────────────────────────────────────────────────

  async addFollower(reportId: string, actorType: FollowerActorType, actorId: string) {
    return this.prisma.reportFollower.upsert({
      where: { reportId_actorType_actorId: { reportId, actorType, actorId } },
      create: { reportId, actorType, actorId },
      update: {},
    })
  }

  async removeFollower(reportId: string, actorType: FollowerActorType, actorId: string) {
    await this.prisma.reportFollower.deleteMany({
      where: { reportId, actorType, actorId },
    })
  }

  async findFollower(reportId: string, actorType: FollowerActorType, actorId: string) {
    return this.prisma.reportFollower.findUnique({
      where: { reportId_actorType_actorId: { reportId, actorType, actorId } },
    })
  }

  async getFollowers(reportId: string) {
    const followers = await this.prisma.reportFollower.findMany({
      where: { reportId },
      orderBy: { createdAt: 'asc' },
    })

    const politicianIds = followers
      .filter(f => f.actorType === FollowerActorType.POLITICIAN)
      .map(f => f.actorId)
    const entityIds = followers
      .filter(f => f.actorType === FollowerActorType.ENTITY)
      .map(f => f.actorId)

    const [politicians, entities] = await Promise.all([
      politicianIds.length
        ? this.prisma.politician.findMany({
            where: { id: { in: politicianIds } },
            select: { id: true, name: true, office: true, state: true },
          })
        : [],
      entityIds.length
        ? this.prisma.entity.findMany({
            where: { id: { in: entityIds } },
            select: { id: true, legalName: true, type: true },
          })
        : [],
    ])

    return {
      count: followers.length,
      politicians,
      entities,
    }
  }

  // ── Similarity search ────────────────────────────────────────────────────────

  async findByTrigram(title: string, description: string, limit: number): Promise<SimilarReportRow[]> {
    return this.prisma.$queryRaw<SimilarReportRow[]>`
      SELECT
        id, title, description, category::text, status::text, city, state,
        "createdAt", "pressureScore",
        GREATEST(
          similarity(title, ${title}),
          similarity(description, ${description})
        ) AS score
      FROM reports
      WHERE
        similarity(title, ${title}) > 0.2
        OR similarity(description, ${description}) > 0.15
      ORDER BY score DESC
      LIMIT ${limit}
    `
  }

  async findByFullText(query: string, limit: number): Promise<SimilarReportRow[]> {
    // Converte AND (plainto_tsquery default) para OR para aceitar matches parciais
    return this.prisma.$queryRaw<SimilarReportRow[]>`
      SELECT
        id, title, description, category::text, status::text, city, state,
        "createdAt", "pressureScore",
        ts_rank(search_vector,
          to_tsquery('portuguese', regexp_replace(
            plainto_tsquery('portuguese', ${query})::text, ' & ', ' | ', 'g'
          ))
        ) AS score
      FROM reports
      WHERE search_vector @@ to_tsquery('portuguese', regexp_replace(
          plainto_tsquery('portuguese', ${query})::text, ' & ', ' | ', 'g'
        ))
      ORDER BY score DESC
      LIMIT ${limit}
    `
  }

  /**
   * `minScore` é a similaridade mínima (0 a 1). Com o modelo atual (`gemini-embedding-001`, 768 dimensões),
   * texto sem relação fica perto de 0,60 e o parecido de verdade passa de 0,75; o antigo corte de 0,60 deixaria tudo passar.
   */
  async findByEmbedding(embedding: number[], limit: number, minScore = 0.72): Promise<SimilarReportRow[]> {
    const vectorLiteral = `[${embedding.map(n => n.toFixed(8)).join(',')}]`
    return this.prisma.$queryRaw<SimilarReportRow[]>(
      Prisma.sql`
        SELECT
          id, title, description, category::text, status::text, city, state,
          "createdAt", "pressureScore",
          1 - (embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}) AS score
        FROM reports
        WHERE
          embedding IS NOT NULL
          AND 1 - (embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}) > ${minScore}
        ORDER BY embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}
        LIMIT ${limit}
      `
    )
  }

  /** Relatos ainda sem embedding (o job só roda para relato novo; o modelo antigo falhava), os mais novos primeiro. */
  async findWithoutEmbedding(limit: number): Promise<Array<{ id: string; title: string; description: string }>> {
    return this.prisma.$queryRaw<Array<{ id: string; title: string; description: string }>>(
      Prisma.sql`
        SELECT id, title, description
        FROM reports
        WHERE embedding IS NULL AND status <> 'ARCHIVED'
        ORDER BY "createdAt" DESC
        LIMIT ${limit}
      `
    )
  }

  async updateEmbedding(reportId: string, embedding: number[]): Promise<void> {
    const vectorLiteral = `[${embedding.map(n => n.toFixed(8)).join(',')}]`
    await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE reports
        SET embedding = ${Prisma.raw(`'${vectorLiteral}'::vector`)}
        WHERE id = ${reportId}
      `
    )
  }

  async getFollowerUserIds(reportId: string): Promise<string[]> {
    const followers = await this.prisma.reportFollower.findMany({
      where: { reportId },
    })

    const politicianIds = followers.filter(f => f.actorType === FollowerActorType.POLITICIAN).map(f => f.actorId)
    const entityIds     = followers.filter(f => f.actorType === FollowerActorType.ENTITY).map(f => f.actorId)

    const [politicianMembers, entityMembers] = await Promise.all([
      politicianIds.length
        ? this.prisma.orgMembership.findMany({ where: { orgType: 'POLITICIAN', orgId: { in: politicianIds }, status: 'ACTIVE' }, select: { userId: true } })
        : [],
      entityIds.length
        ? this.prisma.orgMembership.findMany({ where: { orgType: 'ENTITY', orgId: { in: entityIds }, status: 'ACTIVE' }, select: { userId: true } })
        : [],
    ])

    return [...politicianMembers.map(m => m.userId), ...entityMembers.map(m => m.userId)]
  }
}
