import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { FEED_RANKING_INTERVAL_MINUTES, FeedRankingService } from './feed-ranking.service'

@Injectable()
export class FeedRankingCron {
  private readonly logger = new Logger(FeedRankingCron.name)

  constructor(private readonly rankingService: FeedRankingService) {}

  @Cron(`*/${FEED_RANKING_INTERVAL_MINUTES} * * * *`)
  async sweep(): Promise<void> {
    this.logger.debug('Enqueuing 10-minute feed ranking batch')
    await this.rankingService.enqueueBatch()
  }
}
