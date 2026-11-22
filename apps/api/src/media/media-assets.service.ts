import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectQueue } from '@nestjs/bullmq'
import { Cron } from '@nestjs/schedule'
import type { Queue } from 'bullmq'
import { randomUUID } from 'crypto'
import type { MediaAssetPurpose, Prisma } from '@prisma/client'
import {
  MEDIA_FORMATS,
  POST_MEDIA_MAX_ITEMS,
  adMediaProblem,
  defaultCrop,
  validateMediaCrop,
  type MediaCrop,
  type MediaFormat,
  type MediaItemDto,
  type UploadedMediaAssetDto,
} from '@votz/shared-types'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService, detectMimeFromBuffer } from '../storage/storage.service'
import { thumbKeyFor } from '../storage/image-normalize'
import { MEDIA_VIDEO_MAX_BYTES, type PostMediaInputDto } from './dto/media.dto'
import { gifSize, prepareImageSource, renderImageVariants } from './media-image'
import { MEDIA_ASSET_VIEW_SELECT, itemsForPost, type MediaAssetView } from './media-items'
import { probeVideoBuffer } from './media-video'

export const MEDIA_RENDER_QUEUE = 'media-render'
export const RENDER_VIDEO_JOB = 'render-video'
export interface RenderVideoJobData {
  assetId: string
}

/** Pasta privada dos originais (fora das pastas públicas do bucket; a chave nunca vai para os apps). */
export const MEDIA_SOURCE_PREFIX = 'media-src'
/** Pasta pública dos arquivos gerados para publicações. */
export const POST_MEDIA_FOLDER = 'posts'

const IMAGE_MAX_BYTES = 10 * 1024 * 1024
const GIF_MAX_BYTES = 10 * 1024 * 1024
/** Arquivos enviados e ainda não publicados, por pessoa. */
export const MAX_MEDIA_DRAFTS = 20
/** Envio que ninguém publicou é apagado depois disso. */
export const MEDIA_DRAFT_HOURS = 24
/** Envio direto que nunca foi confirmado. */
export const MEDIA_STALE_UPLOAD_HOURS = 2
/** Vídeo "processando" há mais que isso volta para a fila. */
export const MEDIA_STUCK_MINUTES = 60
/** Original de vídeo que falhou fica para análise por este tempo. */
export const MEDIA_FAILED_SOURCE_DAYS = 7
export const MEDIA_PRESIGN_TTL_SECONDS = 15 * 60

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime'])
const extensionOf = (mime: string) => mime.split('/')[1].replace('quicktime', 'mov')
const extensionOfKey = (key: string) => key.split('.').pop() ?? 'mp4'
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

type Kind = 'IMAGE' | 'VIDEO' | 'GIF'

export interface PreparedPostMedia {
  items: Array<{ id: string; kind: Kind; position: number }>
  /** Links que vão em `Post.media` (clientes antigos): versão do feed dos itens prontos, na ordem. */
  media: string[]
  /** Todas as chaves no bucket, para apagar junto com a publicação. */
  mediaKeys: string[]
  /** Chaves geradas nesta preparação (apagadas se a publicação não for criada). */
  renderedKeys: string[]
}

/**
 * Fotos e vídeos das publicações no padrão de formatos. O app envia o arquivo (o original fica privado,
 * sem metadados), a pessoa escolhe formato e enquadramento, e ao publicar o servidor recorta e gera as
 * versões: foto na hora; vídeo em segundo plano (fila `media-render`).
 */
@Injectable()
export class MediaAssetsService {
  private readonly logger = new Logger(MediaAssetsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    @Optional() @InjectQueue(MEDIA_RENDER_QUEUE) private readonly queue?: Queue<RenderVideoJobData>,
  ) {}

  // ─── Envio ────────────────────────────────────────────────────────────────────────────────────

  /**
   * Recebe o arquivo pela API (até 100 MB). Vídeos grandes devem usar o envio direto (presign/complete).
   * `AD_CREATIVE` (criativo de anúncio) aplica as exigências de anúncio já aqui, para o anunciante saber na hora.
   */
  async upload(userId: string, buffer: Buffer, purpose: MediaAssetPurpose = 'POST'): Promise<UploadedMediaAssetDto> {
    const mime = detectMimeFromBuffer(buffer)
    const kind: Kind | null = IMAGE_MIMES.has(mime) ? 'IMAGE' : mime === 'image/gif' ? 'GIF' : VIDEO_MIMES.has(mime) ? 'VIDEO' : null
    if (!kind) throw new BadRequestException('Envie uma foto (JPEG, PNG ou WebP), um GIF ou um vídeo (MP4 ou MOV).')
    this.assertAdFile(purpose, kind, null, null)
    const limit = kind === 'VIDEO' ? MEDIA_VIDEO_MAX_BYTES : kind === 'GIF' ? GIF_MAX_BYTES : IMAGE_MAX_BYTES
    if (buffer.byteLength > limit)
      throw new BadRequestException(kind === 'VIDEO' ? 'O vídeo passa de 100 MB.' : kind === 'GIF' ? 'O GIF passa de 10 MB.' : 'A foto passa de 10 MB.')
    await this.assertDraftQuota(userId)

    const id = randomUUID()
    if (kind === 'IMAGE') {
      const source = await prepareImageSource(buffer).catch(() => {
        throw new BadRequestException('Não foi possível ler essa foto. Tente outra.')
      })
      this.assertAdFile(purpose, kind, source.width, null)
      const sourceKey = `${MEDIA_SOURCE_PREFIX}/${id}.${extensionOf(source.mimeType)}`
      await this.storage.uploadBuffer(sourceKey, source.data, source.mimeType, true)
      await this.createRow([sourceKey], {
        id,
        uploaderId: userId,
        purpose,
        kind,
        status: 'UPLOADED',
        sourceKey,
        sourceMime: source.mimeType,
        sourceSizeBytes: buffer.byteLength,
        sourceWidth: source.width,
        sourceHeight: source.height,
      })
      return { id, kind, width: source.width, height: source.height, durationMs: null }
    }

    if (kind === 'GIF') {
      const size = await gifSize(buffer)
      if (!size) throw new BadRequestException('Não foi possível ler esse GIF. Tente outro.')
      // GIF não é recortado (aparece inteiro na moldura): já vai para a pasta pública, sem original separado.
      const key = `${POST_MEDIA_FOLDER}/${id}.gif`
      await this.storage.uploadBuffer(key, buffer, 'image/gif', false)
      await this.createRow([key], {
        id,
        uploaderId: userId,
        kind,
        status: 'UPLOADED',
        sourceMime: 'image/gif',
        sourceSizeBytes: buffer.byteLength,
        sourceWidth: size.width,
        sourceHeight: size.height,
        key,
        width: size.width,
        height: size.height,
        sizeBytes: buffer.byteLength,
      })
      return { id, kind, width: size.width, height: size.height, durationMs: null }
    }

    const ext = extensionOf(mime)
    const probe = await probeVideoBuffer(buffer, ext)
    if (!probe) throw new BadRequestException('Não foi possível ler esse vídeo. Tente outro.')
    this.assertAdFile(purpose, kind, probe.width, probe.durationMs)
    const sourceKey = `${MEDIA_SOURCE_PREFIX}/${id}.${ext}`
    await this.storage.uploadBuffer(sourceKey, buffer, mime, true)
    await this.createRow([sourceKey], {
      id,
      uploaderId: userId,
      purpose,
      kind,
      status: 'UPLOADED',
      sourceKey,
      sourceMime: mime,
      sourceSizeBytes: buffer.byteLength,
      sourceWidth: probe.width,
      sourceHeight: probe.height,
      durationMs: probe.durationMs,
    })
    return { id, kind, width: probe.width, height: probe.height, durationMs: probe.durationMs }
  }

  /** Desligue com DIRECT_UPLOAD_ENABLED=false (bucket sem CORS). Os apps voltam para o envio pela API. */
  directUploadEnabled(): boolean {
    return this.config.get<string>('DIRECT_UPLOAD_ENABLED') !== 'false'
  }

  /** Endereço para o app mandar o vídeo direto ao bucket (PUT), sem passar os bytes pela API. */
  async presign(userId: string, input: { mimeType: string; sizeBytes: number }, purpose: MediaAssetPurpose = 'POST') {
    if (!this.directUploadEnabled()) throw new NotFoundException()
    if (!VIDEO_MIMES.has(input.mimeType)) throw new BadRequestException('O envio direto é só para vídeo MP4 ou MOV.')
    if (input.sizeBytes > MEDIA_VIDEO_MAX_BYTES) throw new BadRequestException('O vídeo passa de 100 MB.')
    await this.assertDraftQuota(userId)

    const id = randomUUID()
    const sourceKey = `${MEDIA_SOURCE_PREFIX}/${id}.${extensionOf(input.mimeType)}`
    await this.prisma.mediaAsset.create({
      data: {
        id,
        uploaderId: userId,
        purpose,
        kind: 'VIDEO',
        status: 'UPLOADING',
        sourceKey,
        sourceMime: input.mimeType,
        sourceSizeBytes: input.sizeBytes,
      },
    })
    const uploadUrl = await this.storage.getSignedUploadUrl(sourceKey, input.mimeType, MEDIA_PRESIGN_TTL_SECONDS, input.sizeBytes)
    return {
      id,
      uploadUrl,
      method: 'PUT' as const,
      headers: { 'Content-Type': input.mimeType },
      expiresInSeconds: MEDIA_PRESIGN_TTL_SECONDS,
    }
  }

  /** Confere o vídeo que chegou ao bucket (tamanho, tipo real, se abre) e libera para publicar. */
  async complete(userId: string, id: string): Promise<UploadedMediaAssetDto> {
    const row = await this.prisma.mediaAsset.findFirst({ where: { id, uploaderId: userId } })
    if (!row || !row.sourceKey) throw new NotFoundException('Envio não encontrado. Envie o arquivo de novo.')
    // Repetir a confirmação (a resposta se perdeu no caminho) devolve o mesmo resultado.
    if (row.status !== 'UPLOADING') {
      if (row.sourceWidth && row.sourceHeight)
        return { id, kind: row.kind, width: row.sourceWidth, height: row.sourceHeight, durationMs: row.durationMs }
      throw new NotFoundException('Envio não encontrado. Envie o arquivo de novo.')
    }

    const size = await this.storage.headObjectSize(row.sourceKey)
    if (size === null) throw new BadRequestException('O vídeo não chegou ao servidor. Envie de novo.')
    if (size === 0 || size !== row.sourceSizeBytes || size > MEDIA_VIDEO_MAX_BYTES) {
      await this.discardRow(row)
      throw new BadRequestException(size === 0 ? 'O arquivo enviado está vazio.' : 'O vídeo não chegou inteiro. Envie de novo.')
    }
    const sniffed = await this.storage.sniffObjectMime(row.sourceKey)
    if (!VIDEO_MIMES.has(sniffed)) {
      await this.discardRow(row)
      throw new BadRequestException('Tipo de arquivo não permitido ou não reconhecido.')
    }
    const buffer = await this.storage.getObjectBuffer(row.sourceKey)
    const probe = buffer ? await probeVideoBuffer(buffer, extensionOfKey(row.sourceKey)) : null
    if (!probe) {
      await this.discardRow(row)
      throw new BadRequestException('Não foi possível ler esse vídeo. Tente outro.')
    }
    const adProblem = row.purpose === 'AD_CREATIVE' ? adMediaProblem({ kind: 'VIDEO', width: probe.width, durationMs: probe.durationMs, scope: 'file' }) : null
    if (adProblem) {
      await this.discardRow(row)
      throw new BadRequestException(adProblem)
    }
    await this.prisma.mediaAsset.update({
      where: { id },
      data: { status: 'UPLOADED', sourceWidth: probe.width, sourceHeight: probe.height, durationMs: probe.durationMs },
    })
    return { id, kind: 'VIDEO', width: probe.width, height: probe.height, durationMs: probe.durationMs }
  }

  /** A pessoa tirou o arquivo antes de publicar. */
  async discard(userId: string, id: string): Promise<void> {
    const row = await this.prisma.mediaAsset.findFirst({ where: { id, uploaderId: userId, postId: null, adCreativeId: null } })
    if (!row) throw new NotFoundException('Arquivo não encontrado.')
    if (row.status === 'PROCESSING') throw new BadRequestException('Esse arquivo já está sendo publicado.')
    await this.discardRow(row)
  }

  // ─── Publicar ─────────────────────────────────────────────────────────────────────────────────

  /**
   * Confere e prepara os arquivos de uma publicação ANTES de ela ser criada: dono, estado, mesmo formato
   * para todos, recorte válido. Reserva os arquivos (ninguém mais publica o mesmo) e já gera as versões das
   * fotos. Se a publicação não for criada, chame `releaseForPost`.
   */
  prepareForPost(userId: string, inputs: readonly PostMediaInputDto[]): Promise<PreparedPostMedia> {
    return this.prepare(userId, inputs, 'POST')
  }

  /**
   * Igual a `prepareForPost`, para o criativo de um anúncio: uma foto ou um vídeo, enviado como `AD_CREATIVE`, com as
   * exigências de anúncio (largura mínima da parte mostrada, vídeo de até 60 s, sem GIF). Depois de criar o criativo,
   * chame `finalizeForAdCreative`; se ele não for criado, `releaseForPost`.
   */
  prepareForAdCreative(userId: string, input: PostMediaInputDto): Promise<PreparedPostMedia> {
    return this.prepare(userId, [input], 'AD_CREATIVE')
  }

  private async prepare(userId: string, inputs: readonly PostMediaInputDto[], purpose: MediaAssetPurpose): Promise<PreparedPostMedia> {
    const forAd = purpose === 'AD_CREATIVE'
    if (forAd && inputs.length > 1) throw new BadRequestException('O anúncio aceita uma foto ou um vídeo.')
    if (inputs.length > POST_MEDIA_MAX_ITEMS)
      throw new BadRequestException(`Uma publicação pode ter até ${POST_MEDIA_MAX_ITEMS} fotos ou vídeos.`)
    const ids = inputs.map((input) => input.id)
    if (new Set(ids).size !== ids.length) throw new BadRequestException('O mesmo arquivo apareceu duas vezes.')
    const format = inputs[0].format
    if (inputs.some((input) => input.format !== format))
      throw new BadRequestException('Todas as fotos e vídeos da publicação precisam ter o mesmo formato.')

    const rows = await this.prisma.mediaAsset.findMany({ where: { id: { in: ids }, uploaderId: userId } })
    const byId = new Map(rows.map((row) => [row.id, row]))
    const plan = inputs.map((input, position) => {
      const row = byId.get(input.id)
      if (!row || row.purpose !== purpose || row.postId || row.adCreativeId) throw new BadRequestException('Um dos arquivos não está disponível. Envie de novo.')
      if (row.status === 'UPLOADING') throw new BadRequestException('Um dos vídeos ainda não terminou de ser enviado. Aguarde e tente de novo.')
      if (row.status !== 'UPLOADED') throw new BadRequestException('Um dos arquivos já foi usado. Envie de novo.')
      if (row.kind === 'GIF') {
        const gifProblem = forAd ? adMediaProblem({ kind: 'GIF', width: row.sourceWidth ?? 0, scope: 'file' }) : null
        if (gifProblem) throw new BadRequestException(gifProblem)
        return { row, position, crop: null as MediaCrop | null }
      }
      if (!row.sourceWidth || !row.sourceHeight || !row.sourceKey) throw new BadRequestException('Um dos arquivos não está disponível. Envie de novo.')
      const crop = input.crop ?? defaultCrop(row.sourceWidth, row.sourceHeight, format)
      const problem = validateMediaCrop(row.sourceWidth, row.sourceHeight, format, crop)
      if (problem) throw new BadRequestException(problem)
      // Anúncio: o que importa é a largura da parte que aparece (o recorte), não a do arquivo inteiro.
      const adProblem = forAd
        ? adMediaProblem({ kind: row.kind, width: Math.round(crop.w * row.sourceWidth), durationMs: row.durationMs, scope: 'crop' })
        : null
      if (adProblem) throw new BadRequestException(adProblem)
      return { row, position, crop }
    })

    // Reserva um por um: se outro pedido (dois toques em "Publicar") pegou algum, devolve só os que este reservou.
    const claimed: string[] = []
    for (const item of plan) {
      const { count } = await this.prisma.mediaAsset.updateMany({
        where: { id: item.row.id, status: 'UPLOADED', postId: null },
        data: {
          status: 'PROCESSING',
          format,
          cropX: item.crop?.x ?? null,
          cropY: item.crop?.y ?? null,
          cropW: item.crop?.w ?? null,
          cropH: item.crop?.h ?? null,
        },
      })
      if (count !== 1) {
        await this.unclaim(claimed)
        throw new BadRequestException('Um dos arquivos já está sendo publicado.')
      }
      claimed.push(item.row.id)
    }

    const prepared: PreparedPostMedia = { items: [], media: [], mediaKeys: [], renderedKeys: [] }
    try {
      for (const item of plan) {
        const { row } = item
        prepared.items.push({ id: row.id, kind: row.kind, position: item.position })
        if (row.sourceKey) prepared.mediaKeys.push(row.sourceKey)
        if (row.kind === 'GIF') {
          if (row.key) {
            prepared.mediaKeys.push(row.key)
            prepared.media.push(this.storage.getPublicUrl(row.key))
          }
          continue
        }
        if (row.kind === 'VIDEO') {
          // O vídeo sai recortado da fila; a chave final já é conhecida (para apagar junto com a publicação).
          const videoKey = `${POST_MEDIA_FOLDER}/${row.id}.mp4`
          prepared.mediaKeys.push(videoKey)
          continue
        }
        const rendered = await this.renderImage(row.id, row.sourceKey!, format, item.crop!)
        prepared.renderedKeys.push(...rendered.keys)
        prepared.mediaKeys.push(...rendered.keys)
        prepared.media.push(this.storage.getPublicUrl(rendered.feedKey))
      }
    } catch (error) {
      await this.releaseForPost(prepared, claimed)
      if (error instanceof HttpException) throw error
      this.logger.warn(`Falha ao preparar mídia da publicação: ${errorText(error)}`)
      throw new BadRequestException('Não foi possível preparar uma das fotos. Tente de novo.')
    }
    return prepared
  }

  /** Liga os arquivos preparados à publicação criada. Foto e GIF ficam prontos; vídeo entra na fila. */
  finalizeForPost(postId: string, prepared: PreparedPostMedia): Promise<void> {
    return this.finalize({ postId }, prepared)
  }

  /**
   * Liga a mídia preparada ao criativo, DENTRO da transação que cria o criativo (o chamador passa o `tx`): ou o
   * anúncio nasce com a foto ou o vídeo, ou não nasce. Depois do commit, chame `afterAttach`.
   */
  async attachToAdCreative(tx: Prisma.TransactionClient, adCreativeId: string, prepared: PreparedPostMedia): Promise<void> {
    const now = new Date()
    for (const item of prepared.items) await tx.mediaAsset.update(this.attachArgs({ adCreativeId }, item, now))
  }

  /** Depois de gravar a ligação: o vídeo entra na fila e o original da foto é apagado. Não falha o chamador (só registra). */
  async afterAttach(prepared: PreparedPostMedia): Promise<void> {
    try {
      await this.afterAttachSteps(prepared)
    } catch (error) {
      this.logger.error(`Pós-processamento da mídia falhou: ${errorText(error)}`)
    }
  }

  /**
   * Tira da transação do anúncio a foto ou o vídeo que ele tinha (a linha some junto) e devolve os arquivos do bucket para
   * apagar DEPOIS do commit com `dropKeys`: se a troca falhar, nada se perde. Devolve vazio se o anúncio era só texto.
   */
  async removeAdCreativeMedia(tx: Prisma.TransactionClient, adCreativeId: string): Promise<string[]> {
    const old = await tx.mediaAsset.findUnique({
      where: { adCreativeId },
      select: { id: true, sourceKey: true, key: true, feedKey: true, thumbKey: true, posterKey: true },
    })
    if (!old) return []
    await tx.mediaAsset.delete({ where: { id: old.id } })
    return [old.sourceKey, old.key, old.feedKey, old.thumbKey, old.posterKey].filter((key): key is string => !!key)
  }

  /** Apaga arquivos do bucket sem falhar o chamador (o que sobrar é só registrado). */
  async dropKeys(keys: readonly string[]): Promise<void> {
    for (const key of keys) await this.deleteQuietly(key)
  }

  private async finalize(owner: { postId: string }, prepared: PreparedPostMedia): Promise<void> {
    if (!prepared.items.length) return
    const now = new Date()
    await this.prisma.$transaction(prepared.items.map((item) => this.prisma.mediaAsset.update(this.attachArgs(owner, item, now))))
    await this.afterAttachSteps(prepared)
  }

  private attachArgs(owner: { postId: string } | { adCreativeId: string }, item: PreparedPostMedia['items'][number], now: Date) {
    return {
      where: { id: item.id },
      data: {
        ...owner,
        position: item.position,
        attachedAt: now,
        ...(item.kind === 'VIDEO' ? {} : { status: 'READY' as const, processedAt: now }),
      },
    }
  }

  private async afterAttachSteps(prepared: PreparedPostMedia): Promise<void> {
    for (const item of prepared.items) if (item.kind === 'VIDEO') await this.enqueueVideo(item.id)
    // O original da foto não é mais necessário (as versões já foram geradas): não pagamos armazenamento duas vezes.
    const imageIds = prepared.items.filter((item) => item.kind === 'IMAGE').map((item) => item.id)
    if (imageIds.length) await this.dropImageSources(imageIds)
  }

  /** Desfaz `prepareForPost` (a publicação não foi criada): apaga as versões geradas e libera os arquivos. */
  async releaseForPost(prepared: PreparedPostMedia, ids: readonly string[] = prepared.items.map((item) => item.id)): Promise<void> {
    for (const key of prepared.renderedKeys) await this.deleteQuietly(key)
    await this.unclaim(ids)
  }

  // ─── Leitura ──────────────────────────────────────────────────────────────────────────────────

  /** Itens de mídia de várias publicações de uma vez (uma consulta). */
  async itemsForPosts(posts: ReadonlyArray<{ id: string; media: readonly string[] }>): Promise<Map<string, MediaItemDto[]>> {
    const result = new Map<string, MediaItemDto[]>()
    if (!posts.length) return result
    const rows = await this.prisma.mediaAsset.findMany({
      where: { postId: { in: posts.map((post) => post.id) } },
      orderBy: [{ postId: 'asc' }, { position: 'asc' }],
      select: { ...MEDIA_ASSET_VIEW_SELECT, postId: true },
    })
    const grouped = new Map<string, MediaAssetView[]>()
    for (const row of rows) {
      if (!row.postId) continue
      const list = grouped.get(row.postId) ?? []
      list.push(row)
      grouped.set(row.postId, list)
    }
    const publicUrl = (key: string) => this.storage.getPublicUrl(key)
    for (const post of posts) result.set(post.id, itemsForPost(grouped.get(post.id), post.media, publicUrl))
    return result
  }

  // ─── Vídeo (chamado pelo processador da fila) ─────────────────────────────────────────────────

  async enqueueVideo(assetId: string): Promise<boolean> {
    if (!this.queue) return false
    try {
      await this.queue.add(RENDER_VIDEO_JOB, { assetId }, { jobId: `render-video-${assetId}`, attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 1000, removeOnFail: 1000 })
      return true
    } catch (error) {
      this.logger.warn(`Não foi possível enfileirar o vídeo ${assetId}: ${errorText(error)}`)
      return false
    }
  }

  /** Recria `Post.media` (clientes antigos) e `Post.mediaKeys` a partir dos arquivos prontos, na ordem. */
  async syncPostMedia(postId: string): Promise<void> {
    const [post, assets] = await Promise.all([
      this.prisma.post.findUnique({ where: { id: postId }, select: { mediaKeys: true } }),
      this.prisma.mediaAsset.findMany({ where: { postId }, orderBy: { position: 'asc' } }),
    ])
    if (!post) return
    const media = assets
      .filter((asset) => asset.status === 'READY' && asset.key)
      .map((asset) => this.storage.getPublicUrl(asset.feedKey ?? asset.key!))
    const keys = new Set(post.mediaKeys)
    for (const asset of assets)
      for (const key of [asset.sourceKey, asset.key, asset.feedKey, asset.thumbKey, asset.posterKey]) if (key) keys.add(key)
    await this.prisma.post.update({ where: { id: postId }, data: { media, mediaKeys: [...keys] } })
  }

  // ─── Limpeza ──────────────────────────────────────────────────────────────────────────────────

  /** De hora em hora: apaga envios não publicados (24 h) e envios diretos nunca confirmados (2 h). */
  @Cron('15 * * * *')
  async purgeDrafts(): Promise<number> {
    const now = Date.now()
    const rows = await this.prisma.mediaAsset.findMany({
      where: {
        postId: null,
        adCreativeId: null,
        OR: [
          { status: 'UPLOADED', createdAt: { lt: new Date(now - MEDIA_DRAFT_HOURS * 3_600_000) } },
          { status: 'UPLOADING', createdAt: { lt: new Date(now - MEDIA_STALE_UPLOAD_HOURS * 3_600_000) } },
          // Reservado e nunca publicado (a API caiu no meio da publicação).
          { status: 'PROCESSING', updatedAt: { lt: new Date(now - MEDIA_DRAFT_HOURS * 3_600_000) } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })
    let purged = 0
    for (const row of rows) if (await this.discardRow(row)) purged += 1
    if (purged) this.logger.log(`${purged} envio(s) de mídia sem publicação apagado(s).`)
    return purged
  }

  /** De hora em hora: vídeo de publicação ou de anúncio parado em "processando" volta para a fila (o Redis pode ter caído). */
  @Cron('40 * * * *')
  async requeueStuckVideos(): Promise<number> {
    const rows = await this.prisma.mediaAsset.findMany({
      where: {
        kind: 'VIDEO',
        status: 'PROCESSING',
        OR: [{ postId: { not: null } }, { adCreativeId: { not: null } }],
        updatedAt: { lt: new Date(Date.now() - MEDIA_STUCK_MINUTES * 60_000) },
      },
      orderBy: { updatedAt: 'asc' },
      take: 50,
      select: { id: true },
    })
    let queued = 0
    for (const row of rows) {
      // Retira o trabalho antigo (concluído ou com falha) para o mesmo jobId poder entrar de novo.
      await this.queue?.remove(`render-video-${row.id}`).catch(() => undefined)
      if (await this.enqueueVideo(row.id)) queued += 1
    }
    return queued
  }

  /** Todo dia: apaga o original dos vídeos que falharam há mais de uma semana. */
  @Cron('20 4 * * *')
  async purgeFailedSources(): Promise<number> {
    const rows = await this.prisma.mediaAsset.findMany({
      where: {
        status: 'FAILED',
        sourceKey: { not: null },
        updatedAt: { lt: new Date(Date.now() - MEDIA_FAILED_SOURCE_DAYS * 86_400_000) },
      },
      take: 200,
      select: { id: true, sourceKey: true },
    })
    for (const row of rows) {
      if (row.sourceKey && !(await this.deleteQuietly(row.sourceKey))) continue
      await this.prisma.mediaAsset.update({ where: { id: row.id }, data: { sourceKey: null } })
    }
    return rows.length
  }

  // ─── Internos ─────────────────────────────────────────────────────────────────────────────────

  /** Exigências de anúncio na hora do envio (no arquivo inteiro). Largura e duração vêm nulas quando ainda não se sabe. */
  private assertAdFile(purpose: MediaAssetPurpose, kind: Kind, width: number | null, durationMs: number | null) {
    if (purpose !== 'AD_CREATIVE') return
    const problem = adMediaProblem({ kind, width: width ?? Number.MAX_SAFE_INTEGER, durationMs, scope: 'file' })
    if (problem) throw new BadRequestException(problem)
  }

  private async assertDraftQuota(userId: string) {
    const drafts = await this.prisma.mediaAsset.count({
      where: { uploaderId: userId, postId: null, status: { in: ['UPLOADING', 'UPLOADED'] } },
    })
    if (drafts >= MAX_MEDIA_DRAFTS)
      throw new HttpException('Há muitos arquivos enviados e ainda não publicados. Publique ou remova alguns e tente de novo.', HttpStatus.TOO_MANY_REQUESTS)
  }

  /** Cria a linha; se o banco falhar, apaga o que já subiu para o bucket (não deixa arquivo sem dono). */
  private async createRow(
    uploadedKeys: string[],
    data: Parameters<PrismaService['mediaAsset']['create']>[0]['data'],
  ): Promise<void> {
    try {
      await this.prisma.mediaAsset.create({ data })
    } catch (error) {
      for (const key of uploadedKeys) await this.deleteQuietly(key)
      throw error
    }
  }

  private async renderImage(id: string, sourceKey: string, format: MediaFormat, crop: MediaCrop) {
    const source = await this.storage.getObjectBuffer(sourceKey)
    if (!source) throw new BadRequestException('Um dos arquivos não está mais disponível. Envie de novo.')
    const variants = await renderImageVariants(source, format, crop)
    const fullKey = `${POST_MEDIA_FOLDER}/${id}.${variants.extension}`
    const feedKey = `${POST_MEDIA_FOLDER}/${id}.feed.${variants.extension}`
    const thumbKey = thumbKeyFor(fullKey)!
    const keys: string[] = []
    const put = async (key: string, data: Buffer, mime: string) => {
      await this.storage.uploadBuffer(key, data, mime, false)
      keys.push(key)
    }
    try {
      await put(fullKey, variants.full.data, variants.mimeType)
      await put(feedKey, variants.feed.data, variants.mimeType)
      await put(thumbKey, variants.thumb.data, 'image/webp')
      await this.prisma.mediaAsset.update({
        where: { id },
        data: {
          key: fullKey,
          feedKey,
          thumbKey,
          width: variants.full.width,
          height: variants.full.height,
          sizeBytes: variants.full.data.byteLength,
        },
      })
    } catch (error) {
      for (const key of keys) await this.deleteQuietly(key)
      throw error
    }
    // Conferência: o formato do arquivo gerado é exatamente o da moldura.
    const ratio = variants.feed.width / variants.feed.height
    if (Math.abs(ratio - MEDIA_FORMATS[format].ratio) > 0.01) this.logger.warn(`Proporção inesperada em ${feedKey}: ${ratio}`)
    return { keys, feedKey }
  }

  private async unclaim(ids: readonly string[]) {
    if (!ids.length) return
    await this.prisma.mediaAsset
      .updateMany({
        where: { id: { in: [...ids] }, postId: null, adCreativeId: null, status: 'PROCESSING' },
        data: { status: 'UPLOADED', format: null, cropX: null, cropY: null, cropW: null, cropH: null },
      })
      .catch((error) => this.logger.warn(`Não foi possível liberar a mídia reservada: ${errorText(error)}`))
    // Fotos voltam sem as versões geradas (que já foram apagadas); GIF mantém o arquivo, que é o próprio original.
    await this.prisma.mediaAsset
      .updateMany({ where: { id: { in: [...ids] }, postId: null, adCreativeId: null, kind: 'IMAGE' }, data: { key: null, feedKey: null, thumbKey: null, width: null, height: null, sizeBytes: null } })
      .catch(() => undefined)
  }

  private async dropImageSources(ids: string[]) {
    const rows = await this.prisma.mediaAsset.findMany({ where: { id: { in: ids }, sourceKey: { not: null } }, select: { id: true, sourceKey: true } })
    for (const row of rows) {
      if (!row.sourceKey || !(await this.deleteQuietly(row.sourceKey))) continue
      await this.prisma.mediaAsset.update({ where: { id: row.id }, data: { sourceKey: null } }).catch(() => undefined)
    }
  }

  /** Apaga todos os arquivos de um envio e a linha. Devolve false se o bucket falhou (tenta de novo depois). */
  private async discardRow(row: { id: string; sourceKey: string | null; key: string | null; feedKey: string | null; thumbKey: string | null; posterKey: string | null }): Promise<boolean> {
    for (const key of [row.sourceKey, row.key, row.feedKey, row.thumbKey, row.posterKey]) {
      if (key && !(await this.deleteQuietly(key))) return false
    }
    await this.prisma.mediaAsset.deleteMany({ where: { id: row.id, postId: null, adCreativeId: null } })
    return true
  }

  private async deleteQuietly(key: string): Promise<boolean> {
    try {
      await this.storage.delete(key)
      return true
    } catch (error) {
      this.logger.warn(`Não foi possível apagar ${key}: ${errorText(error)}`)
      return false
    }
  }
}
