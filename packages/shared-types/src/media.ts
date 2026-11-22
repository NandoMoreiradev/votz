/**
 * Padrão de fotos e vídeos do Votz (docs/dev/padrao-de-midia-plano-2026-11-21.md).
 *
 * Publicações e anúncios usam três formatos. Relatos NÃO são recortados (a foto é prova): aparecem inteiros
 * dentro da moldura do formato mais próximo. API, site, celular e servidor de anúncios leem tudo daqui.
 */

export type MediaFormat = 'SQUARE' | 'PORTRAIT' | 'LANDSCAPE'

export interface MediaFormatSpec {
  format: MediaFormat
  /** Nome que a pessoa vê. */
  label: string
  /** Proporção escrita como as pessoas conhecem. */
  ratioLabel: string
  /** Largura ÷ altura. */
  ratio: number
  /** Tamanho de referência (o que recomendamos enviar e o que os anúncios exigem). */
  width: number
  height: number
}

export const MEDIA_FORMATS: Record<MediaFormat, MediaFormatSpec> = {
  SQUARE: { format: 'SQUARE', label: 'Quadrado', ratioLabel: '1:1', ratio: 1, width: 1080, height: 1080 },
  PORTRAIT: { format: 'PORTRAIT', label: 'Retrato', ratioLabel: '4:5', ratio: 4 / 5, width: 1080, height: 1350 },
  LANDSCAPE: { format: 'LANDSCAPE', label: 'Paisagem', ratioLabel: '16:9', ratio: 16 / 9, width: 1920, height: 1080 },
}

/** Ordem dos botões no editor. */
export const MEDIA_FORMAT_ORDER: readonly MediaFormat[] = ['SQUARE', 'PORTRAIT', 'LANDSCAPE']

export const DEFAULT_MEDIA_FORMAT: MediaFormat = 'SQUARE'

/** Arquivos gerados pelo servidor a partir do recorte. */
export const MEDIA_VARIANTS = {
  /** Miniatura para listas. */
  THUMB_WIDTH: 400,
  /** Versão que o feed mostra. */
  FEED_WIDTH: 1080,
  /** Versão cheia (tela cheia, zoom): maior lado. */
  FULL_MAX_EDGE: 2048,
  /** A foto original fica guardada (privada, sem metadados) até no máximo isso, para o recorte ter qualidade. */
  SOURCE_MAX_EDGE: 4096,
} as const

/** Quantas fotos ou vídeos cabem numa publicação. */
export const POST_MEDIA_MAX_ITEMS = 4
/** Menor lado aceito do recorte, em pixels da foto original. */
export const MEDIA_MIN_CROP_EDGE = 200
/** Quanto o editor deixa aproximar. */
export const MEDIA_MAX_ZOOM = 5
/** Diferença aceita entre a proporção do recorte e a do formato (arredondamento de pixels). */
export const MEDIA_RATIO_TOLERANCE = 0.02

/** Exigências dos anúncios (plano de anúncios, seção 2.3 do padrão de mídia). */
export const AD_MEDIA_MIN_WIDTH = 1080
export const AD_VIDEO_MAX_SECONDS = 60

export type MediaAssetKind = 'IMAGE' | 'VIDEO' | 'GIF'
/** `cover`: o arquivo já tem a proporção da moldura. `contain`: aparece inteiro, com fundo desfocado (relatos, GIFs, posts antigos). */
export type MediaFit = 'cover' | 'contain'
export type MediaItemStatus = 'READY' | 'PROCESSING' | 'FAILED'

/** Recorte em frações (0 a 1) da imagem original, como a pessoa vê (já girada). */
export interface MediaCrop {
  x: number
  y: number
  w: number
  h: number
}

/** Item de mídia como a API devolve, pronto para desenhar. */
export interface MediaItemDto {
  /** Nulo em relatos e itens sem registro próprio. */
  id: string | null
  kind: MediaAssetKind
  /** Moldura. Nulo só quando o servidor não sabe o tamanho (arquivo antigo): o app mede ao carregar. */
  format: MediaFormat | null
  fit: MediaFit
  /** Tamanho do arquivo mostrado. */
  width: number | null
  height: number | null
  /** Nulo enquanto o vídeo processa. */
  url: string | null
  fullUrl: string | null
  thumbUrl: string | null
  posterUrl: string | null
  status: MediaItemStatus
  durationMs: number | null
}

/** Resposta do envio de um arquivo para publicação (ainda sem recorte). */
export interface UploadedMediaAssetDto {
  id: string
  kind: MediaAssetKind
  /** Tamanho como a pessoa vê (foto girada pela câmera, vídeo gravado em pé). */
  width: number
  height: number
  durationMs: number | null
}

/** Formato cuja proporção fica mais perto da do arquivo. No empate (4:3 fica no meio de 1:1 e 16:9), vale o primeiro da lista: o quadrado, que mostra a foto maior. */
export function nearestMediaFormat(width: number | null | undefined, height: number | null | undefined): MediaFormat | null {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  const target = Math.log(width / height)
  let best: MediaFormat = DEFAULT_MEDIA_FORMAT
  let bestDistance = Number.POSITIVE_INFINITY
  for (const format of MEDIA_FORMAT_ORDER) {
    const distance = Math.abs(target - Math.log(MEDIA_FORMATS[format].ratio))
    if (distance < bestDistance - 1e-9) {
      bestDistance = distance
      best = format
    }
  }
  return best
}

/** Altura ÷ largura da moldura (o celular usa assim). */
export function mediaFrameHeightRatio(format: MediaFormat): number {
  return 1 / MEDIA_FORMATS[format].ratio
}

/** Maior recorte com a proporção do formato que cabe na imagem (zoom 1), em pixels. */
export function baseCropSize(sourceWidth: number, sourceHeight: number, format: MediaFormat) {
  const ratio = MEDIA_FORMATS[format].ratio
  return sourceWidth / sourceHeight > ratio
    ? { width: sourceHeight * ratio, height: sourceHeight }
    : { width: sourceWidth, height: sourceWidth / ratio }
}

/** Zoom máximo do editor para esta imagem: não deixa o recorte ficar menor que MEDIA_MIN_CROP_EDGE. */
export function maxCropZoom(sourceWidth: number, sourceHeight: number, format: MediaFormat): number {
  const base = baseCropSize(sourceWidth, sourceHeight, format)
  const byEdge = Math.min(base.width, base.height) / MEDIA_MIN_CROP_EDGE
  return Math.max(1, Math.min(MEDIA_MAX_ZOOM, byEdge))
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Recorte a partir do que o editor mostra: zoom (1 = a maior moldura que cabe) e centro (frações da imagem).
 * O centro é ajustado para a moldura nunca sair da imagem.
 */
export function cropFromView(
  sourceWidth: number,
  sourceHeight: number,
  format: MediaFormat,
  view: { zoom: number; centerX: number; centerY: number },
): MediaCrop {
  const zoom = clamp(view.zoom, 1, maxCropZoom(sourceWidth, sourceHeight, format))
  const base = baseCropSize(sourceWidth, sourceHeight, format)
  const w = base.width / zoom / sourceWidth
  const h = base.height / zoom / sourceHeight
  const centerX = clamp(view.centerX, w / 2, 1 - w / 2)
  const centerY = clamp(view.centerY, h / 2, 1 - h / 2)
  return { x: centerX - w / 2, y: centerY - h / 2, w, h }
}

/** O contrário de `cropFromView`: zoom e centro de um recorte guardado. */
export function viewFromCrop(sourceWidth: number, sourceHeight: number, format: MediaFormat, crop: MediaCrop) {
  const base = baseCropSize(sourceWidth, sourceHeight, format)
  return {
    zoom: clamp(base.width / (crop.w * sourceWidth), 1, maxCropZoom(sourceWidth, sourceHeight, format)),
    centerX: crop.x + crop.w / 2,
    centerY: crop.y + crop.h / 2,
  }
}

/** Recorte centralizado, sem zoom (o que o editor mostra ao abrir). */
export function defaultCrop(sourceWidth: number, sourceHeight: number, format: MediaFormat): MediaCrop {
  return cropFromView(sourceWidth, sourceHeight, format, { zoom: 1, centerX: 0.5, centerY: 0.5 })
}

/**
 * Recorte em pixels inteiros, com a proporção exata do formato (a largura manda; a altura é ajustada e,
 * se passar da borda, os dois diminuem juntos).
 */
export function cropToPixels(sourceWidth: number, sourceHeight: number, format: MediaFormat, crop: MediaCrop) {
  const ratio = MEDIA_FORMATS[format].ratio
  const left = clamp(Math.round(crop.x * sourceWidth), 0, sourceWidth - 1)
  const top = clamp(Math.round(crop.y * sourceHeight), 0, sourceHeight - 1)
  let width = Math.max(1, Math.round(crop.w * sourceWidth))
  let height = Math.max(1, Math.round(width / ratio))
  if (left + width > sourceWidth) {
    width = sourceWidth - left
    height = Math.max(1, Math.round(width / ratio))
  }
  if (top + height > sourceHeight) {
    height = sourceHeight - top
    width = Math.max(1, Math.min(sourceWidth - left, Math.round(height * ratio)))
  }
  return { left, top, width, height }
}

/**
 * Confere um recorte recebido do app. Devolve a mensagem para a pessoa (português simples) ou null se está certo.
 */
export function validateMediaCrop(
  sourceWidth: number,
  sourceHeight: number,
  format: MediaFormat,
  crop: MediaCrop,
): string | null {
  const values = [crop.x, crop.y, crop.w, crop.h]
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) return 'O recorte da foto veio incompleto. Ajuste de novo.'
  const EPS = 0.001
  if (crop.x < -EPS || crop.y < -EPS || crop.w <= 0 || crop.h <= 0 || crop.x + crop.w > 1 + EPS || crop.y + crop.h > 1 + EPS)
    return 'O recorte saiu da foto. Ajuste de novo.'
  const pixelWidth = crop.w * sourceWidth
  const pixelHeight = crop.h * sourceHeight
  const ratio = MEDIA_FORMATS[format].ratio
  if (Math.abs(pixelWidth / pixelHeight - ratio) / ratio > MEDIA_RATIO_TOLERANCE)
    return `O recorte não está no formato ${MEDIA_FORMATS[format].label.toLowerCase()} (${MEDIA_FORMATS[format].ratioLabel}). Ajuste de novo.`
  if (Math.min(pixelWidth, pixelHeight) < MEDIA_MIN_CROP_EDGE - 1)
    return 'O recorte ficou pequeno demais. Afaste um pouco a foto.'
  return null
}

/** Tamanho final de cada versão gerada a partir de um recorte de `cropWidth` × `cropHeight` pixels. */
export function mediaVariantSizes(format: MediaFormat, cropWidth: number, cropHeight: number) {
  const ratio = MEDIA_FORMATS[format].ratio
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2)
  const feed = { width: MEDIA_VARIANTS.FEED_WIDTH, height: Math.round(MEDIA_VARIANTS.FEED_WIDTH / ratio) }
  // A versão cheia nunca amplia além do recorte, mas também nunca fica menor que a do feed.
  const scale = Math.min(1, MEDIA_VARIANTS.FULL_MAX_EDGE / Math.max(cropWidth, cropHeight))
  const fullWidth = Math.max(feed.width, Math.round(cropWidth * scale))
  const full = { width: fullWidth, height: Math.round(fullWidth / ratio) }
  const thumb = { width: MEDIA_VARIANTS.THUMB_WIDTH, height: Math.round(MEDIA_VARIANTS.THUMB_WIDTH / ratio) }
  // Vídeo: tamanho de referência do formato, sem ampliar além do recorte (dimensões pares para o H.264).
  const videoScale = Math.min(1, MEDIA_FORMATS[format].width / cropWidth)
  const video = { width: even(cropWidth * videoScale), height: even((cropWidth * videoScale) / ratio) }
  return { feed, full, thumb, video }
}

const VIDEO_URL = /\.(mp4|mov|m4v|webm)(\?|#|$)/i
const GIF_URL = /\.gif(\?|#|$)/i
const POSTER_FROM_VIDEO = /\.(mp4|mov|m4v|webm)(?=(\?|#|$))/i

export function mediaKindFromUrl(url: string): MediaAssetKind {
  if (VIDEO_URL.test(url)) return 'VIDEO'
  if (GIF_URL.test(url)) return 'GIF'
  return 'IMAGE'
}

/**
 * Itens a partir só dos links (publicação ou resposta antiga, sem `mediaItems`). A moldura fica por conta do
 * app, que mede ao carregar; o arquivo aparece inteiro. A capa do vídeo segue a convenção `<arquivo>.poster.jpg`.
 */
export function legacyMediaItems(urls: readonly string[]): MediaItemDto[] {
  return urls.map((url) => {
    const kind = mediaKindFromUrl(url)
    return {
      id: null,
      kind,
      format: null,
      fit: 'contain' as const,
      width: null,
      height: null,
      url,
      fullUrl: url,
      thumbUrl: null,
      posterUrl: kind === 'VIDEO' ? url.replace(POSTER_FROM_VIDEO, '.poster.jpg') : null,
      status: 'READY' as const,
      durationMs: null,
    }
  })
}

/** Moldura de um conjunto (carrossel): a do primeiro item com formato conhecido. */
export function mediaSetFormat(items: readonly Pick<MediaItemDto, 'format'>[]): MediaFormat | null {
  return items.find((item) => item.format)?.format ?? null
}
