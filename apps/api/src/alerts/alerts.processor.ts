import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { AlertRulesService } from './alert-rules.service'
import { AlertsService, ALERTS_QUEUE, AlertsJob } from './alerts.service'

@Processor(ALERTS_QUEUE, { concurrency: 3 })
export class AlertsProcessor extends WorkerHost {
  private readonly logger = new Logger(AlertsProcessor.name)

  constructor(
    private readonly alertsService: AlertsService,
    private readonly alertRules: AlertRulesService,
  ) {
    super()
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'check-surto': {
        const { category, city, state } = job.data as AlertsJob
        await this.alertsService.checkSurto(category, city, state)
        return
      }

      case 'check-all-surtos': {
        await this.alertsService.checkAllActiveSurtos()
        return
      }

      case 'evaluate-report-rules': {
        const { reportId } = job.data as { reportId: string }
        await this.alertRules.evaluateRulesForReport(reportId)
        return
      }

      case 'evaluate-rules-sweep': {
        await this.alertRules.runPeriodicSweep()
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
