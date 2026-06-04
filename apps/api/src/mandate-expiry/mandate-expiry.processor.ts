import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { MandateExpiryService, MANDATE_EXPIRY_QUEUE } from './mandate-expiry.service'

@Processor(MANDATE_EXPIRY_QUEUE, { concurrency: 1 })
export class MandateExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(MandateExpiryProcessor.name)

  constructor(private readonly service: MandateExpiryService) {
    super()
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'process-expired': {
        const [exp, react] = await Promise.all([
          this.service.processExpiredMandates(),
          this.service.reactivateElectedPoliticians(),
        ])
        this.logger.log(`mandate-expiry run: expired=${exp.processed}, reactivated=${react.reactivated}`)
        return
      }
      default:
        this.logger.warn(`Unknown job name: ${job.name}`)
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.name}(${job.id}) failed: ${err.message}`)
  }
}
