import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { SLA_QUEUE, SlaService } from './sla.service'

@Processor(SLA_QUEUE, { concurrency: 1 })
export class SlaProcessor extends WorkerHost {
  private readonly logger = new Logger(SlaProcessor.name)

  constructor(private readonly sla: SlaService) {
    super()
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'sla-sweep') {
      const result = await this.sla.runSlaSweep()
      this.logger.log(
        `Varredura SLA concluída: scanned=${result.scanned}, atRisk=${result.transitionedAtRisk}, breached=${result.transitionedBreached}, notifications=${result.notificationsSent}, escalations=${result.escalationsSent}`,
      )
      return
    }
    this.logger.warn(`Unknown SLA job: ${job.name}`)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`SLA job ${job.name}(${job.id}) failed: ${err.message}`)
  }
}
