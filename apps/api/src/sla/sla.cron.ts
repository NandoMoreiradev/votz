import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Queue } from 'bullmq'
import { SLA_QUEUE } from './sla.service'

@Injectable()
export class SlaCron {
  private readonly logger = new Logger(SlaCron.name)

  constructor(@InjectQueue(SLA_QUEUE) private readonly queue: Queue) {}

  @Cron('*/15 * * * *')
  async scheduleSlaSweep(): Promise<void> {
    const now = new Date()
    const bucket = Math.floor(now.getUTCMinutes() / 15) * 15
    const bucketKey = `${now.toISOString().slice(0, 13)}:${String(bucket).padStart(2, '0')}`
    await this.queue.add(
      'sla-sweep',
      {},
      {
        jobId: `sla-sweep-${bucketKey}`,
        removeOnComplete: 48,
        removeOnFail: 24,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
      },
    )
    this.logger.debug(`Job SLA sweep enfileirado (${bucketKey})`)
  }
}
