import {
  MEDIA_FORMATS,
  legacyMediaItems,
  nearestMediaFormat,
  type MediaAssetKind,
  type MediaFormat,
  type MediaItemDto,
} from '@votz/shared-types'

/** O que a tela precisa de uma linha de `media_assets`. */
export interface MediaAssetView {
  id: string
  kind: MediaAssetKind
  status: 'UPLOADING' | 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED'
  format: MediaFormat | null
  key: string | null
  feedKey: string | null
  thumbKey: string | null
  posterKey: string | null
  width: number | null
  height: number | null
  sourceWidth: number | null
  sourceHeight: number | null
  durationMs: number | null
  legacy: boolean
}

export const MEDIA_ASSET_VIEW_SELECT = {
  id: true,
  kind: true,
  status: true,
  format: true,
  key: true,
  feedKey: true,
  thumbKey: true,
  posterKey: true,
  width: true,
  height: true,
  sourceWidth: true,
  sourceHeight: true,
  durationMs: true,
  legacy: true,
} as const

type PublicUrl = (key: string) => string

/**
 * Item pronto para desenhar. Recortado no padrão: `cover` (o arquivo já tem a proporção da moldura).
 * GIF e publicação antiga: `contain` (aparece inteiro, com fundo desfocado).
 */
export function assetToItem(asset: MediaAssetView, publicUrl: PublicUrl): MediaItemDto {
  const contain = asset.legacy || asset.kind === 'GIF'
  const format =
    asset.format ?? nearestMediaFormat(asset.width ?? asset.sourceWidth, asset.height ?? asset.sourceHeight)
  if (asset.status !== 'READY' || !asset.key) {
    // Enquanto processa, a moldura já aparece no tamanho certo (com aviso), sem expor o original.
    const frame = format ? MEDIA_FORMATS[format] : null
    return {
      id: asset.id,
      kind: asset.kind,
      format,
      fit: contain ? 'contain' : 'cover',
      width: frame?.width ?? null,
      height: frame?.height ?? null,
      url: null,
      fullUrl: null,
      thumbUrl: null,
      posterUrl: null,
      status: asset.status === 'FAILED' ? 'FAILED' : 'PROCESSING',
      durationMs: asset.durationMs,
    }
  }
  return {
    id: asset.id,
    kind: asset.kind,
    format,
    fit: contain ? 'contain' : 'cover',
    width: asset.width,
    height: asset.height,
    url: publicUrl(asset.feedKey ?? asset.key),
    fullUrl: publicUrl(asset.key),
    thumbUrl: asset.thumbKey ? publicUrl(asset.thumbKey) : null,
    posterUrl: asset.posterKey ? publicUrl(asset.posterKey) : null,
    status: 'READY',
    durationMs: asset.durationMs,
  }
}

/**
 * Publicação de antes do padrão que ainda não passou pelo job de migração: só temos os links. A moldura
 * fica por conta do app (mede ao carregar) e o arquivo aparece inteiro. Mesma regra que os apps usam.
 */
export function legacyItemsFromUrls(urls: readonly string[]): MediaItemDto[] {
  return legacyMediaItems(urls)
}

/**
 * Itens de cada publicação: as linhas de `media_assets` (na ordem) quando existem; senão, os links antigos.
 * Itens que falharam no processamento não aparecem para quem vê a publicação.
 */
export function itemsForPost(
  assets: readonly MediaAssetView[] | undefined,
  legacyUrls: readonly string[],
  publicUrl: PublicUrl,
): MediaItemDto[] {
  if (assets && assets.length) return assets.map((asset) => assetToItem(asset, publicUrl)).filter((item) => item.status !== 'FAILED')
  return legacyItemsFromUrls(legacyUrls)
}
