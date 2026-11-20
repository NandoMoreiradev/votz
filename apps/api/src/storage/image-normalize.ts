import sharp from 'sharp'

/** Maior lado da foto guardada. Maior que isso o celular só gasta espaço: na tela não aparece diferença. */
export const REPORT_IMAGE_MAX_EDGE = 2048
/** Maior lado da miniatura usada nas listas. */
export const THUMB_MAX_EDGE = 400
const JPEG_QUALITY = 80
const THUMB_QUALITY = 70
/** Trava contra imagem "bomba" (poucos KB que viram bilhões de pixels na memória). */
const MAX_INPUT_PIXELS = 100_000_000
const IMAGE_KEY = /\.(jpe?g|png|webp)$/i
export const THUMB_SUFFIX = '.thumb.webp'

export interface NormalizedImage {
  data: Buffer
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  width: number
  height: number
  thumb: Buffer
}

/** A miniatura de `reports/abc.jpeg` fica ao lado, em `reports/abc.thumb.webp`. Só imagens têm. */
export function thumbKeyFor(imageKey: string): string | null {
  return IMAGE_KEY.test(imageKey) && !imageKey.endsWith(THUMB_SUFFIX)
    ? imageKey.replace(IMAGE_KEY, THUMB_SUFFIX)
    : null
}

/**
 * Prepara a foto para guardar: aplica a rotação que a câmera marcou, reduz para no máximo
 * REPORT_IMAGE_MAX_EDGE, comprime e gera a miniatura. Os metadados (incluindo o GPS da câmera) NÃO
 * são copiados: a localização do relato é o endereço que a pessoa informa, não a posição escondida no arquivo.
 *
 * Devolve null quando o arquivo deve ficar como veio (GIF e WebP animados) ou quando não deu para ler:
 * a foto de um problema nunca deixa de ser enviada por causa disso, só fica sem otimização.
 */
export async function normalizeImage(
  input: Buffer,
  mimeType: string,
  options: { onFailure?: (reason: string) => void } = {},
): Promise<NormalizedImage | null> {
  if (mimeType === 'image/gif') return null
  try {
    const base = () =>
      sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
    const meta = await base().metadata()
    if ((meta.pages ?? 1) > 1) return null

    const resized = base()
      .rotate()
      .resize({
        width: REPORT_IMAGE_MAX_EDGE,
        height: REPORT_IMAGE_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
    // PNG com transparência e WebP mantêm o formato; o resto vira JPEG, bem menor para foto.
    const keepPng = mimeType === 'image/png' && meta.hasAlpha === true
    const out =
      mimeType === 'image/webp'
        ? { pipeline: resized.webp({ quality: JPEG_QUALITY }), mimeType: 'image/webp' as const }
        : keepPng
          ? { pipeline: resized.png({ compressionLevel: 9 }), mimeType: 'image/png' as const }
          : { pipeline: resized.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }), mimeType: 'image/jpeg' as const }
    const { data, info } = await out.pipeline.toBuffer({ resolveWithObject: true })
    const thumb = await sharp(data)
      .resize({
        width: THUMB_MAX_EDGE,
        height: THUMB_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer()
    return { data, mimeType: out.mimeType, width: info.width, height: info.height, thumb }
  } catch (error) {
    options.onFailure?.(error instanceof Error ? error.message : String(error))
    return null
  }
}
