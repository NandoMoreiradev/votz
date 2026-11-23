import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Job, Queue } from 'bullmq'
import { ContextNotesService } from './context-notes.service'

export const CONTEXT_NOTES_QUEUE = 'context-notes'

/** De hora em hora entra um job que refaz o estado de todas as notas (jobs assíncronos sempre por BullMQ). */
@Injectable()
export class ContextNotesCron {
  private readonly logger = new Logger(ContextNotesCron.name)

  constructor(
    @InjectQueue(CONTEXT_NOTES_QUEUE) private readonly queue: Queue,
    private readonly service: ContextNotesService,
  ) {}

  @Cron('7 * * * *')
  async hourly(): Promise<void> {
    if (!this.service.isEnabled()) return
    const hour = new Date().toISOString().slice(0, 13).replace(/[^0-9]/g, '')
    // O id repetido dentro da mesma hora impede dois jobs iguais (sem ":" no id, que o BullMQ não aceita).
    await this.queue.add('recalculate', {}, { jobId: `context-notes-recalc-${hour}`, removeOnComplete: 24, removeOnFail: 50 })
    this.logger.debug('Conta do Contexto da Comunidade enfileirada')
  }
}

@Processor(CONTEXT_NOTES_QUEUE, { concurrency: 1 })
export class ContextNotesProcessor extends WorkerHost {
  private readonly logger = new Logger(ContextNotesProcessor.name)

  constructor(private readonly service: ContextNotesService) {
    super()
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'recalculate') {
      this.logger.warn(`Job desconhecido em ${CONTEXT_NOTES_QUEUE}: ${job.name}`)
      return
    }
    const result = await this.service.recalculateAll()
    this.logger.log(`Notas avaliadas: ${result.evaluated}, mudaram: ${result.changed} (exibidas ${result.shown}, não exibidas ${result.notShown})`)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.name}(${job.id}) falhou depois de ${job.attemptsMade} tentativa(s): ${err.message}`)
  }
}
