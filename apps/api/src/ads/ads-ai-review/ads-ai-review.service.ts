import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { AdsReviewService } from '../ads-review/ads-review.service'
import type { AdAiMediaScope } from '@votz/shared-types'
import { AdsAnalyzer } from './ads-analyzer'
import { AI_EXPLANATION_MAX, canAutoApprove, manipulationAttempt, mergeViolations, obviousViolations, sanitizeAnalysis } from './ads-ai-review.policy'
import { AdMediaReader, type AdMediaReading } from './ads-media-reader'

export const ADS_AI_REVIEW_QUEUE = 'ads-ai-review'

/** Tentativas da análise: com 10 s de espera que dobra, dá cerca de 20 minutos para o vídeo ficar pronto. */
export const ANALYSIS_ATTEMPTS = 8

/** Aviso no começo do parecer quando o anúncio traz uma ordem escondida para a IA. */
export const MANIPULATION_NOTE = 'Há uma ordem escondida para a IA no anúncio (texto, imagem ou som): tentativa de manipular a revisão.'

export type AiReviewOutcome = 'skipped' | 'annotated' | 'auto-approved'

/**
 * Revisão por IA, antes da fila humana (plano de anúncios, seção 5).
 *
 * - O parecer sempre é gravado e aparece para o moderador. Com foto ou vídeo, a IA olha a foto ou alguns quadros do
 *   vídeo, e ouve o som dele (faixa extraída em mp3 leve), junto com o texto; vídeo ainda sendo preparado faz o
 *   trabalho esperar e tentar de novo.
 * - **Vídeo nunca é aprovado pela IA** (uma pessoa assiste e escuta). Foto só se a IA leu a foto de fato.
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
    private readonly mediaReader: AdMediaReader,
  ) {}

  /** O modo automático é opt-in do dono do produto: sem ele a IA só anota. */
  autoApproveEnabled(): boolean {
    return this.config.get<string>('ADS_AI_AUTO_APPROVE') === 'true'
  }

  /** Põe o anúncio na fila de análise. Nunca lança: falhar aqui não pode impedir o envio do anúncio. */
  async enqueue(adId: string): Promise<void> {
    if (!this.analyzer.isAvailable()) return
    try {
      await this.queue.add('analyze', { adId }, { attempts: ANALYSIS_ATTEMPTS, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: true, removeOnFail: 100 })
    } catch (err) {
      this.logger.warn(`Não foi possível enfileirar a revisão por IA do anúncio ${adId}: ${(err as Error).message}`)
    }
  }

  /** Chamado pelo processador da fila. Erros do modelo sobem de propósito, para o BullMQ tentar de novo. */
  async analyze(adId: string): Promise<AiReviewOutcome> {
    const ad = await this.reviews.getForAnalysis(adId)
    if (!ad || ad.reviewStatus !== 'PENDING') return 'skipped'

    const { creative } = ad
    const media = creative.media
    // Vídeo ainda sendo preparado: sobe o erro de propósito, o BullMQ espera e tenta de novo.
    if (media && media.status !== 'READY' && media.status !== 'FAILED') throw new Error('A mídia do anúncio ainda está sendo preparada')
    const reading: AdMediaReading | null = media?.status === 'READY' ? await this.mediaReader.read(media) : null
    const mediaScope: AdAiMediaScope | null = !media
      ? null
      : !reading
        ? 'UNREADABLE'
        : reading.kind === 'IMAGE'
          ? 'IMAGE'
          : reading.audio
            ? 'VIDEO_FRAMES_AUDIO'
            : reading.hasAudioTrack
              ? 'VIDEO_FRAMES'
              : 'VIDEO_SILENT'

    const raw = await this.analyzer.analyze(
      {
        headline: creative.headline,
        body: creative.body,
        ctaLabel: creative.ctaLabel,
        destinationUrl: creative.destinationUrl,
        objective: ad.adSet.campaign.objective,
      },
      reading,
    )
    const result = sanitizeAnalysis(raw)
    if (!result) {
      this.logger.warn(`Resposta da IA inválida para o anúncio ${adId}; segue para a fila humana.`)
      return 'skipped'
    }

    // Trava por palavras, independente do modelo: um texto esperto não convence a IA a aprovar o que é óbvio.
    // O texto escrito dentro da foto ou do vídeo, e o que foi falado no áudio, passam pela mesma trava.
    const heardText = reading?.audio ? (result.audioText ?? '') : ''
    const everything = [creative.headline, creative.body, creative.destinationUrl, result.mediaText ?? '', heardText]
    const violations = mergeViolations(result.violations, obviousViolations(everything))
    // Ordem escondida para a IA (no texto, na imagem ou no som): nunca aprova sozinha, e o parecer avisa a pessoa.
    const manipulation = manipulationAttempt(everything)
    const explanation = manipulation ? `${MANIPULATION_NOTE} ${result.explanation}`.slice(0, AI_EXPLANATION_MAX) : result.explanation
    const final = { ...result, violations, explanation }
    const mediaStatus = media ? { kind: media.kind === 'IMAGE' ? ('IMAGE' as const) : ('VIDEO' as const), read: !!reading && !!result.mediaSummary } : null
    const approve = this.autoApproveEnabled() && !manipulation && canAutoApprove(final, mediaStatus)

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
      mediaScope,
      mediaSummary: reading ? final.mediaSummary : null,
      mediaText: reading ? final.mediaText : null,
      audioText: reading?.audio ? final.audioText : null,
    })

    if (!approve) return 'annotated'
    return (await this.reviews.approveByAi(adId, final.explanation)) ? 'auto-approved' : 'annotated'
  }
}
