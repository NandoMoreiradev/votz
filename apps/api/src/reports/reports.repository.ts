import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateReportDto } from './dto/create-report.dto'
import { Category, ReportStatus, VoteType } from '@votz/shared-types'
import { FollowerActorType } from '@prisma/client'

const ADVOCACY_SELECT = {
  where: { type: 'RESPONDED' as const },
  select: {
    author: { select: { id: true, name: true } },
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
            author: { select: { id: true, name: true } },
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

  // ── Recipient resolution (for updateStatus authorization) ───────────────────

  async findEntityByUserId(userId: string) {
    return this.prisma.entity.findUnique({ where: { userId }, select: { id: true } })
  }

  async findPoliticianByUserId(userId: string) {
    return this.prisma.politician.findUnique({ where: { userId }, select: { id: true } })
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
            select: { id: true, office: true, state: true, user: { select: { id: true, name: true } } },
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

  async getFollowerUserIds(reportId: string): Promise<string[]> {
    const followers = await this.prisma.reportFollower.findMany({
      where: { reportId },
    })

    const politicianIds = followers.filter(f => f.actorType === FollowerActorType.POLITICIAN).map(f => f.actorId)
    const entityIds     = followers.filter(f => f.actorType === FollowerActorType.ENTITY).map(f => f.actorId)

    const [politicians, entities] = await Promise.all([
      politicianIds.length
        ? this.prisma.politician.findMany({ where: { id: { in: politicianIds } }, select: { userId: true } })
        : [],
      entityIds.length
        ? this.prisma.entity.findMany({ where: { id: { in: entityIds } }, select: { userId: true } })
        : [],
    ])

    return [...politicians.map(p => p.userId), ...entities.map(e => e.userId)]
  }
}
