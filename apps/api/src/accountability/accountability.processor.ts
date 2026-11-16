import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { ACCOUNTABILITY_QUEUE, AccountabilityService } from './accountability.service'

@Processor(ACCOUNTABILITY_QUEUE, { concurrency: 2 })
export class AccountabilityProcessor extends WorkerHost {
  private readonly logger = new Logger(AccountabilityProcessor.name)

  constructor(private readonly service: AccountabilityService) {
    super()
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'render-pdf') {
      const { reportId, notifyManagers } = job.data as {
        reportId: string
        notifyManagers?: boolean
      }
      await this.service.renderReportPdfJob(reportId, Boolean(notifyManagers))
      return
    }
    if (job.name === 'monthly-entity-auto-reports') {
      const result = await this.service.runMonthlyEntityAutoReports()
      this.logger.log(`Relatórios mensais automáticos enfileirados: ${result.scheduled}`)
      return
    }
    if (job.name === 'purge-expired-pdfs') {
      await this.service.purgeExpiredPdfs()
      return
    }
    this.logger.warn(`Unknown accountability job: ${job.name}`)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Accountability job ${job.name}(${job.id}) failed: ${err.message}`)
  }
}
