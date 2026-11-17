import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { FEED_RANKING_QUEUE, FeedRankingService } from './feed-ranking.service'

@Processor(FEED_RANKING_QUEUE, { concurrency: 5 })
export class FeedRankingProcessor extends WorkerHost {
  private readonly logger = new Logger(FeedRankingProcessor.name)

  constructor(private readonly rankingService: FeedRankingService) {
    super()
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'recalculate-post': {
        const { postId } = job.data as { postId: string }
        await this.rankingService.recalculateOne(postId)
        return
      }
      case 'recalculate-batch': {
        await this.rankingService.recalculateBatch()
        return
      }
      default:
        this.logger.warn(`Unknown feed-ranking job: ${job.name}`)
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Feed ranking job ${job.name}(${job.id}) failed after ${job.attemptsMade} attempt(s): ${err.message}`,
    )
  }
}
