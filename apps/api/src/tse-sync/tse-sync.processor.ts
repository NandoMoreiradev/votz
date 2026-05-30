import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { TseSyncService, TSE_SYNC_QUEUE } from './tse-sync.service'

@Processor(TSE_SYNC_QUEUE, { concurrency: 1 })
export class TseSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(TseSyncProcessor.name)

  constructor(private readonly service: TseSyncService) {
    super()
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'presidente-governadores': {
        const r = await this.service.syncPresidenteGovernadores()
        this.logger.log(
          `Presidente + Governadores — criados: ${r.created}, atualizados: ${r.updated}, ` +
          `ignorados: ${r.skipped} (${r.finishedAt.getTime() - r.startedAt.getTime()}ms)`,
        )
        return
      }

      case 'prefeitos-dep-estaduais': {
        const r = await this.service.syncPrefeitosDepEstaduais()
        this.logger.log(
          `Prefeitos + Dep. Estaduais — criados: ${r.created}, atualizados: ${r.updated}, ` +
          `ignorados: ${r.skipped} (${r.finishedAt.getTime() - r.startedAt.getTime()}ms)`,
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
