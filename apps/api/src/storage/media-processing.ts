import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import type { Job, Queue } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from './storage.service'
import { normalizeVideo } from './video-normalize'
import { generateVideoPoster, posterKeyFor } from './video-poster'

export const MEDIA_QUEUE = 'media-processing'
export const NORMALIZE_VIDEO_JOB = 'normalize-video'

export interface NormalizeVideoJobData {
  key: string
  /** Gerar também a capa do vídeo (envio direto: a API não viu os bytes na hora do envio). */
  poster?: boolean
}

/** Coloca a conversão de um vídeo na fila. Se a fila estiver fora do ar, o envio do vídeo não falha. */
@Injectable()
export class MediaProcessingService {
  private readonly logger = new Logger(MediaProcessingService.name)

  constructor(@InjectQueue(MEDIA_QUEUE) private readonly queue: Queue<NormalizeVideoJobData>) {}

  async enqueueVideo(key: string, options: { poster?: boolean } = {}): Promise<boolean> {
    try {
      await this.queue.add(NORMALIZE_VIDEO_JOB, { key, ...(options.poster ? { poster: true } : {}) })
      return true
    } catch (error) {
      this.logger.warn(`Não foi possível enfileirar a conversão de ${key}: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }
}

const extensionOf = (key: string) => key.split('.').pop() ?? 'mp4'

/**
 * Converte vídeos de relato e de publicação para 1080p (H.264 + AAC) em segundo plano. Um por vez: a
 * conversão usa muito processador. O arquivo convertido SUBSTITUI o original na mesma chave, então os
 * links já guardados no relato continuam valendo. Nunca apaga o original sem ter o convertido pronto.
 */
@Processor(MEDIA_QUEUE, { concurrency: 1 })
export class MediaProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessingProcessor.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    super()
  }

  async process(job: Job<NormalizeVideoJobData>) {
    const { key, poster } = job.data
    // Arquivos de relato têm linha de controle; os de publicação não (sem linha, sempre processa).
    const row = await this.prisma.reportMedia.findUnique({
      where: { key },
      select: { id: true, processing: true, sizeBytes: true },
    })
    // Repetir o trabalho (nova tentativa, reenfileirado) não converte duas vezes.
    if (row && row.processing !== 'PENDING') return { status: 'JA_PROCESSADO' as const }

    const original = await this.storage.getObjectBuffer(key)
    if (!original) {
      await this.mark(key, row, { processing: 'FAILED' })
      return { status: 'FAILED' as const, reason: 'arquivo não encontrado' }
    }

    const result = await normalizeVideo(original, extensionOf(key))
    if (result.status === 'DONE') {
      await this.storage.uploadBuffer(key, result.data, 'video/mp4', false)
      await this.mark(key, row, {
        processing: 'DONE',
        mimeType: 'video/mp4',
        sizeBytes: result.data.byteLength,
        width: result.width,
        height: result.height,
        durationMs: result.durationMs,
      })
      this.logger.log(`Vídeo ${key} convertido: ${original.byteLength} → ${result.data.byteLength} bytes (${result.width}x${result.height}).`)
      if (poster) await this.storePoster(key, result.data, 'mp4')
      return { status: 'DONE' as const, before: original.byteLength, after: result.data.byteLength }
    }
    if (result.status === 'SKIPPED') {
      await this.mark(key, row, {
        processing: 'SKIPPED',
        ...(result.width ? { width: result.width, height: result.height } : {}),
        ...(result.durationMs ? { durationMs: result.durationMs } : {}),
      })
      if (poster) await this.storePoster(key, original, extensionOf(key))
      return { status: 'SKIPPED' as const, reason: result.reason }
    }
    // Falha do ffmpeg (arquivo estragado, por exemplo) não melhora tentando de novo: fica o original.
    this.logger.warn(`Vídeo ${key} ficou como veio: ${result.reason}`)
    await this.mark(key, row, { processing: 'FAILED' })
    if (poster) await this.storePoster(key, original, extensionOf(key))
    return { status: 'FAILED' as const, reason: result.reason }
  }

  /** Capa do vídeo (`<chave>.poster.jpg`). É um extra: se falhar, os apps mostram o primeiro quadro, como nos vídeos antigos. */
  private async storePoster(key: string, video: Buffer, extension: string) {
    const posterKey = posterKeyFor(key)
    if (!posterKey) return
    try {
      const image = await generateVideoPoster(video, extension, {
        onFailure: (reason) => this.logger.warn(`Sem capa para ${key}: ${reason}`),
      })
      if (image) await this.storage.uploadBuffer(posterKey, image, 'image/jpeg', false)
    } catch (error) {
      this.logger.warn(`Sem capa para ${key}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Esgotou as tentativas (storage fora do ar, por exemplo): o vídeo fica como veio e o controle deixa de dizer "na fila". */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<NormalizeVideoJobData> | undefined, error: Error) {
    if (!job) return
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return
    this.logger.error(`Conversão de ${job.data.key} desistiu: ${error.message}`)
    await this.prisma.reportMedia
      .updateMany({ where: { key: job.data.key, processing: 'PENDING' }, data: { processing: 'FAILED' } })
      .catch(() => undefined)
  }

  private async mark(
    key: string,
    row: { id: string } | null,
    data: {
      processing: string
      mimeType?: string
      sizeBytes?: number
      width?: number
      height?: number
      durationMs?: number | null
    },
  ) {
    if (!row) return
    await this.prisma.reportMedia.update({ where: { key }, data })
  }
}
