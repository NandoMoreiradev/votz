import { Logger } from '@nestjs/common'
import sharp from 'sharp'
import { mediaKindFromUrl, nearestMediaFormat, type MediaAssetKind } from '@votz/shared-types'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { thumbKeyFor } from '../storage/image-normalize'
import { posterKeyFor } from '../storage/video-poster'
import { gifSize } from './media-image'
import { probeVideoBuffer } from './media-video'

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime',
}

export interface BackfillSummary {
  posts: number
  migrated: number
  skipped: number
  items: number
}

/**
 * Publicações de antes do padrão de formatos: grava em `media_assets` o tamanho e a moldura mais próxima de cada
 * arquivo, SEM recortar nem trocar nada (aparecem inteiras na moldura, com fundo desfocado: `legacy = true`).
 * Idempotente: só pega publicações com links e sem nenhuma linha em `media_assets`. Publicação com link de fora
 * do Votz, arquivo que não abre ou arquivo já registrado em outra publicação fica como está (o app mede ao carregar).
 */
export class LegacyMediaBackfill {
  private readonly logger = new Logger(LegacyMediaBackfill.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async run(options: { limit?: number; batch?: number; dryRun?: boolean } = {}): Promise<BackfillSummary> {
    const limit = options.limit ?? Number.POSITIVE_INFINITY
    const batch = Math.max(1, Math.min(options.batch ?? 50, 200))
    const summary: BackfillSummary = { posts: 0, migrated: 0, skipped: 0, items: 0 }
    // Publicações puladas não voltam na próxima página (o filtro "sem linhas" continuaria trazendo as mesmas).
    let cursor: string | undefined
    while (summary.posts < limit) {
      const posts = await this.prisma.post.findMany({
        where: { media: { isEmpty: false }, mediaAssets: { none: {} }, ...(cursor ? { id: { gt: cursor } } : {}) },
        orderBy: { id: 'asc' },
        take: Math.min(batch, limit - summary.posts),
        select: { id: true, media: true, authorUserId: true, createdAt: true },
      })
      if (!posts.length) break
      for (const post of posts) {
        summary.posts += 1
        const count = await this.migratePost(post, options.dryRun === true)
        if (count === null) summary.skipped += 1
        else {
          summary.migrated += 1
          summary.items += count
        }
      }
      cursor = posts[posts.length - 1].id
    }
    return summary
  }

  /** Devolve quantos itens registrou, ou null se a publicação ficou como estava. */
  async migratePost(post: { id: string; media: string[]; authorUserId: string; createdAt: Date }, dryRun = false): Promise<number | null> {
    const keys = post.media.map((url) => this.storage.extractKeyFromUrl(url))
    if (keys.some((key) => !key)) return null // link de fora do Votz
    const ownKeys = keys as string[]
    const taken = await this.prisma.mediaAsset.count({ where: { key: { in: ownKeys } } })
    if (taken) return null

    const rows = []
    for (const [position, key] of ownKeys.entries()) {
      const described = await this.describe(key).catch((error) => {
        this.logger.warn(`Publicação ${post.id}: ${key} não abriu (${error instanceof Error ? error.message : String(error)})`)
        return null
      })
      if (!described) return null
      rows.push({
        uploaderId: post.authorUserId,
        kind: described.kind,
        status: 'READY' as const,
        sourceMime: MIME_BY_EXT[key.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream',
        sourceSizeBytes: described.size,
        sourceWidth: described.width,
        sourceHeight: described.height,
        durationMs: described.durationMs,
        format: nearestMediaFormat(described.width, described.height),
        key,
        thumbKey: described.thumbKey,
        posterKey: described.posterKey,
        width: described.width,
        height: described.height,
        sizeBytes: described.size,
        legacy: true,
        postId: post.id,
        position,
        attachedAt: post.createdAt,
        processedAt: new Date(),
      })
    }
    if (!dryRun) await this.prisma.mediaAsset.createMany({ data: rows })
    return rows.length
  }

  private async describe(key: string): Promise<{
    kind: MediaAssetKind
    width: number
    height: number
    durationMs: number | null
    size: number
    thumbKey: string | null
    posterKey: string | null
  } | null> {
    const kind = mediaKindFromUrl(key)
    const buffer = await this.storage.getObjectBuffer(key)
    if (!buffer) return null
    if (kind === 'VIDEO') {
      const probe = await probeVideoBuffer(buffer, key.split('.').pop() ?? 'mp4')
      if (!probe) return null
      const posterKey = posterKeyFor(key)
      const hasPoster = posterKey ? (await this.storage.headObjectSize(posterKey)) !== null : false
      return { kind, width: probe.width, height: probe.height, durationMs: probe.durationMs, size: buffer.byteLength, thumbKey: null, posterKey: hasPoster ? posterKey : null }
    }
    if (kind === 'GIF') {
      const size = await gifSize(buffer)
      return size ? { kind, ...size, durationMs: null, size: buffer.byteLength, thumbKey: null, posterKey: null } : null
    }
    const meta = await sharp(buffer, { limitInputPixels: 100_000_000 }).metadata()
    if (!meta.width || !meta.height) return null
    // Foto antiga pode ter a rotação só marcada (EXIF 5 a 8): na tela ela aparece com largura e altura trocadas.
    const turned = (meta.orientation ?? 1) >= 5
    const thumbKey = thumbKeyFor(key)
    const hasThumb = thumbKey ? (await this.storage.headObjectSize(thumbKey)) !== null : false
    return {
      kind,
      width: turned ? meta.height : meta.width,
      height: turned ? meta.width : meta.height,
      durationMs: null,
      size: buffer.byteLength,
      thumbKey: hasThumb ? thumbKey : null,
      posterKey: null,
    }
  }
}
