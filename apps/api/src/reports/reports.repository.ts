import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CreateReportDto } from './dto/create-report.dto'
import { Category, ReportStatus, VoteType } from '@votz/shared-types'
import { FollowerActorType } from '@prisma/client'

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
    return this.prisma.report.create({
      data: {
        title: dto.title.trim(),
        description: dto.description.trim(),
        category: dto.category,
        anonymous: dto.anonymous ?? false,
        latitude: dto.latitude,
        longitude: dto.longitude,
        normalizedAddress: dto.typedAddress ?? null,
        city: dto.city ?? null,
        state: dto.state ?? null,
        neighborhood: dto.neighborhood ?? null,
        recipientType: dto.recipientType,
        recipientId: dto.recipientId,
        authorId: dto.anonymous ? null : authorId,
        media: dto.media ?? [],
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
    page: number
    limit: number
  }) {
    const where = {
      ...(filters.category && { category: filters.category }),
      ...(filters.status && { status: filters.status }),
      ...(filters.city && { city: { contains: filters.city, mode: 'insensitive' as const } }),
      ...(filters.state && { state: filters.state }),
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
    return this.prisma.report.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
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
    return this.prisma.report.update({
      where: { id },
      data: { status: ReportStatus.DISPUTED },
      select: { id: true, status: true },
    })
  }

  async resolveDispute(id: string, status: ReportStatus.OPEN | ReportStatus.RESOLVED) {
    return this.prisma.report.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    })
  }

  updateRecipient(reportId: string, recipientType: string, recipientId: string) {
    return this.prisma.report.update({
      where: { id: reportId },
      data: { recipientType: recipientType as any, recipientId },
      select: { id: true, recipientType: true, recipientId: true },
    })
  }

  findAuthorIdByReport(reportId: string) {
    return this.prisma.report.findUnique({
      where: { id: reportId },
      select: { authorId: true, status: true, recipientType: true, recipientId: true },
    })
  }

  // ── Recipient resolution (for updateStatus authorization) ───────────────────

  async findEntityByUserId(userId: string) {
    const membership = await this.prisma.orgMembership.findFirst({
      where: { userId, orgType: 'ENTITY', status: 'ACTIVE' },
      select: { orgId: true },
    })
    return membership ? { id: membership.orgId } : null
  }

  async findPoliticianByUserId(userId: string) {
    const membership = await this.prisma.orgMembership.findFirst({
      where: { userId, orgType: 'POLITICIAN', status: 'ACTIVE' },
      select: { orgId: true },
    })
    if (!membership) return null
    const politician = await this.prisma.politician.findUnique({
      where: { id: membership.orgId },
      select: { id: true, status: true },
    })
    return politician ?? null
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

  async findByEmbedding(embedding: number[], limit: number): Promise<SimilarReportRow[]> {
    const vectorLiteral = `[${embedding.map(n => n.toFixed(8)).join(',')}]`
    return this.prisma.$queryRaw<SimilarReportRow[]>(
      Prisma.sql`
        SELECT
          id, title, description, category::text, status::text, city, state,
          created_at AS "createdAt", pressure_score AS "pressureScore",
          1 - (embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}) AS score
        FROM reports
        WHERE
          embedding IS NOT NULL
          AND 1 - (embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}) > 0.6
        ORDER BY embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}
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
