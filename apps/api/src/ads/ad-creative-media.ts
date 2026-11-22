import type { MediaItemDto } from '@votz/shared-types'
import { MEDIA_ASSET_VIEW_SELECT, assetToItem, type MediaAssetView } from '../media/media-items'

/** Quanto do arquivo de mídia o criativo carrega nas consultas: só o que a tela precisa (nunca a chave do original). */
export const CREATIVE_WITH_MEDIA = { include: { media: { select: MEDIA_ASSET_VIEW_SELECT } } } as const

type PublicUrl = (key: string) => string

/** Mídia do criativo pronta para desenhar, ou null se o anúncio é só texto. Vídeo ainda processando vem como "PROCESSING". */
export function creativeMediaItem(media: MediaAssetView | null | undefined, publicUrl: PublicUrl): MediaItemDto | null {
  return media ? assetToItem(media, publicUrl) : null
}

/** O anúncio já pode ser mostrado: não tem mídia (só texto) ou a mídia terminou de ser preparada. */
export function creativeMediaReady(media: Pick<MediaAssetView, 'status'> | null | undefined): boolean {
  return !media || media.status === 'READY'
}
