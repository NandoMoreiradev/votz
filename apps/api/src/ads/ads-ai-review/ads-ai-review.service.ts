import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { AdsReviewService } from '../ads-review/ads-review.service'
import { AdsAnalyzer } from './ads-analyzer'
import { canAutoApprove, mergeViolations, obviousViolations, sanitizeAnalysis } from './ads-ai-review.policy'

export const ADS_AI_REVIEW_QUEUE = 'ads-ai-review'

export type AiReviewOutcome = 'skipped' | 'annotated' | 'auto-approved'

/**
 * Revisão por IA, antes da fila humana (plano de anúncios, seção 5).
 *
 * - O parecer sempre é gravado e aparece para o moderador.
 * - A IA **nunca recusa**: recusar é sempre decisão de uma pessoa.
 * - Só aprova sozinha com `ADS_AI_AUTO_APPROVE=true` e se a política de segurança passar (`canAutoApprove`).
 *   Sem a chave de IA, com erro ou com resposta fora do formato, o anúncio simplesmente segue para a fila humana.
 */
@Injectable()
export class AdsAiReviewService {
  private readonly logger = new Logger(AdsAiReviewService.name)

  constructor(
    @InjectQueue(ADS_AI_REVIEW_QUEUE) private readonly queue: Queue,
    private readonly reviews: AdsReviewService,
    private readonly analyzer: AdsAnalyzer,
    private readonly config: ConfigService,
  ) {}

  /** O modo automático é opt-in do dono do produto: sem ele a IA só anota. */
  autoApproveEnabled(): boolean {
    return this.config.get<string>('ADS_AI_AUTO_APPROVE') === 'true'
  }

  /** Põe o anúncio na fila de análise. Nunca lança: falhar aqui não pode impedir o envio do anúncio. */
  async enqueue(adId: string): Promise<void> {
    if (!this.analyzer.isAvailable()) return
    try {
      await this.queue.add('analyze', { adId }, { attempts: 3, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: true, removeOnFail: 100 })
    } catch (err) {
      this.logger.warn(`Não foi possível enfileirar a revisão por IA do anúncio ${adId}: ${(err as Error).message}`)
    }
  }

  /** Chamado pelo processador da fila. Erros do modelo sobem de propósito, para o BullMQ tentar de novo. */
  async analyze(adId: string): Promise<AiReviewOutcome> {
    const ad = await this.reviews.getForAnalysis(adId)
    if (!ad || ad.reviewStatus !== 'PENDING') return 'skipped'

    const { creative } = ad
    const raw = await this.analyzer.analyze({
      headline: creative.headline,
      body: creative.body,
      ctaLabel: creative.ctaLabel,
      destinationUrl: creative.destinationUrl,
      objective: ad.adSet.campaign.objective,
    })
    const result = sanitizeAnalysis(raw)
    if (!result) {
      this.logger.warn(`Resposta da IA inválida para o anúncio ${adId}; segue para a fila humana.`)
      return 'skipped'
    }

    // Trava por palavras, independente do modelo: um texto esperto não convence a IA a aprovar o que é óbvio.
    const violations = mergeViolations(result.violations, obviousViolations([creative.headline, creative.body, creative.destinationUrl]))
    const final = { ...result, violations }
    const approve = this.autoApproveEnabled() && canAutoApprove(final)

    await this.reviews.saveAnalysis({
      adId,
      category: final.category,
      restricted: final.restricted,
      violations: final.violations,
      sensitive: final.sensitive,
      confidence: final.confidence,
      explanation: final.explanation,
      model: this.analyzer.modelName,
      autoApproved: approve,
    })

    if (!approve) return 'annotated'
    return (await this.reviews.approveByAi(adId, final.explanation)) ? 'auto-approved' : 'annotated'
  }
}
