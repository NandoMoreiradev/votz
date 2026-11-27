import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Queue } from 'bullmq'
import { LIFECYCLE_QUEUE } from './report-lifecycle.types'

@Injectable()
export class ReportLifecycleCron {
  constructor(@InjectQueue(LIFECYCLE_QUEUE) private readonly queue: Queue) {}

  /** De hora em hora: prazos prometidos nas avocações que venceram sem solução. */
  @Cron('7 * * * *')
  async scheduleDeadlineSweep(): Promise<void> {
    const hour = new Date().toISOString().slice(0, 13)
    await this.queue.add('advocacy-deadlines', {}, {
      jobId: `advocacy-deadlines-${hour}`,
      removeOnComplete: 48,
      removeOnFail: 24,
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
    })
  }
}
