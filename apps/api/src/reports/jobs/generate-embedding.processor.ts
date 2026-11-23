import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { EmbeddingService } from '../../embedding/embedding.service'
import { ReportsRepository } from '../reports.repository'

export const REPORTS_QUEUE = 'reports'

export interface GenerateEmbeddingJob {
  reportId: string
  text: string
}

/** Quantos relatos sem embedding cada rodada tenta preencher (poucos, para não estourar o limite do Google). */
export const EMBEDDING_BACKFILL_BATCH = 40

@Processor(REPORTS_QUEUE, { concurrency: 2 })
export class GenerateEmbeddingProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerateEmbeddingProcessor.name)

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly repository: ReportsRepository,
  ) {
    super()
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'generate-embedding') {
      const { reportId, text } = job.data as GenerateEmbeddingJob
      const embedding = await this.embeddingService.embed(text)
      await this.repository.updateEmbedding(reportId, embedding)
      return
    }
    if (job.name === 'backfill-embeddings') {
      await this.backfill()
      return
    }
    this.logger.warn(`Unknown job: ${job.name}`)
  }

  /**
   * Preenche o embedding de relatos que ficaram sem (os criados antes do job existir ou enquanto o modelo
   * antigo dava erro). Idempotente: só pega quem ainda está sem. Para ao primeiro limite de uso do Google
   * e tenta de novo na próxima rodada.
   */
  async backfill(batch = EMBEDDING_BACKFILL_BATCH): Promise<{ done: number; failed: number; stoppedByLimit: boolean }> {
    const missing = await this.repository.findWithoutEmbedding(batch)
    let done = 0
    let failed = 0
    for (const report of missing) {
      try {
        const vector = await this.embeddingService.embed(`${report.title} ${report.description}`)
        await this.repository.updateEmbedding(report.id, vector)
        done++
      } catch (err) {
        failed++
        const message = String((err as Error)?.message ?? err)
        this.logger.warn(`Embedding do relato ${report.id} falhou: ${message.slice(0, 160)}`)
        if (/429|quota|rate/i.test(message)) {
          return { done, failed, stoppedByLimit: true }
        }
      }
    }
    if (done > 0 || failed > 0) this.logger.log(`Embeddings preenchidos: ${done} ok, ${failed} falha(s), faltavam ${missing.length}`)
    return { done, failed, stoppedByLimit: false }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.name}(${job.id}) failed: ${err.message}`)
  }
}
