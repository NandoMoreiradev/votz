import {
  CHAT_QUALITY_PROFILES,
  CHAT_THUMB_MAX_EDGE,
  fitWithin,
  safeThumbnail,
  type ChatMediaQuality,
} from '@votz/chat-core'

/** Arquivo pronto para cifrar e enviar: já reduzido, sem metadados da câmera e com a miniatura que vai na mensagem. */
export interface PreparedMedia {
  bytes: Uint8Array
  mimeType: string
  name: string
  width?: number
  height?: number
  durationMs?: number
  /** `data:image/jpeg;base64,...` de poucos KB. */
  thumbnail?: string
}

type Drawable = { source: CanvasImageSource; width: number; height: number; close: () => void }

async function decodeImage(file: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      // "from-image": aplica a rotação que a câmera marcou, para a foto não sair deitada.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch {
      /* cai para o <img> */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => undefined }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function canvasOf(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  return context ? [canvas, context] : null
}

/** Miniatura de até CHAT_THUMB_MAX_EDGE px, baixando a qualidade até caber no limite da mensagem. */
function makeThumbnail(source: CanvasImageSource, width: number, height: number): string | undefined {
  const fit = fitWithin(width, height, CHAT_THUMB_MAX_EDGE)
  if (!fit.width || !fit.height) return undefined
  const drawing = canvasOf(fit.width, fit.height)
  if (!drawing) return undefined
  const [canvas, context] = drawing
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, fit.width, fit.height)
  context.drawImage(source, 0, 0, fit.width, fit.height)
  for (const quality of [0.6, 0.4, 0.25]) {
    const uri = safeThumbnail(canvas.toDataURL('image/jpeg', quality))
    if (uri) return uri
  }
  return undefined
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

const renamed = (name: string, extension: string) =>
  `${name.replace(/\.[^./\\]+$/, '') || 'foto'}.${extension}`

/**
 * Reduz a foto para o tamanho da qualidade escolhida ANTES de cifrar (o servidor não vê o conteúdo e não
 * consegue comprimir) e gera a miniatura. Refazer a imagem também apaga os metadados da câmera, inclusive o
 * GPS. GIF fica como veio (perderia a animação) e formatos que o navegador não abre (ex.: HEIC) seguem sem
 * redução: o envio nunca falha por causa disso.
 */
export async function prepareChatImage(file: File, quality: ChatMediaQuality): Promise<PreparedMedia> {
  const profile = CHAT_QUALITY_PROFILES[quality]
  const asIs = async (extra: Partial<PreparedMedia> = {}): Promise<PreparedMedia> => ({
    bytes: new Uint8Array(await file.arrayBuffer()),
    mimeType: file.type || 'application/octet-stream',
    name: file.name,
    ...extra,
  })
  let decoded: Drawable
  try {
    decoded = await decodeImage(file)
  } catch {
    return asIs()
  }
  try {
    const thumbnail = makeThumbnail(decoded.source, decoded.width, decoded.height)
    const base = { width: decoded.width, height: decoded.height, ...(thumbnail ? { thumbnail } : {}) }
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') return asIs(base)

    const fit = fitWithin(decoded.width, decoded.height, profile.imageMaxEdge)
    // PNG pequeno (print, figura) não é refeito: sairia pior e maior.
    if (file.type === 'image/png' && !fit.scaled) return asIs(base)

    const drawing = canvasOf(fit.width, fit.height)
    if (!drawing) return asIs(base)
    const [canvas, context] = drawing
    const keepPng = file.type === 'image/png'
    if (!keepPng) {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, fit.width, fit.height)
    }
    context.drawImage(decoded.source, 0, 0, fit.width, fit.height)
    const mimeType = keepPng ? 'image/png' : 'image/jpeg'
    const blob = await toBlob(canvas, mimeType, profile.imageQuality)
    if (!blob) return asIs(base)
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mimeType,
      name: renamed(file.name, keepPng ? 'png' : 'jpg'),
      ...base,
      width: fit.width,
      height: fit.height,
    }
  } finally {
    decoded.close()
  }
}

const withTimeout = <T,>(work: Promise<T>, ms: number) =>
  Promise.race([
    work,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('tempo esgotado')), ms)),
  ])

/**
 * Medidas, duração e miniatura (um quadro do começo) de um vídeo. O navegador ainda não reduz vídeo: o
 * arquivo vai como veio, dentro do limite. Qualquer falha devolve vazio e o envio segue sem miniatura.
 */
export async function readVideoPreview(
  file: File,
): Promise<Pick<PreparedMedia, 'width' | 'height' | 'durationMs' | 'thumbnail'>> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'
  try {
    const loaded = new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error('vídeo ilegível'))
    })
    video.src = url
    await withTimeout(loaded, 8000)
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    const durationMs = duration > 0 ? Math.round(duration * 1000) : undefined
    const seeked = new Promise<void>((resolve) => {
      video.onseeked = () => resolve()
    })
    video.currentTime = Math.min(1, duration / 2)
    await withTimeout(seeked, 5000)
    const width = video.videoWidth || undefined
    const height = video.videoHeight || undefined
    const thumbnail = width && height ? makeThumbnail(video, width, height) : undefined
    return { width, height, durationMs, ...(thumbnail ? { thumbnail } : {}) }
  } catch {
    return {}
  } finally {
    URL.revokeObjectURL(url)
    video.removeAttribute('src')
    video.load()
  }
}
