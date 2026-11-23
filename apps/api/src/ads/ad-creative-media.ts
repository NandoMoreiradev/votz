import type { Prisma } from '@prisma/client'
import type { MediaItemDto } from '@votz/shared-types'
import { MEDIA_ASSET_VIEW_SELECT, assetToItem, type MediaAssetView } from '../media/media-items'

/**
 * Quanto do arquivo de mídia o criativo carrega nas consultas: só o que a tela precisa (nunca a chave do original), na
 * ordem do carrossel (`position`; o `createdAt` desempata arquivos antigos de uma mídia só, que não têm posição).
 */
const MEDIA_ORDER: Prisma.MediaAssetOrderByWithRelationInput[] = [{ position: 'asc' }, { createdAt: 'asc' }]
export const CREATIVE_WITH_MEDIA = {
  include: { media: { select: MEDIA_ASSET_VIEW_SELECT, orderBy: MEDIA_ORDER } },
} as const

type PublicUrl = (key: string) => string

/** Todas as mídias do criativo prontas para desenhar, na ordem. Vazio se o anúncio é só texto. Vídeo processando vem como "PROCESSING". */
export function creativeMediaItems(media: readonly MediaAssetView[] | null | undefined, publicUrl: PublicUrl): MediaItemDto[] {
  return (media ?? []).map((asset) => assetToItem(asset, publicUrl))
}

/** O anúncio já pode ser mostrado: não tem mídia (só texto) ou todas as mídias terminaram de ser preparadas. */
export function creativeMediaReady(media: readonly Pick<MediaAssetView, 'status'>[] | null | undefined): boolean {
  return (media ?? []).every((asset) => asset.status === 'READY')
}

/** Alguma mídia do criativo falhou ao ser preparada. */
export function creativeMediaFailed(media: readonly Pick<MediaAssetView, 'status'>[] | null | undefined): boolean {
  return (media ?? []).some((asset) => asset.status === 'FAILED')
}

/** Alguma mídia ainda está sendo preparada (vídeo na fila). */
export function creativeMediaProcessing(media: readonly Pick<MediaAssetView, 'status'>[] | null | undefined): boolean {
  return (media ?? []).some((asset) => asset.status === 'PROCESSING')
}
