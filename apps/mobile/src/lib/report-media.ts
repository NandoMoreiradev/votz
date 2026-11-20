// Mesmos tipos e limites do web (CreateReport) e do storage da API.
export type MediaKind = 'image' | 'video' | 'pdf'

export interface MediaItem {
  uri: string
  name: string
  mimeType: string
  kind: MediaKind
  size?: number
}

export const REPORT_MEDIA_LIMIT = 5
export const POST_MEDIA_LIMIT = 4
export const MEDIA_MAX_BYTES: Record<MediaKind, number> = { image: 10 * 1024 * 1024, video: 100 * 1024 * 1024, pdf: 50 * 1024 * 1024 }
const KIND_LABEL: Record<MediaKind, string> = { image: 'Imagem acima de 10 MB', video: 'Vídeo acima de 100 MB', pdf: 'PDF acima de 50 MB' }

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', mov: 'video/quicktime', pdf: 'application/pdf',
}
const ACCEPTED = new Set(Object.values(MIME_BY_EXTENSION))

export function mimeFromName(name: string) {
  return MIME_BY_EXTENSION[name.split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? '']
}

export function kindOfMime(mimeType: string): MediaKind | null {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType === 'application/pdf') return 'pdf'
  return null
}

/** Devolve o item pronto para a lista ou o motivo, em português simples, para recusar. */
export function prepareMedia(asset: { uri: string; name?: string | null; mimeType?: string | null; size?: number | null; type?: string | null }): { item: MediaItem } | { error: string } {
  const fallbackName = asset.name || asset.uri.split('/').pop() || 'arquivo'
  const declared = asset.mimeType || mimeFromName(fallbackName) || (asset.type === 'video' ? 'video/mp4' : asset.type === 'image' ? 'image/jpeg' : '')
  if (!ACCEPTED.has(declared)) return { error: 'Esse tipo de arquivo não é aceito. Use foto, vídeo MP4/MOV ou PDF.' }
  const kind = kindOfMime(declared)!
  if (typeof asset.size === 'number' && asset.size > MEDIA_MAX_BYTES[kind]) return { error: `${KIND_LABEL[kind]}. Escolha um arquivo menor.` }
  const extension = Object.entries(MIME_BY_EXTENSION).find(([, mime]) => mime === declared)?.[0] ?? 'bin'
  const name = /\.[a-z0-9]{2,4}$/i.test(fallbackName) ? fallbackName : `${fallbackName}.${extension}`
  return { item: { uri: asset.uri, name, mimeType: declared, kind, ...(typeof asset.size === 'number' ? { size: asset.size } : {}) } }
}

/** Quantos arquivos ainda cabem. */
export const mediaSlots = (limit: number, current: number) => Math.max(0, limit - current)

/** Tempo de envio proporcional ao tipo: vídeo de 100 MB não cabe nos 20 s das chamadas comuns. */
export const uploadTimeoutMs = (kind: MediaKind) => (kind === 'video' ? 5 * 60_000 : kind === 'pdf' ? 2 * 60_000 : 60_000)
