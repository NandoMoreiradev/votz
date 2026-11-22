import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { ADS_AI_REVIEW_QUEUE, AdsAiReviewService } from './ads-ai-review.service'

@Processor(ADS_AI_REVIEW_QUEUE, { concurrency: 2 })
export class AdsAiReviewProcessor extends WorkerHost {
  private readonly logger = new Logger(AdsAiReviewProcessor.name)

  constructor(private readonly service: AdsAiReviewService) {
    super()
  }

  async process(job: Job<{ adId: string }>): Promise<void> {
    if (job.name !== 'analyze') {
      this.logger.warn(`Tarefa desconhecida na revisão por IA: ${job.name}`)
      return
    }
    const outcome = await this.service.analyze(job.data.adId)
    this.logger.log(`Revisão por IA do anúncio ${job.data.adId}: ${outcome}`)
  }
}
