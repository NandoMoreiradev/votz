import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Job, Queue } from 'bullmq'
import { PressRadarService } from './press-radar.service'

export const PRESS_RADAR_QUEUE = 'press-radar'

/** A cada 15 minutos entra um trabalho na fila. O `jobId` por janela evita rodada dobrada se houver mais de uma API. */
@Injectable()
export class PressRadarCron {
  private readonly logger = new Logger(PressRadarCron.name)

  constructor(@InjectQueue(PRESS_RADAR_QUEUE) private readonly queue: Queue) {}

  @Cron('*/15 * * * *')
  async sweep(): Promise<void> {
    const window = Math.floor(Date.now() / (15 * 60_000))
    await this.queue
      .add('sweep', {}, { jobId: `press-radar-sweep-${window}`, removeOnComplete: 20, removeOnFail: 20, attempts: 2, backoff: { type: 'fixed', delay: 10_000 } })
      .catch((err) => this.logger.error('Falha ao enfileirar a rodada do radar de imprensa', err))
  }
}

@Processor(PRESS_RADAR_QUEUE, { concurrency: 1 })
export class PressRadarProcessor extends WorkerHost {
  private readonly logger = new Logger(PressRadarProcessor.name)

  constructor(private readonly radar: PressRadarService) {
    super()
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'sweep') {
      this.logger.warn(`Trabalho desconhecido na fila do radar: ${job.name}`)
      return
    }
    const result = await this.radar.runSweep()
    if (result.newHits > 0 || result.digests > 0) {
      this.logger.log(`Radar de imprensa: ${result.rules} regra(s), ${result.newHits} achado(s) novo(s), ${result.digests} aviso(s) enviado(s)`)
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Radar de imprensa: trabalho ${job.name}(${job.id}) falhou: ${err.message}`)
  }
}
