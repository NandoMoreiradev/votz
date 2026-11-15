import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { ANALYTICS_QUEUE } from './analytics.constants'
import { AnalyticsRollupService } from './analytics.rollup'

export interface AnalyticsJobData {
  fromDay?: string
  toDay?: string
}

@Processor(ANALYTICS_QUEUE, { concurrency: 1 })
export class AnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsProcessor.name)

  constructor(private readonly rollup: AnalyticsRollupService) {
    super()
  }

  async process(job: Job<AnalyticsJobData>) {
    if (job.name === 'incremental-hourly') {
      return this.rollup.runHourlyIncremental()
    }
    if (job.name === 'nightly-rebuild') {
      await this.rollup.runNightlyRebuildAndReconcile()
      return { ok: true }
    }
    if (job.name === 'backfill' && job.data.fromDay && job.data.toDay) {
      return this.rollup.backfillRange(job.data.fromDay, job.data.toDay)
    }
    this.logger.warn(`Job de analytics desconhecido: ${job.name}`)
    return null
  }
}
