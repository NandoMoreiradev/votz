import sharp, { type Sharp } from 'sharp'
import {
  MEDIA_VARIANTS,
  cropToPixels,
  mediaVariantSizes,
  type MediaCrop,
  type MediaFormat,
} from '@votz/shared-types'

/** Trava contra imagem "bomba" (poucos KB que viram bilhões de pixels na memória). */
const MAX_INPUT_PIXELS = 100_000_000
const SOURCE_QUALITY = 90
const OUTPUT_QUALITY = 82
const THUMB_QUALITY = 70

export interface PreparedImageSource {
  data: Buffer
  mimeType: 'image/jpeg' | 'image/webp'
  /** Tamanho como a pessoa vê (já girada). */
  width: number
  height: number
}

/**
 * Prepara o original que fica guardado (privado) até a publicação: aplica a rotação da câmera, reduz para no
 * máximo SOURCE_MAX_EDGE e tira TODOS os metadados (EXIF, GPS). Foto com transparência vira WebP (mantém a
 * transparência); o resto vira JPEG. Lança erro se o arquivo não for uma foto legível: aqui não há "guardar
 * como veio", porque o recorte precisa saber o tamanho real.
 */
export async function prepareImageSource(input: Buffer): Promise<PreparedImageSource> {
  const base = () => sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
  const meta = await base().metadata()
  if ((meta.pages ?? 1) > 1) throw new Error('imagem animada deve ser enviada como GIF')
  const resized = base()
    .rotate()
    .resize({
      width: MEDIA_VARIANTS.SOURCE_MAX_EDGE,
      height: MEDIA_VARIANTS.SOURCE_MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
  const alpha = meta.hasAlpha === true
  const pipeline = alpha ? resized.webp({ quality: SOURCE_QUALITY }) : resized.jpeg({ quality: SOURCE_QUALITY, mozjpeg: true })
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })
  return { data, mimeType: alpha ? 'image/webp' : 'image/jpeg', width: info.width, height: info.height }
}

export interface RenderedImage {
  data: Buffer
  width: number
  height: number
}

export interface RenderedImageVariants {
  mimeType: 'image/jpeg' | 'image/webp'
  extension: 'jpeg' | 'webp'
  full: RenderedImage
  feed: RenderedImage
  /** Sempre WebP. */
  thumb: RenderedImage
}

/**
 * Recorta o original no formato escolhido e gera as três versões com o tamanho exato do formato:
 * cheia (até 2048 px, nunca menor que a do feed), do feed (1080 px de largura) e miniatura (400 px).
 */
export async function renderImageVariants(
  source: Buffer,
  format: MediaFormat,
  crop: MediaCrop,
): Promise<RenderedImageVariants> {
  const input = () => sharp(source, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
  // O original guardado já está girado e sem metadados; o tamanho dele é o que o recorte usa.
  const meta = await input().metadata()
  if (!meta.width || !meta.height) throw new Error('não foi possível ler o tamanho da foto')
  const region = cropToPixels(meta.width, meta.height, format, crop)
  const sizes = mediaVariantSizes(format, region.width, region.height)
  const alpha = meta.hasAlpha === true
  const encode = (image: Sharp) =>
    alpha ? image.webp({ quality: OUTPUT_QUALITY }) : image.jpeg({ quality: OUTPUT_QUALITY, mozjpeg: true })

  const render = async (size: { width: number; height: number }, encoder: (image: Sharp) => Sharp) => {
    const { data, info } = await encoder(
      input().extract(region).resize({ width: size.width, height: size.height, fit: 'cover', position: 'centre' }),
    ).toBuffer({ resolveWithObject: true })
    return { data, width: info.width, height: info.height }
  }

  const [full, feed, thumb] = await Promise.all([
    render(sizes.full, encode),
    render(sizes.feed, encode),
    render(sizes.thumb, (image) => image.webp({ quality: THUMB_QUALITY })),
  ])
  return { mimeType: alpha ? 'image/webp' : 'image/jpeg', extension: alpha ? 'webp' : 'jpeg', full, feed, thumb }
}

/** Largura e altura de um GIF (primeiro quadro). Null se não der para ler. */
export async function gifSize(input: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: true }).metadata()
    const height = meta.pageHeight ?? meta.height
    return meta.width && height ? { width: meta.width, height } : null
  } catch {
    return null
  }
}
