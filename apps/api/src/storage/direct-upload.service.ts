import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from './storage.service'
import { MediaProcessingService } from './media-processing'
import { reportMediaKind } from './report-media.service'

/** Arquivos grandes de relato que o app envia direto ao bucket. Foto continua passando pela API (precisa ser reduzida). */
export const DIRECT_UPLOAD_MIME_TYPES = ['video/mp4', 'video/quicktime', 'application/pdf']
const MAX_BYTES: Record<string, number> = {
  'video/mp4': 100 * 1024 * 1024,
  'video/quicktime': 100 * 1024 * 1024,
  'application/pdf': 50 * 1024 * 1024,
}
const LIMIT_LABEL: Record<string, string> = {
  'video/mp4': 'Vídeo excede o limite de 100 MB',
  'video/quicktime': 'Vídeo excede o limite de 100 MB',
  'application/pdf': 'PDF excede o limite de 50 MB',
}
/** Tempo que o endereço de envio vale. */
export const PRESIGN_TTL_SECONDS = 15 * 60
/** Envios iniciados e não concluídos por pessoa ao mesmo tempo. */
export const MAX_OUTSTANDING_UPLOADS = 10
/** Depois disso, um envio que não foi concluído é apagado. */
export const STALE_UPLOAD_HOURS = 2

/** O arquivo chega em `pending/` e só vai para `reports/` (endereço público) depois de conferido. */
export const pendingKeyFor = (finalKey: string) => finalKey.replace(/^reports\//, 'pending/')

/** MP4, MOV e M4A usam o mesmo contêiner: a leitura dos primeiros bytes não separa vídeo de áudio. */
const family = (mime: string) =>
  mime === 'video/mp4' || mime === 'video/quicktime' || mime === 'audio/mp4' ? 'mp4' : mime

/**
 * Envio direto ao bucket para arquivos grandes (vídeo e PDF): a API só assina o endereço e confere o
 * resultado, sem carregar até 100 MB na memória nem segurar a conexão do celular durante o envio.
 */
@Injectable()
export class DirectUploadService {
  private readonly logger = new Logger(DirectUploadService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly processing: MediaProcessingService,
    private readonly config: ConfigService,
  ) {}

  /** Desligue com DIRECT_UPLOAD_ENABLED=false (ex.: bucket sem CORS configurado). Os apps voltam para o envio pela API. */
  enabled(): boolean {
    return this.config.get<string>('DIRECT_UPLOAD_ENABLED') !== 'false'
  }

  async presign(userId: string, input: { mimeType: string; sizeBytes: number }) {
    if (!this.enabled()) throw new NotFoundException()
    const limit = MAX_BYTES[input.mimeType]
    if (!limit) throw new BadRequestException('Tipo de arquivo não permitido para envio direto.')
    if (input.sizeBytes > limit) throw new BadRequestException(LIMIT_LABEL[input.mimeType])

    const outstanding = await this.prisma.reportMedia.count({
      where: { uploaderId: userId, processing: 'UPLOADING' },
    })
    if (outstanding >= MAX_OUTSTANDING_UPLOADS)
      throw new HttpException('Há muitos envios em andamento. Aguarde alguns minutos e tente de novo.', HttpStatus.TOO_MANY_REQUESTS)

    const ext = input.mimeType.split('/')[1].replace('quicktime', 'mov')
    const key = `reports/${randomUUID()}.${ext}`
    // A chave final já fica reservada: é a que o relato vai guardar. O arquivo só chega nela depois da conferência.
    await this.prisma.reportMedia.create({
      data: {
        key,
        uploaderId: userId,
        kind: reportMediaKind(input.mimeType),
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        originalSizeBytes: input.sizeBytes,
        processing: 'UPLOADING',
      },
    })
    const uploadUrl = await this.storage.getSignedUploadUrl(
      pendingKeyFor(key),
      input.mimeType,
      PRESIGN_TTL_SECONDS,
      input.sizeBytes,
    )
    return {
      key,
      url: this.storage.getPublicUrl(key),
      uploadUrl,
      method: 'PUT' as const,
      headers: { 'Content-Type': input.mimeType },
      expiresInSeconds: PRESIGN_TTL_SECONDS,
    }
  }

  /** Confere o que chegou ao bucket e, se estiver certo, publica o arquivo na chave definitiva. */
  async complete(userId: string, key: string) {
    const row = await this.prisma.reportMedia.findUnique({ where: { key } })
    if (!row || row.uploaderId !== userId)
      throw new NotFoundException('Envio não encontrado. Envie o arquivo de novo.')
    // Repetir a confirmação (a resposta se perdeu no caminho) devolve o mesmo resultado.
    if (row.processing !== 'UPLOADING')
      return { key, url: this.storage.getPublicUrl(key), mimeType: row.mimeType, size: row.sizeBytes }

    const pendingKey = pendingKeyFor(key)
    const size = await this.storage.headObjectSize(pendingKey)
    if (size === null)
      throw new BadRequestException('O arquivo não chegou ao servidor. Envie de novo.')
    const limit = MAX_BYTES[row.mimeType] ?? 0
    if (size === 0 || size > limit) {
      await this.reject(row.key, pendingKey)
      throw new BadRequestException(size === 0 ? 'O arquivo enviado está vazio.' : LIMIT_LABEL[row.mimeType])
    }
    const sniffed = await this.storage.sniffObjectMime(pendingKey)
    if (!sniffed || family(sniffed) !== family(row.mimeType)) {
      await this.reject(row.key, pendingKey)
      throw new BadRequestException('Tipo de arquivo não permitido ou não reconhecido')
    }

    await this.storage.moveObject(pendingKey, key, row.mimeType)
    const isVideo = row.mimeType.startsWith('video/')
    await this.prisma.reportMedia.update({
      where: { key },
      data: { sizeBytes: size, originalSizeBytes: size, processing: isVideo ? 'PENDING' : 'NONE' },
    })
    // A capa do vídeo sai na conversão (o arquivo grande não passa pela API aqui).
    if (isVideo) await this.processing.enqueueVideo(key, { poster: true })
    return { key, url: this.storage.getPublicUrl(key), mimeType: row.mimeType, size }
  }

  /** Apaga o que foi enviado e recusado (tipo errado, vazio, grande demais) e libera a chave reservada. */
  private async reject(key: string, pendingKey: string) {
    await this.storage.delete(pendingKey).catch((error) =>
      this.logger.warn(`Não foi possível apagar o envio recusado ${pendingKey}: ${error instanceof Error ? error.message : String(error)}`),
    )
    await this.prisma.reportMedia.delete({ where: { key } }).catch(() => undefined)
  }

  /** De hora em hora apaga os envios que começaram e nunca foram confirmados (celular sem sinal, app fechado). */
  @Cron('30 * * * *')
  async purgeStaleUploads(): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_UPLOAD_HOURS * 60 * 60 * 1000)
    const stale = await this.prisma.reportMedia.findMany({
      where: { processing: 'UPLOADING', createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { key: true },
    })
    let purged = 0
    for (const row of stale) {
      try {
        await this.storage.delete(pendingKeyFor(row.key))
      } catch (error) {
        // Mantém a linha para tentar de novo na próxima hora.
        this.logger.warn(`Não foi possível apagar o envio parado ${row.key}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      await this.prisma.reportMedia.delete({ where: { key: row.key } })
      purged += 1
    }
    return purged
  }
}
