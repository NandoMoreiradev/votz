import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { LIFECYCLE_QUEUE, MandatometerRefreshJob } from './report-lifecycle.types'
import { MandatometerService } from './mandatometer.service'
import { AdvocacyDeadlineService } from './advocacy-deadline.service'

@Processor(LIFECYCLE_QUEUE, { concurrency: 3 })
export class ReportLifecycleProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportLifecycleProcessor.name)

  constructor(
    private readonly mandatometer: MandatometerService,
    private readonly deadlines: AdvocacyDeadlineService,
  ) {
    super()
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'refresh-mandatometer': {
        const { politicianId } = job.data as MandatometerRefreshJob
        await this.mandatometer.refresh(politicianId)
        return
      }
      case 'advocacy-deadlines': {
        const count = await this.deadlines.sweep()
        if (count > 0) this.logger.log(`Prazos de avocação vencidos avisados: ${count}`)
        return
      }
      default:
        this.logger.warn(`Job desconhecido: ${job.name}`)
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.name}(${job.id}) falhou após ${job.attemptsMade} tentativa(s): ${err.message}`)
  }
}
