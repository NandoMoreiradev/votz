import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { GifSearchItem } from '@votz/shared-types'

const ALLOWED_EXTERNAL_GIF_HOSTS = new Set([
  'static.klipy.com',
  'media.klipy.com',
  'cdn.klipy.com',
  'media.giphy.com',
  'media0.giphy.com',
  'media1.giphy.com',
  'media2.giphy.com',
  'media3.giphy.com',
  'media4.giphy.com',
  'i.giphy.com',
])

const CACHE_TTL_SECONDS = 600

export interface GifSearchResponse {
  enabled: boolean
  provider: 'klipy' | 'giphy' | null
  items: GifSearchItem[]
  next: string | null
}

@Injectable()
export class GifsService implements OnModuleDestroy {
  private readonly logger = new Logger(GifsService.name)
  private readonly klipyKey: string
  private readonly giphyKey: string
  private redis: Redis | null = null

  constructor(@Optional() private readonly config?: ConfigService) {
    this.klipyKey = (this.config?.get<string>('KLIPY_API_KEY') ?? '').trim()
    this.giphyKey = (this.config?.get<string>('GIPHY_API_KEY') ?? '').trim()

    const redisUrl = (this.config?.get<string>('REDIS_URL') ?? '').trim()
    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
      })
      this.redis.on('error', () => {
        // Fallback gracefully when Redis is unavailable in local dev/tests
      })
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => null)
    }
  }

  get activeProvider(): 'klipy' | 'giphy' | null {
    if (this.klipyKey) return 'klipy'
    if (this.giphyKey) return 'giphy'
    return null
  }

  isAllowedGifUrl(rawUrl: string): boolean {
    try {
      const parsed = new URL(rawUrl)
      if (parsed.protocol !== 'https:') return false
      return ALLOWED_EXTERNAL_GIF_HOSTS.has(parsed.hostname.toLowerCase())
    } catch {
      return false
    }
  }

  async search(query: string, limit = 20, pos?: string): Promise<GifSearchResponse> {
    const provider = this.activeProvider
    if (!provider) {
      return { enabled: false, provider: null, items: [], next: null }
    }

    const cleanQuery = query.trim().slice(0, 80)
    const safeLimit = Math.min(Math.max(limit, 1), 30)
    const cacheKey = `gifs:${provider}:${cleanQuery || '__trending__'}:${safeLimit}:${pos ?? ''}`

    const cached = await this.readCache(cacheKey)
    if (cached) return cached

    const result =
      provider === 'klipy'
        ? await this.queryKlipy(cleanQuery, safeLimit, pos)
        : await this.queryGiphy(cleanQuery, safeLimit, pos)

    await this.writeCache(cacheKey, result)
    return result
  }

  private async queryKlipy(query: string, limit: number, pos?: string): Promise<GifSearchResponse> {
    try {
      const page = Math.max(1, Number.parseInt(pos ?? '1', 10) || 1)
      const endpoint = query
        ? `https://api.klipy.com/api/v1/${encodeURIComponent(this.klipyKey)}/gifs/search`
        : `https://api.klipy.com/api/v1/${encodeURIComponent(this.klipyKey)}/gifs/trending`
      const url = new URL(endpoint)
      if (query) url.searchParams.set('q', query)
      url.searchParams.set('per_page', String(limit))
      url.searchParams.set('page', String(page))
      url.searchParams.set('locale', 'pt_BR')

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(4000) })
      if (!res.ok) {
        this.logger.warn(`KLIPY returned HTTP ${res.status}`)
        return { enabled: true, provider: 'klipy', items: [], next: null }
      }

      const json = (await res.json()) as {
        data?: {
          data?: Array<{
            id?: string | number
            title?: string
            file?: {
              hd?: { gif?: { url?: string; width?: number; height?: number } }
              md?: { gif?: { url?: string; width?: number; height?: number } }
              sm?: { gif?: { url?: string; width?: number; height?: number } }
            }
          }>
          has_next?: boolean
        }
      }

      const rows = json?.data?.data ?? []
      const items: GifSearchItem[] = []
      for (const row of rows) {
        const full = row.file?.md?.gif ?? row.file?.hd?.gif ?? row.file?.sm?.gif
        const preview = row.file?.sm?.gif ?? full
        if (!full?.url || !preview?.url) continue
        if (!this.isAllowedGifUrl(full.url) || !this.isAllowedGifUrl(preview.url)) continue
        items.push({
          id: String(row.id ?? full.url),
          title: (row.title ?? 'GIF').slice(0, 120),
          previewUrl: preview.url,
          gifUrl: full.url,
          width: full.width ?? null,
          height: full.height ?? null,
        })
      }

      return {
        enabled: true,
        provider: 'klipy',
        items,
        next: json?.data?.has_next ? String(page + 1) : null,
      }
    } catch (err) {
      this.logger.warn(`KLIPY lookup failed: ${(err as Error).message}`)
      return { enabled: true, provider: 'klipy', items: [], next: null }
    }
  }

  private async queryGiphy(query: string, limit: number, pos?: string): Promise<GifSearchResponse> {
    try {
      const offset = Math.max(0, Number.parseInt(pos ?? '0', 10) || 0)
      const endpoint = query
        ? 'https://api.giphy.com/v1/gifs/search'
        : 'https://api.giphy.com/v1/gifs/trending'
      const url = new URL(endpoint)
      url.searchParams.set('api_key', this.giphyKey)
      if (query) url.searchParams.set('q', query)
      url.searchParams.set('limit', String(limit))
      url.searchParams.set('offset', String(offset))
      url.searchParams.set('rating', 'pg-13')
      url.searchParams.set('lang', 'pt')

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(4000) })
      if (!res.ok) {
        this.logger.warn(`GIPHY returned HTTP ${res.status}`)
        return { enabled: true, provider: 'giphy', items: [], next: null }
      }

      const json = (await res.json()) as {
        data?: Array<{
          id?: string
          title?: string
          images?: {
            fixed_width?: { url?: string; width?: string; height?: string }
            fixed_width_small?: { url?: string }
            downsized?: { url?: string; width?: string; height?: string }
          }
        }>
        pagination?: { total_count?: number; count?: number; offset?: number }
      }

      const items: GifSearchItem[] = []
      for (const row of json?.data ?? []) {
        const fullUrl = row.images?.fixed_width?.url ?? row.images?.downsized?.url
        const previewUrl = row.images?.fixed_width_small?.url ?? fullUrl
        if (!fullUrl || !previewUrl) continue
        if (!this.isAllowedGifUrl(fullUrl) || !this.isAllowedGifUrl(previewUrl)) continue
        items.push({
          id: String(row.id ?? fullUrl),
          title: (row.title ?? 'GIF').slice(0, 120),
          previewUrl,
          gifUrl: fullUrl,
          width: row.images?.fixed_width?.width ? Number(row.images.fixed_width.width) : null,
          height: row.images?.fixed_width?.height ? Number(row.images.fixed_width.height) : null,
        })
      }

      const total = json?.pagination?.total_count ?? 0
      const count = json?.pagination?.count ?? items.length
      const nextOffset = offset + count
      return {
        enabled: true,
        provider: 'giphy',
        items,
        next: nextOffset < total ? String(nextOffset) : null,
      }
    } catch (err) {
      this.logger.warn(`GIPHY lookup failed: ${(err as Error).message}`)
      return { enabled: true, provider: 'giphy', items: [], next: null }
    }
  }

  private async readCache(key: string): Promise<GifSearchResponse | null> {
    if (!this.redis) return null
    try {
      const raw = await this.redis.get(key)
      return raw ? (JSON.parse(raw) as GifSearchResponse) : null
    } catch {
      return null
    }
  }

  private async writeCache(key: string, value: GifSearchResponse): Promise<void> {
    if (!this.redis || value.items.length === 0) return
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS)
    } catch {
      // Ignore cache write errors
    }
  }
}
