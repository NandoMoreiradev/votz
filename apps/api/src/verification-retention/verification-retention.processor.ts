import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import {
  VerificationRetentionService,
  VERIFICATION_RETENTION_QUEUE,
} from './verification-retention.service'

@Processor(VERIFICATION_RETENTION_QUEUE, { concurrency: 1 })
export class VerificationRetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(VerificationRetentionProcessor.name)

  constructor(private readonly service: VerificationRetentionService) {
    super()
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'purge-expired-documents': {
        const res = await this.service.purgeExpiredDocuments()
        this.logger.log(
          `verification-retention run: scanned=${res.scanned}, updated=${res.purgedRequests}, deletedFiles=${res.deletedFiles}, failedFiles=${res.failedFiles}`,
        )
        return
      }
      default:
        this.logger.warn(`Unknown verification-retention job name: ${job.name}`)
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`VerificationRetention job ${job.name}(${job.id}) failed: ${err.message}`)
  }
}
