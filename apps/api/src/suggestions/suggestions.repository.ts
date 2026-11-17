import { Injectable } from '@nestjs/common'
import { Prisma, SuggestionCategory, SuggestionStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class SuggestionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(params: {
    status?: SuggestionStatus
    category?: SuggestionCategory
    sort: 'top' | 'recent'
    page: number
    limit: number
    viewerId?: string
  }) {
    const where: Prisma.PlatformSuggestionWhereInput = {}
    if (params.status) where.status = params.status
    if (params.category) where.category = params.category

    const orderBy: Prisma.PlatformSuggestionOrderByWithRelationInput[] =
      params.sort === 'recent'
        ? [{ createdAt: 'desc' }]
        : [{ votesCount: 'desc' }, { createdAt: 'desc' }]

    const skip = (params.page - 1) * params.limit

    const [items, total] = await Promise.all([
      this.prisma.platformSuggestion.findMany({
        where,
        orderBy,
        skip,
        take: params.limit,
        include: {
          author: { select: { id: true, name: true, avatarUrl: true, type: true } },
          votes: params.viewerId
            ? { where: { userId: params.viewerId }, select: { id: true } }
            : false,
        },
      }),
      this.prisma.platformSuggestion.count({ where }),
    ])

    return {
      data: items.map(({ votes, ...rest }) => ({
        ...rest,
        hasVoted: Array.isArray(votes) ? votes.length > 0 : false,
      })),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
      },
    }
  }

  findById(id: string) {
    return this.prisma.platformSuggestion.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true, type: true } },
      },
    })
  }

  create(data: { authorId: string; title: string; description: string; category: SuggestionCategory }) {
    return this.prisma.platformSuggestion.create({
      data,
      include: {
        author: { select: { id: true, name: true, avatarUrl: true, type: true } },
      },
    })
  }

  async toggleVote(suggestionId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.platformSuggestionVote.findUnique({
        where: { suggestionId_userId: { suggestionId, userId } },
      })

      if (existing) {
        await tx.platformSuggestionVote.delete({ where: { id: existing.id } })
        const updated = await tx.platformSuggestion.update({
          where: { id: suggestionId },
          data: { votesCount: { decrement: 1 } },
          select: { id: true, votesCount: true },
        })
        return { ...updated, hasVoted: false }
      }

      await tx.platformSuggestionVote.create({
        data: { suggestionId, userId },
      })
      const updated = await tx.platformSuggestion.update({
        where: { id: suggestionId },
        data: { votesCount: { increment: 1 } },
        select: { id: true, votesCount: true },
      })
      return { ...updated, hasVoted: true }
    })
  }

  updateStatus(
    id: string,
    data: { status: SuggestionStatus; adminNote: string | null; reviewedById: string },
  ) {
    return this.prisma.platformSuggestion.update({
      where: { id },
      data: {
        status: data.status,
        adminNote: data.adminNote,
        reviewedById: data.reviewedById,
        reviewedAt: new Date(),
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true, type: true } },
      },
    })
  }

  delete(id: string) {
    return this.prisma.platformSuggestion.delete({ where: { id } })
  }
}
