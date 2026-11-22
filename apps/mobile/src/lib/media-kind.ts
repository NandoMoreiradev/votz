// Classificação dos anexos já publicados, para o carrossel de mídia (padrão: docs/dev/padrao-de-midia-plano-2026-11-21.md).
import { MEDIA_FORMATS, mediaSetFormat, nearestMediaFormat, type MediaFit, type MediaFormat, type MediaItemDto } from '@votz/shared-types'

export type PublishedMediaKind = 'image' | 'video' | 'pdf'

export interface CarouselItem {
  /** Nulo só em vídeo ainda processando (a moldura aparece com aviso). */
  url: string | null
  kind: PublishedMediaKind
  /** `cover`: o arquivo já tem a proporção da moldura. `contain`: aparece inteiro, com fundo desfocado. */
  fit: MediaFit
  fullUrl: string | null
  thumbUrl: string | null
  posterUrl: string | null
  processing: boolean
  /** Moldura própria do item (quando a API sabe). */
  format: MediaFormat | null
}

export function mediaKindOfUrl(url: string): PublishedMediaKind {
  const path = url.split(/[?#]/)[0].toLowerCase()
  if (/\.(mp4|mov|m4v|webm)$/.test(path)) return 'video'
  if (path.endsWith('.pdf')) return 'pdf'
  return 'image'
}

/**
 * Capa do vídeo: a API guarda `<nome>.poster.jpg` ao lado de `<nome>.mp4`. Devolve null se o link não for de
 * vídeo. Vídeos antigos não têm capa: quem usa precisa tratar o erro de carregamento.
 */
export function posterUrlOf(url: string): string | null {
  return mediaKindOfUrl(url) === 'video' ? url.replace(/\.(mp4|mov|m4v|webm)(?=$|[?#])/i, '.poster.jpg') : null
}

const isHttp = (url: unknown): url is string => typeof url === 'string' && /^https?:\/\//i.test(url)

/** Só links: aparecem inteiros (contain) e a moldura é medida ao carregar. */
export function carouselItems(urls: readonly string[] | null | undefined, limit: number): CarouselItem[] {
  return (urls ?? [])
    .filter(isHttp)
    .slice(0, limit)
    .map((url) => {
      const kind = mediaKindOfUrl(url)
      return { url, kind, fit: 'contain' as const, fullUrl: url, thumbUrl: null, posterUrl: posterUrlOf(url), processing: false, format: null }
    })
}

/**
 * Itens do padrão de formatos (`mediaItems` da API), na ordem. PDFs e áudios do relato não estão em
 * `mediaItems`: entram no fim, a partir dos links (`urls`). Itens que falharam não aparecem.
 */
export function carouselFromMediaItems(items: readonly MediaItemDto[], urls: readonly string[] | null | undefined, limit: number): CarouselItem[] {
  const visual: CarouselItem[] = items
    .filter((item) => item.status !== 'FAILED' && (item.status === 'PROCESSING' || isHttp(item.url)))
    .map((item) => ({
      url: item.url,
      kind: item.kind === 'VIDEO' ? 'video' : 'image',
      fit: item.fit,
      fullUrl: item.fullUrl ?? item.url,
      thumbUrl: item.thumbUrl,
      posterUrl: item.posterUrl,
      processing: item.status === 'PROCESSING',
      format: item.format,
    }))
  const known = new Set(items.map((item) => item.url).filter(Boolean))
  const documents = (urls ?? []).filter((url) => isHttp(url) && !known.has(url) && mediaKindOfUrl(url) === 'pdf')
  return [...visual, ...carouselItems(documents, limit)].slice(0, limit)
}

/** Altura ÷ largura de uma moldura do padrão. */
export function formatHeightRatio(format: MediaFormat): number {
  return MEDIA_FORMATS[format].height / MEDIA_FORMATS[format].width
}

/** Moldura padrão enquanto não se sabe o formato (quadrado). */
export const DEFAULT_MEDIA_RATIO = formatHeightRatio('SQUARE')

/** Moldura do conjunto: a do primeiro item que tem formato. */
export function carouselFormat(items: readonly CarouselItem[]): MediaFormat | null {
  return mediaSetFormat(items)
}

/** Altura / largura da área do carrossel a partir do tamanho medido: sempre uma das três molduras do padrão. */
export function mediaRatio(width?: number | null, height?: number | null): number {
  const format = nearestMediaFormat(width, height)
  return format ? formatHeightRatio(format) : DEFAULT_MEDIA_RATIO
}

/** Posição da página depois de deslizar (offset em pixels / largura), sempre dentro da lista. */
export function pageIndex(offsetX: number, width: number, count: number): number {
  if (!width || count <= 0) return 0
  return Math.min(count - 1, Math.max(0, Math.round(offsetX / width)))
}
