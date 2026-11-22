import type { MediaAssetKind } from '@votz/shared-types'

/** Tipo do arquivo escolhido no computador, ou null se o Votz não aceita. */
export function kindOfFile(file: File): MediaAssetKind | null {
  if (file.type === 'image/gif') return 'GIF'
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'IMAGE'
  if (['video/mp4', 'video/quicktime'].includes(file.type)) return 'VIDEO'
  return null
}

/** Tamanho como a pessoa vê (o navegador já aplica a rotação da câmera), lido do arquivo local. */
export function measureLocal(url: string, kind: MediaAssetKind): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (kind === 'VIDEO') {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => resolve({ width: video.videoWidth || 1, height: video.videoHeight || 1 })
      video.onerror = () => resolve({ width: 1, height: 1 })
      video.src = url
      return
    }
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 })
    image.onerror = () => resolve({ width: 1, height: 1 })
    image.src = url
  })
}
