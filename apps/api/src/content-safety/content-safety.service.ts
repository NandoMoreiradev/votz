import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { evaluateTextSync, type SyncSafetyCheckResult } from './content-safety.policy'
import { CONTENT_SAFETY_QUEUE, type ContentSafetyReviewJob } from './content-safety.processor'

@Injectable()
export class ContentSafetyService {
  private readonly logger = new Logger(ContentSafetyService.name)

  constructor(
    @InjectQueue(CONTENT_SAFETY_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Camada 1 (síncrona): bloqueia palavrões pesados, discurso de ódio, ameaças explícitas
   * e exposição de CPF válido antes de gravar no banco.
   */
  assertCleanOrThrow(texts: string[], contextLabel = 'conteúdo'): SyncSafetyCheckResult {
    const result = evaluateTextSync(texts, contextLabel)
    if (result.blocked) {
      throw new BadRequestException(result.blockMessage ?? 'Este conteúdo viola as Diretrizes da Comunidade.')
    }
    return result
  }

  /** Camada 2 (assíncrona): enfileira triagem por IA + fila humana em background. */
  async enqueueReview(job: ContentSafetyReviewJob): Promise<void> {
    const nonEmpty = job.texts.map((t) => t.trim()).filter(Boolean)
    if (nonEmpty.length === 0) return

    await this.queue
      .add(
        'review-content',
        { ...job, texts: nonEmpty },
        {
          jobId: `safety-${job.targetType}-${job.targetId}`,
          removeOnComplete: 20,
          removeOnFail: 20,
          attempts: 2,
          backoff: { type: 'exponential', delay: 3_000 },
        },
      )
      .catch((err) => this.logger.warn(`Falha ao enfileirar triagem de segurança: ${(err as Error)?.message}`))
  }
}
