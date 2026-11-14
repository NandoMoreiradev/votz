import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { AccessLogService, ACCESS_LOG_RETENTION_QUEUE } from './access-log.service'

@Processor(ACCESS_LOG_RETENTION_QUEUE, { concurrency: 1 })
export class AccessLogProcessor extends WorkerHost {
  private readonly logger = new Logger(AccessLogProcessor.name)

  constructor(private readonly service: AccessLogService) {
    super()
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'purge-expired': {
        const res = await this.service.purgeExpired()
        this.logger.log(`access-log retention run: deleted=${res.deleted}`)
        return
      }
      default:
        this.logger.warn(`Unknown access-log job name: ${job.name}`)
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`AccessLog job ${job.name}(${job.id}) failed: ${err.message}`)
  }
}
