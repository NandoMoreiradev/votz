import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { ADS_LANDING_QUEUE, AdsLandingService, type LandingTrigger } from './ads-landing.service'

@Processor(ADS_LANDING_QUEUE, { concurrency: 3 })
export class AdsLandingProcessor extends WorkerHost {
  private readonly logger = new Logger(AdsLandingProcessor.name)

  constructor(private readonly service: AdsLandingService) {
    super()
  }

  async process(job: Job<{ adId: string; trigger: LandingTrigger }>): Promise<void> {
    if (job.name !== 'check') {
      this.logger.warn(`Tarefa desconhecida na conferência de página: ${job.name}`)
      return
    }
    const outcome = await this.service.check(job.data.adId, job.data.trigger)
    this.logger.log(`Conferência da página do anúncio ${job.data.adId} (${job.data.trigger}): ${outcome}`)
  }
}
