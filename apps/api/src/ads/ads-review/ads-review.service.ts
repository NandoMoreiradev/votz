import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { NotificationsService } from '../../notifications/notifications.service'
import * as DOMPurify from 'isomorphic-dompurify'
import { AD_REVIEW_LIMITS, type AdInterestId, type AdReviewQueueItem, type AdReviewQueueResponse, type AgeBand } from '@votz/shared-types'
import { AdsReviewRepository, type QueueAd } from './ads-review.repository'
import type { AdReviewDecisionDto } from './dto/ads-review.dto'

type Status = 'PENDING' | 'APPROVED' | 'REJECTED'

/** Fila humana de revisão de anúncios (a IA entra depois, antes desta fila). Cada decisão fica gravada em `ad_reviews`. */
@Injectable()
export class AdsReviewService {
  private readonly logger = new Logger(AdsReviewService.name)

  constructor(
    private readonly repo: AdsReviewRepository,
    private readonly notifications: NotificationsService,
  ) {}

  async listQueue(status: Status = 'PENDING', page = 1, limit = 20): Promise<AdReviewQueueResponse> {
    const take = Math.min(limit, 50)
    const { total, pendingCount, data } = await this.repo.listQueue(status, page, take)
    return {
      data: data.map(toQueueItem),
      meta: { total, pendingCount, page, limit: take, totalPages: Math.max(1, Math.ceil(total / take)) },
    }
  }

  async decide(adId: string, reviewer: { id: string }, dto: AdReviewDecisionDto): Promise<{ adId: string; decision: 'APPROVED' | 'REJECTED' }> {
    const ad = await this.repo.findForReview(adId)
    if (!ad) throw new NotFoundException('Anúncio não encontrado.')
    if (ad.reviewStatus !== 'PENDING') throw new ConflictException('Este anúncio não está mais na fila: já foi decidido ou voltou para o anunciante.')

    const reason = dto.reason ? DOMPurify.sanitize(dto.reason, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).replace(/\s+/g, ' ').trim() : ''
    if (dto.decision === 'REJECTED' && reason.length < AD_REVIEW_LIMITS.REASON_MIN) {
      throw new BadRequestException(`Para recusar, explique o motivo em pelo menos ${AD_REVIEW_LIMITS.REASON_MIN} letras. O anunciante vai ler.`)
    }

    const ok = await this.repo.decide({
      adId,
      decision: dto.decision,
      reason: reason || null,
      reviewerId: reviewer.id,
      creativeSnapshot: {
        headline: ad.creative.headline,
        body: ad.creative.body,
        ctaLabel: ad.creative.ctaLabel,
        destinationUrl: ad.creative.destinationUrl,
      },
    })
    if (!ok) throw new ConflictException('Outra pessoa da moderação decidiu este anúncio agora há pouco.')
    await this.notifyAdvertiser(ad.adSet.campaign.account.companyId, {
      adId,
      campaignName: ad.adSet.campaign.name,
      decision: dto.decision,
      reason: dto.decision === 'REJECTED' ? reason : null,
    })
    return { adId, decision: dto.decision }
  }

  /** Para a revisão por IA: o anúncio com o criativo e a campanha, ou null se não existe. */
  getForAnalysis(adId: string) {
    return this.repo.findForReview(adId)
  }

  saveAnalysis(data: Parameters<AdsReviewRepository['saveAnalysis']>[0]) {
    return this.repo.saveAnalysis(data)
  }

  /**
   * Aprovação feita pela IA (só chamada quando ADS_AI_AUTO_APPROVE está ligado e a política de segurança passou).
   * Usa a mesma atualização condicional da decisão humana: se uma pessoa decidiu antes, a IA não sobrescreve.
   */
  async approveByAi(adId: string, note: string): Promise<boolean> {
    const ad = await this.repo.findForReview(adId)
    if (!ad || ad.reviewStatus !== 'PENDING') return false
    const ok = await this.repo.decide({
      adId,
      decision: 'APPROVED',
      reason: note,
      reviewerId: null,
      source: 'AI',
      creativeSnapshot: {
        headline: ad.creative.headline,
        body: ad.creative.body,
        ctaLabel: ad.creative.ctaLabel,
        destinationUrl: ad.creative.destinationUrl,
      },
    })
    if (ok) await this.notifyAdvertiser(ad.adSet.campaign.account.companyId, { adId, campaignName: ad.adSet.campaign.name, decision: 'APPROVED', reason: null })
    return ok
  }

  /** O aviso é secundário: se falhar, a decisão (já gravada) continua valendo e o anunciante vê o resultado no Estúdio. */
  private async notifyAdvertiser(
    companyId: string,
    info: { adId: string; campaignName: string; decision: 'APPROVED' | 'REJECTED'; reason: string | null },
  ) {
    try {
      const userIds = await this.repo.findAdvertiserUserIds(companyId)
      await Promise.all(
        userIds.map((userId) =>
          this.notifications.notify({
            userId,
            type: info.decision === 'APPROVED' ? 'AD_APPROVED' : 'AD_REJECTED',
            metadata: { adId: info.adId, campaignName: info.campaignName, reason: info.reason },
          }),
        ),
      )
    } catch (err) {
      this.logger.warn(`Não foi possível avisar o anunciante do anúncio ${info.adId}: ${(err as Error).message}`)
    }
  }
}

function toQueueItem(ad: QueueAd): AdReviewQueueItem {
  const { adSet } = ad
  const { campaign } = adSet
  const { account } = campaign
  const ai = ad.aiAnalyses[0]
  return {
    adId: ad.id,
    reviewStatus: ad.reviewStatus,
    submittedAt: ad.submittedAt?.toISOString() ?? null,
    reviewedAt: ad.reviewedAt?.toISOString() ?? null,
    reviewNote: ad.reviewNote,
    company: { id: account.company.id, name: account.company.tradeName, verified: account.company.verified },
    accountName: account.name,
    campaignName: campaign.name,
    objective: campaign.objective,
    creative: {
      id: ad.creative.id,
      headline: ad.creative.headline,
      body: ad.creative.body,
      ctaLabel: ad.creative.ctaLabel,
      destinationUrl: ad.creative.destinationUrl,
    },
    audience: {
      states: adSet.states,
      cities: adSet.cities,
      interests: adSet.interests as AdInterestId[],
      ageBands: adSet.ageBands as AgeBand[],
      genders: adSet.genders,
      automaticAudience: adSet.automaticAudience,
    },
    dailyBudgetCents: adSet.dailyBudgetCents,
    aiAnalysis: ai
      ? {
          category: ai.category,
          restricted: ai.restricted,
          violations: Array.isArray(ai.violations) ? (ai.violations as { id: string; confidence: number }[]) : [],
          sensitive: ai.sensitive,
          confidence: ai.confidence,
          explanation: ai.explanation,
          autoApproved: ai.autoApproved,
          createdAt: ai.createdAt.toISOString(),
        }
      : null,
    history: ad.reviews.map((review) => ({
      decision: review.decision,
      reason: review.reason,
      source: review.source,
      reviewerName: review.reviewer?.name ?? null,
      createdAt: review.createdAt.toISOString(),
    })),
  }
}
