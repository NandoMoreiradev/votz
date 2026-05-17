import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { PressureService, PRESSURE_QUEUE } from './pressure.service'

@Processor(PRESSURE_QUEUE, { concurrency: 5 })
export class PressureProcessor extends WorkerHost {
  private readonly logger = new Logger(PressureProcessor.name)

  constructor(private readonly pressureService: PressureService) {
    super()
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'recalculate-single': {
        const { reportId } = job.data as { reportId: string }
        await this.pressureService.recalculateOne(reportId)
        return
      }

      case 'recalculate-batch': {
        await this.pressureService.recalculateBatch()
        return
      }

      default:
        this.logger.warn(`Unknown job name: ${job.name}`)
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Job ${job.name}(${job.id}) failed after ${job.attemptsMade} attempt(s): ${err.message}`,
    )
  }
}
