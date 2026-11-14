import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { InactivityService, INACTIVITY_QUEUE } from './inactivity.service'

@Processor(INACTIVITY_QUEUE, { concurrency: 1 })
export class InactivityProcessor extends WorkerHost {
  private readonly logger = new Logger(InactivityProcessor.name)

  constructor(private readonly service: InactivityService) {
    super()
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'process-inactivity': {
        const res = await this.service.processInactivity()
        this.logger.log(`inactivity run: notified=${res.notified}, anonymized=${res.anonymized}`)
        return
      }
      default:
        this.logger.warn(`Unknown inactivity job name: ${job.name}`)
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Inactivity job ${job.name}(${job.id}) failed: ${err.message}`)
  }
}
