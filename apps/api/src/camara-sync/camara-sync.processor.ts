import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { CamaraSyncService, CAMARA_SYNC_QUEUE } from './camara-sync.service'

@Processor(CAMARA_SYNC_QUEUE, { concurrency: 1 })
export class CamaraSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CamaraSyncProcessor.name)

  constructor(private readonly service: CamaraSyncService) {
    super()
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'full-sync': {
        const result = await this.service.runSync()
        this.logger.log(
          `Sync concluído — partidos: ${result.parties}, criados: ${result.created}, ` +
          `atualizados: ${result.updated}, ignorados: ${result.skipped} ` +
          `(${result.finishedAt.getTime() - result.startedAt.getTime()}ms)`,
        )
        return
      }

      default:
        this.logger.warn(`Job desconhecido: ${job.name}`)
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Job ${job.name}(${job.id}) falhou após ${job.attemptsMade} tentativa(s): ${err.message}`,
    )
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.log(`Job ${job.name}(${job.id}) iniciado`)
  }
}
