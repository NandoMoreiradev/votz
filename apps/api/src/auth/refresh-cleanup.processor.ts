import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { REFRESH_CLEANUP_QUEUE, RefreshCleanupService } from './refresh-cleanup.service'

@Processor(REFRESH_CLEANUP_QUEUE, { concurrency: 1 })
export class RefreshCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(RefreshCleanupProcessor.name)

  constructor(private readonly service: RefreshCleanupService) {
    super()
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'purge-expired-tokens') {
      await this.service.purgeExpiredTokens()
      return
    }
    this.logger.warn(`Unknown job name: ${job.name}`)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.name}(${job.id}) failed: ${err.message}`)
  }
}
