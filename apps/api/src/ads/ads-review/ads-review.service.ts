import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { NotificationsService } from '../../notifications/notifications.service'
import * as DOMPurify from 'isomorphic-dompurify'
import { AD_REVIEW_LIMITS, type AdAiMediaScope, type AdInterestId, type AdLandingCheckView, type AdReviewQueueItem, type AdReviewQueueResponse, type AgeBand } from '@votz/shared-types'
import { StorageService } from '../../storage/storage.service'
import { creativeMediaItem, creativeMediaReady } from '../ad-creative-media'
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
    private readonly storage: StorageService,
  ) {}

  async listQueue(status: Status = 'PENDING', page = 1, limit = 20): Promise<AdReviewQueueResponse> {
    const take = Math.min(limit, 50)
    const { total, pendingCount, data } = await this.repo.listQueue(status, page, take)
    const publicUrl = (key: string) => this.storage.getPublicUrl(key)
    return {
      data: data.map((ad) => toQueueItem(ad, publicUrl)),
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
    // Ninguém decide sobre um texto que não leu: se o anunciante editou depois de a tela carregar, a pessoa precisa ler de novo.
    if (dto.expectedSubmittedAt !== undefined && (dto.expectedSubmittedAt ?? null) !== (ad.submittedAt?.toISOString() ?? null)) {
      throw new ConflictException('O anunciante mudou este anúncio depois que você abriu a fila. Atualize a tela e leia o texto novo antes de decidir.')
    }
    // Ninguém aprova o que não viu: vídeo ainda sendo preparado (ou que falhou) só pode ser recusado.
    if (dto.decision === 'APPROVED' && !creativeMediaReady(ad.creative.media)) {
      throw new BadRequestException(
        ad.creative.media?.status === 'FAILED'
          ? 'O vídeo deste anúncio não pôde ser preparado. Recuse e peça ao anunciante um novo arquivo.'
          : 'O vídeo deste anúncio ainda está sendo preparado. Espere ele ficar pronto para ver e aprovar.',
      )
    }

    const ok = await this.repo.decide({
      adId,
      decision: dto.decision,
      reason: reason || null,
      reviewerId: reviewer.id,
      creativeSnapshot: creativeSnapshot(ad.creative),
      expectedSubmittedAt: ad.submittedAt,
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
    // A IA lê o texto e a foto, mas não ouve o som do vídeo: anúncio com vídeo (ou mídia que não está pronta) sempre
    // passa por uma pessoa. A política de aprovação (`canAutoApprove`) já exigiu que a foto tenha sido lida.
    if (ad.creative.media && (ad.creative.media.kind !== 'IMAGE' || ad.creative.media.status !== 'READY')) return false
    const ok = await this.repo.decide({
      adId,
      decision: 'APPROVED',
      reason: note,
      reviewerId: null,
      source: 'AI',
      creativeSnapshot: creativeSnapshot(ad.creative),
      expectedSubmittedAt: ad.submittedAt,
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

/** O que foi revisado, guardado junto com a decisão (a memória do que foi aprovado ou recusado). */
function creativeSnapshot(creative: {
  headline: string
  body: string
  ctaLabel: string
  destinationUrl: string
  media: { id: string; kind: string; format: string | null } | null
}) {
  return {
    headline: creative.headline,
    body: creative.body,
    ctaLabel: creative.ctaLabel,
    destinationUrl: creative.destinationUrl,
    media: creative.media ? { id: creative.media.id, kind: creative.media.kind, format: creative.media.format } : null,
  }
}

function toQueueItem(ad: QueueAd, publicUrl: (key: string) => string): AdReviewQueueItem {
  const { adSet } = ad
  const { campaign } = adSet
  const { account } = campaign
  const ai = ad.aiAnalyses[0]
  const landing = ad.landingChecks[0]
  return {
    adId: ad.id,
    landing: landing
      ? { status: landing.status as AdLandingCheckView['status'], httpStatus: landing.httpStatus, finalHost: landing.finalHost, problems: landing.problems, checkedAt: landing.checkedAt.toISOString() }
      : null,
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
      media: creativeMediaItem(ad.creative.media, publicUrl),
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
          mediaScope: (ai.mediaScope as AdAiMediaScope | null) ?? null,
          mediaSummary: ai.mediaSummary,
          mediaText: ai.mediaText,
          audioText: ai.audioText,
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
