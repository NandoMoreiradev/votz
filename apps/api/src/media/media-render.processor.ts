import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import type { MediaFormat } from '@votz/shared-types'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { posterKeyFor } from '../storage/video-poster'
import { MEDIA_RENDER_QUEUE, MediaAssetsService, POST_MEDIA_FOLDER, type RenderVideoJobData } from './media-assets.service'
import { renderVideo } from './media-video'

const extensionOf = (key: string) => key.split('.').pop() ?? 'mp4'

/**
 * Recorta e converte os vídeos das publicações, um por vez (usa muito processador). Só depois de pronto o
 * vídeo aparece para os outros: o original (com os metadados do celular) nunca fica público.
 */
@Processor(MEDIA_RENDER_QUEUE, { concurrency: 1 })
export class MediaRenderProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaRenderProcessor.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly media: MediaAssetsService,
  ) {
    super()
  }

  async process(job: Job<RenderVideoJobData>) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: job.data.assetId } })
    // Repetir o trabalho não converte duas vezes; publicação ou anúncio apagado no meio do caminho não gera arquivo.
    if (!asset || asset.kind !== 'VIDEO' || asset.status !== 'PROCESSING' || (!asset.postId && !asset.adCreativeId)) return { status: 'IGNORADO' as const }
    if (!asset.sourceKey || !asset.format || asset.cropX === null || asset.cropY === null || asset.cropW === null || asset.cropH === null)
      return this.fail(asset.id, 'registro sem original ou sem recorte')

    const source = await this.storage.getObjectBuffer(asset.sourceKey).catch(() => null)
    if (!source) return this.fail(asset.id, 'original não encontrado')

    const result = await renderVideo(source, extensionOf(asset.sourceKey), asset.format as MediaFormat, {
      x: asset.cropX,
      y: asset.cropY,
      w: asset.cropW,
      h: asset.cropH,
    })
    if (result.status === 'FAILED') {
      this.logger.warn(`Vídeo ${asset.id} não pôde ser processado: ${result.reason}`)
      return this.fail(asset.id, result.reason)
    }

    const key = `${POST_MEDIA_FOLDER}/${asset.id}.mp4`
    const posterKey = result.poster ? posterKeyFor(key) : null
    await this.storage.uploadBuffer(key, result.video, 'video/mp4', false)
    if (posterKey && result.poster) await this.storage.uploadBuffer(posterKey, result.poster, 'image/jpeg', false)

    const { count } = await this.prisma.mediaAsset.updateMany({
      where: { id: asset.id, status: 'PROCESSING' },
      data: {
        status: 'READY',
        key,
        feedKey: null,
        posterKey,
        width: result.width,
        height: result.height,
        durationMs: result.durationMs,
        sizeBytes: result.video.byteLength,
        processedAt: new Date(),
        sourceKey: null,
        failureReason: null,
      },
    })
    if (count === 0) {
      // A publicação foi apagada enquanto o vídeo processava: não deixa arquivo sem dono.
      await this.storage.delete(key).catch(() => undefined)
      return { status: 'IGNORADO' as const }
    }
    await this.storage.delete(asset.sourceKey).catch((error) =>
      this.logger.warn(`Original ${asset.sourceKey} ficou no bucket: ${error instanceof Error ? error.message : String(error)}`),
    )
    // Só a publicação guarda os links no próprio registro; o anúncio lê direto do arquivo de mídia.
    if (asset.postId) await this.media.syncPostMedia(asset.postId)
    this.logger.log(`Vídeo ${asset.id} pronto: ${source.byteLength} → ${result.video.byteLength} bytes (${result.width}x${result.height}).`)
    return { status: 'DONE' as const, width: result.width, height: result.height }
  }

  /** Esgotou as tentativas (bucket fora do ar, por exemplo): marca como falha em vez de ficar "processando". */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<RenderVideoJobData> | undefined, error: Error) {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return
    this.logger.error(`Vídeo ${job.data.assetId} desistiu: ${error.message}`)
    await this.fail(job.data.assetId, error.message).catch(() => undefined)
  }

  private async fail(id: string, reason: string) {
    await this.prisma.mediaAsset.updateMany({
      where: { id, status: 'PROCESSING' },
      data: { status: 'FAILED', failureReason: reason.slice(0, 500) },
    })
    return { status: 'FAILED' as const, reason }
  }
}
