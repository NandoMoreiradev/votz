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

  async process(job: Job<{ year?: number }>): Promise<void> {
    const year = job.data?.year

    switch (job.name) {
      case 'geral': {
        const r = await this.service.syncEleicaoGeral(year)
        this.logger.log(
          `Eleição Geral (${r.electionYear}) — criados: ${r.created}, atualizados: ${r.updated}, ` +
            `reativados: ${r.reactivated}, ignorados: ${r.skipped} (${r.finishedAt.getTime() - r.startedAt.getTime()}ms)`,
        )
        return
      }

      case 'municipal': {
        const r = await this.service.syncEleicaoMunicipal(year)
        this.logger.log(
          `Eleição Municipal (${r.electionYear}) — criados: ${r.created}, atualizados: ${r.updated}, ` +
            `reativados: ${r.reactivated}, ignorados: ${r.skipped} (${r.finishedAt.getTime() - r.startedAt.getTime()}ms)`,
        )
        return
      }

      case 'presidente-governadores': {
        const r = await this.service.syncPresidenteGovernadores(year)
        this.logger.log(
          `Presidente + Governadores (${r.electionYear}) — criados: ${r.created}, atualizados: ${r.updated}, ` +
            `reativados: ${r.reactivated}, ignorados: ${r.skipped} (${r.finishedAt.getTime() - r.startedAt.getTime()}ms)`,
        )
        return
      }

      case 'prefeitos-dep-estaduais': {
        const r = await this.service.syncPrefeitosDepEstaduais(year)
        this.logger.log(
          `Prefeitos + Dep. Estaduais (${r.electionYear}) — criados: ${r.created}, atualizados: ${r.updated}, ` +
            `reativados: ${r.reactivated}, ignorados: ${r.skipped} (${r.finishedAt.getTime() - r.startedAt.getTime()}ms)`,
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
