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
    if (job.name !== 'generate-embedding') {
      this.logger.warn(`Unknown job: ${job.name}`)
      return
    }

    const { reportId, text } = job.data as GenerateEmbeddingJob
    const embedding = await this.embeddingService.embed(text)
    await this.repository.updateEmbedding(reportId, embedding)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.name}(${job.id}) failed: ${err.message}`)
  }
}
