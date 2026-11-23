import styled from 'styled-components'
import type { MediaItemDto } from '@votz/shared-types'
import { FEED_MEDIA_MAX_HEIGHT, MediaCarousel } from '../media/MediaCarousel'

const Wrap = styled.div<{ $maxWidth?: number }>`
  margin: 10px 0 4px;
  width: 100%;
  max-width: ${({ $maxWidth }) => ($maxWidth ? `${$maxWidth}px` : 'none')};
`

/** As fotos (ou o vídeo) do anúncio em lista. Cai para `media` se a resposta é de uma API que ainda não manda `mediaItems`. */
export function adMediaItems(source: { media?: MediaItemDto | null; mediaItems?: MediaItemDto[] }): MediaItemDto[] {
  return source.mediaItems ?? (source.media ? [source.media] : [])
}

/** Fotos (carrossel) ou vídeo do anúncio, na mesma moldura (1:1, 4:5 ou 16:9) do feed. Não desenha nada se o anúncio é só texto. */
export function AdMedia({ items, maxWidth, label = 'Foto ou vídeo do anúncio' }: { items: MediaItemDto[] | null | undefined; maxWidth?: number; label?: string }) {
  if (!items?.length) return null
  return (
    <Wrap $maxWidth={maxWidth}>
      <MediaCarousel items={items} label={label} maxHeight={FEED_MEDIA_MAX_HEIGHT} />
    </Wrap>
  )
}
