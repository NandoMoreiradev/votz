import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const API_BASE = 'https://www.googleapis.com/youtube/v3'
const REQUEST_TIMEOUT_MS = 6_000

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/
const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/
const HANDLE_RE = /^@[A-Za-z0-9._-]{3,30}$/

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'])
const EMBED_HOSTS = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com'])

export interface YoutubeVideoInfo {
  videoId: string
  channelId: string
  channelTitle: string
  embeddable: boolean
  privacyStatus: string
  /** true quando o vídeo nasceu como transmissão ao vivo (agendada, no ar ou já encerrada). */
  isLiveBroadcast: boolean
}

export interface YoutubeChannelInfo {
  channelId: string
  title: string
  description: string
}

export type YoutubeChannelRef = { kind: 'id'; value: string } | { kind: 'handle'; value: string }

/**
 * Lê só dados públicos pela YouTube Data API (apenas chave, sem login Google).
 * Nunca confie no que o cliente manda: o link vira `videoId` aqui e só o `videoId` segue adiante.
 */
@Injectable()
export class YoutubeApiService {
  private readonly logger = new Logger(YoutubeApiService.name)

  constructor(private readonly config: ConfigService) {}

  /** Extrai o id do vídeo de watch?v=, youtu.be/, /live/ e /embed/. Devolve null se não for link do YouTube. */
  parseVideoId(input: string): string | null {
    const url = this.toUrl(input)
    if (!url) return null

    let candidate: string | null = null
    if (url.hostname === 'youtu.be') {
      candidate = url.pathname.split('/')[1] ?? null
    } else if (YOUTUBE_HOSTS.has(url.hostname)) {
      const [first, second] = url.pathname.split('/').filter(Boolean)
      if (first === 'watch') candidate = url.searchParams.get('v')
      else if (first === 'live' || first === 'embed') candidate = second ?? null
    } else if (EMBED_HOSTS.has(url.hostname)) {
      const [first, second] = url.pathname.split('/').filter(Boolean)
      if (first === 'embed') candidate = second ?? null
    }

    return candidate && VIDEO_ID_RE.test(candidate) ? candidate : null
  }

  /** Aceita link /channel/UC…, link /@nome, "@nome" ou o id "UC…". Links antigos (/c/, /user/) não. */
  parseChannelRef(input: string): YoutubeChannelRef | null {
    const raw = input.trim()
    if (CHANNEL_ID_RE.test(raw)) return { kind: 'id', value: raw }
    if (HANDLE_RE.test(raw)) return { kind: 'handle', value: raw }

    const url = this.toUrl(raw)
    if (!url || !YOUTUBE_HOSTS.has(url.hostname)) return null

    const [first, second] = url.pathname.split('/').filter(Boolean)
    if (first === 'channel' && second && CHANNEL_ID_RE.test(second)) return { kind: 'id', value: second }
    if (first?.startsWith('@')) {
      const handle = decodeURIComponent(first)
      if (HANDLE_RE.test(handle)) return { kind: 'handle', value: handle }
    }
    return null
  }

  async getVideo(videoId: string): Promise<YoutubeVideoInfo | null> {
    const data = await this.call('videos', { part: 'snippet,status,liveStreamingDetails', id: videoId })
    const item = data.items?.[0]
    if (!item) return null
    return {
      videoId,
      channelId: item.snippet?.channelId ?? '',
      channelTitle: item.snippet?.channelTitle ?? '',
      embeddable: item.status?.embeddable === true,
      privacyStatus: item.status?.privacyStatus ?? 'private',
      isLiveBroadcast: !!item.liveStreamingDetails,
    }
  }

  async getChannel(ref: YoutubeChannelRef): Promise<YoutubeChannelInfo | null> {
    const data = await this.call('channels', {
      part: 'snippet',
      ...(ref.kind === 'id' ? { id: ref.value } : { forHandle: ref.value }),
    })
    const item = data.items?.[0]
    if (!item?.id) return null
    return {
      channelId: item.id,
      title: item.snippet?.title ?? '',
      description: item.snippet?.description ?? '',
    }
  }

  private toUrl(input: string): URL | null {
    try {
      const url = new URL(input.trim())
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
      return url
    } catch {
      return null
    }
  }

  private async call(resource: 'videos' | 'channels', params: Record<string, string>) {
    const key = this.config.get<string>('YOUTUBE_API_KEY')
    if (!key) {
      throw new ServiceUnavailableException('A transmissão pelo YouTube ainda não está ligada neste ambiente.')
    }

    const query = new URLSearchParams({ ...params, key })
    try {
      const res = await fetch(`${API_BASE}/${resource}?${query.toString()}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!res.ok) {
        // Não registrar a URL: ela leva a chave.
        this.logger.warn(`YouTube Data API respondeu ${res.status} em ${resource}`)
        throw new BadGatewayException('Não deu para falar com o YouTube agora. Tente de novo em instantes.')
      }
      return (await res.json()) as {
        items?: Array<{
          id?: string
          snippet?: { channelId?: string; channelTitle?: string; title?: string; description?: string }
          status?: { embeddable?: boolean; privacyStatus?: string }
          liveStreamingDetails?: unknown
        }>
      }
    } catch (err) {
      if (err instanceof BadGatewayException) throw err
      this.logger.warn(`Falha ao chamar o YouTube (${resource}): ${(err as Error).name}`)
      throw new BadGatewayException('Não deu para falar com o YouTube agora. Tente de novo em instantes.')
    }
  }
}
