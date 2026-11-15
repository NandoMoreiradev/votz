import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Cron } from '@nestjs/schedule'
import { Queue } from 'bullmq'
import { ANALYTICS_QUEUE } from './analytics.constants'

@Injectable()
export class AnalyticsCron {
  private readonly logger = new Logger(AnalyticsCron.name)

  constructor(@InjectQueue(ANALYTICS_QUEUE) private readonly queue: Queue) {}

  @Cron('15 * * * *')
  async scheduleHourlyIncremental() {
    await this.queue.add(
      'incremental-hourly',
      {},
      {
        jobId: `analytics-hourly-${new Date().toISOString().slice(0, 13)}`,
        removeOnComplete: 24,
        removeOnFail: 12,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    )
    this.logger.debug('Job horário de rollup enfileirado')
  }

  @Cron('0 2 * * *')
  async scheduleNightlyRebuild() {
    await this.queue.add(
      'nightly-rebuild',
      {},
      {
        jobId: `analytics-nightly-${new Date().toISOString().slice(0, 10)}`,
        removeOnComplete: 7,
        removeOnFail: 7,
        attempts: 2,
        backoff: { type: 'fixed', delay: 30_000 },
      },
    )
    this.logger.log('Job noturno de reconstrução e reconciliação enfileirado')
  }
}
