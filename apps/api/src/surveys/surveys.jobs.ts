import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Job, Queue } from 'bullmq'
import { SURVEYS_QUEUE } from './surveys.queue'
import { SurveysService } from './surveys.service'

/**
 * A cada 5 minutos drena o Mix Pool de cédulas embaralhadas das pesquisas abertas,
 * abre pesquisas agendadas e encerra automaticamente as que atingiram `endsAt`.
 */
@Injectable()
export class SurveysCron {
  private readonly logger = new Logger(SurveysCron.name)

  constructor(
    @InjectQueue(SURVEYS_QUEUE) private readonly queue: Queue,
    private readonly service: SurveysService,
  ) {}

  @Cron('*/5 * * * *')
  async everyFiveMinutes(): Promise<void> {
    if (!this.service.isEnabled()) return
    const slot = Math.floor(Date.now() / 300_000)
    await this.queue.add(
      'sweep',
      {},
      { jobId: `official-surveys-sweep-${slot}`, removeOnComplete: 24, removeOnFail: 50 },
    )
    this.logger.debug('Varredura da Pesquisa Votz enfileirada')
  }
}

@Processor(SURVEYS_QUEUE, { concurrency: 1 })
export class SurveysProcessor extends WorkerHost {
  private readonly logger = new Logger(SurveysProcessor.name)

  constructor(private readonly service: SurveysService) {
    super()
  }

  async process(job: Job<{ surveyId?: string }>): Promise<void> {
    if (job.name === 'drain-mix-pool' && job.data?.surveyId) {
      const res = await this.service.drainMixPool(job.data.surveyId)
      this.logger.log(`Mix Pool drenado (${job.data.surveyId}): +${res.committed} cédulas (total=${res.totalBallots})`)
      return
    }
    if (job.name === 'sweep') {
      const res = await this.service.sweepOpenAndScheduledSurveys()
      if (res.opened || res.drained || res.closed) {
        this.logger.log(
          `Varredura Pesquisa Votz: abertas=${res.opened}, cédulas_drenadas=${res.drained}, encerradas=${res.closed}`,
        )
      }
      return
    }
    this.logger.warn(`Job desconhecido em ${SURVEYS_QUEUE}: ${job.name}`)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.name}(${job.id}) falhou depois de ${job.attemptsMade} tentativa(s): ${err.message}`)
  }
}
