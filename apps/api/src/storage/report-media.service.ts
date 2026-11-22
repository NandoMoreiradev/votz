import { BadRequestException, ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService, type UploadedFile } from './storage.service'
import { MediaProcessingService } from './media-processing'
import { nearestMediaFormat, type MediaItemDto } from '@votz/shared-types'
import { thumbKeyFor } from './image-normalize'
import { posterKeyFor } from './video-poster'

const VIDEO_URL = /\.(mp4|mov|m4v|webm)(\?|#|$)/i
const IMAGE_URL = /\.(jpe?g|png|webp|gif)(\?|#|$)/i

/** Quanto tempo um arquivo enviado para relato espera ser anexado antes de ser apagado. */
export const REPORT_MEDIA_ORPHAN_DAYS = 7
/** Depois disso, um vídeo ainda "na fila" é recolocado na fila. */
export const VIDEO_STUCK_MINUTES = 60
const PURGE_BATCH = 200

export function reportMediaKind(mimeType: string): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'PDF' {
  if (mimeType.startsWith('image/')) return 'IMAGE'
  if (mimeType.startsWith('video/')) return 'VIDEO'
  if (mimeType.startsWith('audio/')) return 'AUDIO'
  return 'PDF'
}

/**
 * Controle dos arquivos enviados para relato: anota cada envio, marca o que foi anexado a um relato,
 * atualização ou contestação, e apaga o que ninguém anexou depois do prazo (a pessoa desistiu do relato).
 * Arquivos de antes desta tabela não têm linha e nunca são apagados por aqui.
 */
@Injectable()
export class ReportMediaService {
  private readonly logger = new Logger(ReportMediaService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Optional() private readonly processing?: MediaProcessingService,
  ) {}

  /** Anota o envio. Se não der para anotar, o arquivo continua valendo: só fica fora da limpeza automática. */
  async register(file: UploadedFile, uploaderId: string): Promise<void> {
    const kind = reportMediaKind(file.mimeType)
    try {
      await this.prisma.reportMedia.create({
        data: {
          key: file.key,
          uploaderId,
          kind,
          mimeType: file.mimeType,
          sizeBytes: file.size,
          originalSizeBytes: file.originalSize ?? file.size,
          width: file.width ?? null,
          height: file.height ?? null,
          hasThumb: !!file.thumbUrl,
          // Vídeo espera a conversão para 1080p; o resto não passa por esse processamento.
          processing: kind === 'VIDEO' ? 'PENDING' : 'NONE',
        },
      })
    } catch (error) {
      this.logger.warn(`Não foi possível anotar o envio ${file.key}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Fotos e vídeos do relato com tamanho e moldura, na ordem dos links. Relato NÃO é recortado (foto é prova):
   * aparece inteiro (`contain`) na moldura do formato mais próximo. PDF e áudio ficam de fora (só em `media`).
   * Arquivos de antes da tabela `report_media` vêm sem tamanho: o app mede ao carregar.
   */
  async itemsFor(urls: string[] | undefined): Promise<MediaItemDto[]> {
    const list = (urls ?? []).map((url) => ({ url, key: this.storage.extractKeyFromUrl(url) }))
    const keys = list.map((item) => item.key).filter((key): key is string => !!key)
    const rows = keys.length
      ? await this.prisma.reportMedia
          .findMany({ where: { key: { in: keys } }, select: { key: true, kind: true, width: true, height: true, hasThumb: true, durationMs: true } })
          .catch(() => [])
      : []
    const byKey = new Map(rows.map((row) => [row.key, row]))
    const items: MediaItemDto[] = []
    for (const { url, key } of list) {
      const row = key ? byKey.get(key) : undefined
      const kind = row?.kind ?? (VIDEO_URL.test(url) ? 'VIDEO' : IMAGE_URL.test(url) ? 'IMAGE' : null)
      if (kind !== 'IMAGE' && kind !== 'VIDEO') continue
      const thumbKey = row?.hasThumb && key ? thumbKeyFor(key) : null
      items.push({
        id: null,
        kind: /\.gif(\?|$)/i.test(url) ? 'GIF' : kind,
        format: nearestMediaFormat(row?.width, row?.height),
        fit: 'contain',
        width: row?.width ?? null,
        height: row?.height ?? null,
        url,
        fullUrl: url,
        thumbUrl: thumbKey ? this.storage.getPublicUrl(thumbKey) : null,
        posterUrl: kind === 'VIDEO' ? posterKeyFor(url) : null,
        status: 'READY',
        durationMs: row?.durationMs ?? null,
      })
    }
    return items
  }

  private keysOf(urls: string[] | undefined): string[] {
    return [
      ...new Set(
        (urls ?? [])
          .map((url) => this.storage.extractKeyFromUrl(url))
          .filter((key): key is string => !!key),
      ),
    ]
  }

  /**
   * Usada ao anexar mídia a um relato, atualização ou contestação: confere que os arquivos são da própria
   * pessoa e só então os marca como usados. Sem isso, quem copiasse o endereço de uma foto de outro relato
   * (ele é público) poderia anexá-la ao seu como se fosse sua, e o arquivo de outra pessoa ainda seria
   * considerado "usado" e escaparia da limpeza dela.
   *
   * Arquivos de antes da tabela `report_media` não têm linha e continuam valendo (não há como saber de quem são).
   * Falha ao consultar o banco NÃO libera o anexo: sem conferir, não anexa.
   */
  async attach(urls: string[] | undefined, userId: string): Promise<void> {
    const keys = this.keysOf(urls)
    if (!keys.length) return
    const rows = await this.prisma.reportMedia.findMany({
      where: { key: { in: keys } },
      select: { key: true, uploaderId: true, processing: true },
    })
    for (const row of rows) {
      if (row.uploaderId !== userId)
        throw new ForbiddenException('Você só pode anexar arquivos que você mesmo enviou.')
      if (row.processing === 'UPLOADING')
        throw new BadRequestException('Um dos arquivos ainda não terminou de ser enviado. Aguarde e tente de novo.')
    }
    await this.markKeys(keys)
  }

  /** Marca como usados os arquivos que o relato, a atualização ou a contestação acabou de aceitar. */
  private async markKeys(keys: string[]): Promise<void> {
    if (!keys.length) return
    try {
      await this.prisma.reportMedia.updateMany({
        // Envio direto ainda não confirmado não conta como usado: o arquivo nem está na chave definitiva.
        where: { key: { in: keys }, attachedAt: null, processing: { not: 'UPLOADING' } },
        data: { attachedAt: new Date() },
      })
    } catch (error) {
      this.logger.warn(`Não foi possível marcar a mídia como usada: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * De hora em hora recoloca na fila os vídeos que seguem "na fila" há mais de VIDEO_STUCK_MINUTES (o Redis
   * pode ter estado fora do ar quando o arquivo chegou). Repetir é seguro: a conversão confere o estado antes.
   */
  @Cron('0 * * * *')
  async requeueStuckVideos(): Promise<number> {
    if (!this.processing) return 0
    const cutoff = new Date(Date.now() - VIDEO_STUCK_MINUTES * 60 * 1000)
    const stuck = await this.prisma.reportMedia.findMany({
      where: { kind: 'VIDEO', processing: 'PENDING', createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { key: true },
    })
    let queued = 0
    for (const row of stuck) if (await this.processing.enqueueVideo(row.key)) queued += 1
    return queued
  }

  /** Todo dia apaga do bucket os envios que ninguém anexou em REPORT_MEDIA_ORPHAN_DAYS dias. */
  @Cron('0 5 * * *')
  async purgeOrphans(): Promise<number> {
    const cutoff = new Date(Date.now() - REPORT_MEDIA_ORPHAN_DAYS * 24 * 60 * 60 * 1000)
    const orphans = await this.prisma.reportMedia.findMany({
      where: { attachedAt: null, createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: PURGE_BATCH,
      select: { id: true, key: true },
    })
    let purged = 0
    for (const row of orphans) {
      try {
        await this.storage.delete(row.key)
      } catch (error) {
        // Mantém a linha: amanhã tenta de novo, em vez de deixar o arquivo esquecido no bucket.
        this.logger.warn(`Não foi possível apagar o arquivo sem uso ${row.key}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      await this.prisma.reportMedia.delete({ where: { id: row.id } })
      purged += 1
    }
    if (purged) this.logger.log(`${purged} arquivo(s) de relato sem uso apagado(s).`)
    return purged
  }
}
