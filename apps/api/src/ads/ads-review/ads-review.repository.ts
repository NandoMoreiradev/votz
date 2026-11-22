import { Injectable } from '@nestjs/common'
import { AdReviewSource, AdReviewStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { CREATIVE_WITH_MEDIA } from '../ad-creative-media'

const QUEUE_INCLUDE = {
  creative: CREATIVE_WITH_MEDIA,
  adSet: { include: { campaign: { include: { account: { include: { company: { select: { id: true, tradeName: true, verified: true } } } } } } } },
  reviews: { orderBy: { createdAt: 'desc' as const }, take: 5, include: { reviewer: { select: { name: true } } } },
  aiAnalyses: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  landingChecks: { orderBy: { checkedAt: 'desc' as const }, take: 1 },
} satisfies Prisma.AdInclude

export type QueueAd = Prisma.AdGetPayload<{ include: typeof QUEUE_INCLUDE }>

/** Só tabelas de anúncio (e o nome de quem revisou). Nada de relatos, votos ou atividade política. */
@Injectable()
export class AdsReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listQueue(status: AdReviewStatus, page: number, limit: number) {
    const where: Prisma.AdWhereInput = { reviewStatus: status }
    // Pendentes: o que chegou primeiro sai primeiro (prazo de 24 h). Decididos: os mais recentes primeiro.
    const orderBy: Prisma.AdOrderByWithRelationInput = status === 'PENDING' ? { submittedAt: 'asc' } : { reviewedAt: 'desc' }
    const [total, pendingCount, data] = await this.prisma.$transaction([
      this.prisma.ad.count({ where }),
      this.prisma.ad.count({ where: { reviewStatus: 'PENDING' } }),
      this.prisma.ad.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, include: QUEUE_INCLUDE }),
    ])
    return { total, pendingCount, data }
  }

  findForReview(adId: string) {
    return this.prisma.ad.findUnique({
      where: { id: adId },
      include: { creative: CREATIVE_WITH_MEDIA, adSet: { select: { campaign: { select: { name: true, objective: true, account: { select: { companyId: true } } } } } } },
    })
  }

  saveAnalysis(data: {
    adId: string
    category: string | null
    restricted: string | null
    violations: Prisma.InputJsonValue
    sensitive: boolean
    confidence: number
    explanation: string
    model: string
    autoApproved: boolean
  }) {
    return this.prisma.adAiAnalysis.create({ data })
  }

  /** Quem na empresa gerencia anúncios (dono e papéis com MANAGE_ADS) e recebe o aviso da decisão. */
  async findAdvertiserUserIds(companyId: string): Promise<string[]> {
    const members = await this.prisma.orgMembership.findMany({
      where: { orgType: 'COMPANY', orgId: companyId, status: 'ACTIVE', role: { permissions: { has: 'MANAGE_ADS' } } },
      select: { userId: true },
    })
    return members.map((m) => m.userId)
  }

  /**
   * Grava a decisão e o histórico juntos. O `updateMany` só vale se o anúncio ainda está PENDING, então duas pessoas
   * decidindo ao mesmo tempo não se atropelam: quem chegar depois recebe `false`.
   */
  decide(params: {
    adId: string
    decision: 'APPROVED' | 'REJECTED'
    reason: string | null
    /** Null quando quem decide é a IA. */
    reviewerId: string | null
    source?: AdReviewSource
    creativeSnapshot: Prisma.InputJsonValue
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ad.updateMany({
        where: { id: params.adId, reviewStatus: 'PENDING' },
        data: { reviewStatus: params.decision, reviewNote: params.decision === 'REJECTED' ? params.reason : null, reviewedAt: new Date() },
      })
      if (updated.count === 0) return false
      await tx.adReview.create({
        data: {
          adId: params.adId,
          decision: params.decision,
          source: params.source ?? 'HUMAN',
          reviewerId: params.reviewerId,
          reason: params.reason,
          creativeSnapshot: params.creativeSnapshot,
        },
      })
      return true
    })
  }
}
