import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Queue } from 'bullmq'
import { REPORTS_QUEUE } from './generate-embedding.processor'

/** A cada 10 minutos entra um trabalho que preenche embeddings que faltam. `jobId` por janela evita rodada dobrada. */
@Injectable()
export class EmbeddingBackfillCron {
  private readonly logger = new Logger(EmbeddingBackfillCron.name)

  constructor(@InjectQueue(REPORTS_QUEUE) private readonly queue: Queue) {}

  @Cron('*/10 * * * *')
  async enqueue(): Promise<void> {
    const window = Math.floor(Date.now() / (10 * 60_000))
    await this.queue
      .add('backfill-embeddings', {}, { jobId: `backfill-embeddings-${window}`, removeOnComplete: 10, removeOnFail: 10, attempts: 1 })
      .catch((err) => this.logger.error('Falha ao enfileirar o preenchimento de embeddings', err))
  }
}
