// Classificação dos anexos já publicados (links), para o carrossel de mídia.
export type PublishedMediaKind = 'image' | 'video' | 'pdf'

export interface CarouselItem { url: string; kind: PublishedMediaKind }

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

/** Só links http(s), na ordem em que foram anexados, até o limite. */
export function carouselItems(urls: readonly string[] | null | undefined, limit: number): CarouselItem[] {
  return (urls ?? [])
    .filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url))
    .slice(0, limit)
    .map((url) => ({ url, kind: mediaKindOfUrl(url) }))
}

export const DEFAULT_MEDIA_RATIO = 0.75 // altura / largura (4:3 deitado)
const MIN_MEDIA_RATIO = 0.5625 // 16:9 deitado
const MAX_MEDIA_RATIO = 1.35 // um pouco mais alto que 3:4 em pé

/**
 * Altura / largura da área do carrossel a partir da primeira foto. Foto em pé ganha uma área mais alta
 * (até o limite); passou do limite, a foto aparece inteira com faixas nas laterais, sem cortar.
 */
export function mediaRatio(width?: number | null, height?: number | null): number {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return DEFAULT_MEDIA_RATIO
  return Math.min(MAX_MEDIA_RATIO, Math.max(MIN_MEDIA_RATIO, height / width))
}

/** Posição da página depois de deslizar (offset em pixels / largura), sempre dentro da lista. */
export function pageIndex(offsetX: number, width: number, count: number): number {
  if (!width || count <= 0) return 0
  return Math.min(count - 1, Math.max(0, Math.round(offsetX / width)))
}
