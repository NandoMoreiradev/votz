import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import {
  WEBHOOKS_QUEUE,
  WEBHOOK_DELIVERY_ATTEMPTS,
  WebhookDeliveryJob,
  WebhooksService,
} from './webhooks.service'

@Processor(WEBHOOKS_QUEUE, { concurrency: 5 })
export class WebhooksProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhooksProcessor.name)

  constructor(private readonly service: WebhooksService) {
    super()
  }

  async process(job: Job<WebhookDeliveryJob>): Promise<void> {
    if (job.name !== 'deliver') {
      this.logger.warn(`Unknown webhook job ${job.name}`)
      return
    }
    const maxAttempts = job.opts.attempts ?? WEBHOOK_DELIVERY_ATTEMPTS
    await this.service.processDelivery(job.data, job.attemptsMade + 1, maxAttempts)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.warn(
      `Webhook job ${job.name}(${job.id}) attempt ${job.attemptsMade} failed: ${err.message}`,
    )
  }
}
