import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import styled, { keyframes } from 'styled-components'
import { CaretLeft, CaretRight, Play } from '@phosphor-icons/react'
import {
  DEFAULT_MEDIA_FORMAT,
  MEDIA_FORMATS,
  mediaSetFormat,
  nearestMediaFormat,
  type MediaFormat,
  type MediaItemDto,
} from '@votz/shared-types'

/**
 * Fotos e vídeos no padrão do Votz (docs/dev/padrao-de-midia-plano-2026-11-21.md): uma moldura só, no formato
 * do conjunto (1:1, 4:5 ou 16:9), para publicações, relatos e anúncios. `cover`: o arquivo já tem a proporção.
 * `contain`: aparece inteiro, com o fundo desfocado da própria imagem (relatos, GIFs, publicações antigas).
 * A moldura tem o tamanho certo antes de carregar: a tela não pula.
 */
interface MediaCarouselProps {
  items: readonly MediaItemDto[]
  /** Toque na foto: abre a visualização em tela cheia no item escolhido. */
  onOpen?: (index: number) => void
  /** Descreve o conjunto para leitores de tela, ex.: "Fotos da publicação". */
  label?: string
  /**
   * Altura máxima da moldura, em px. A proporção do formato não muda (nada é cortado): se a moldura ficaria mais alta
   * que isso, ela fica mais estreita. Sem o limite, a moldura ocupa a largura toda da coluna.
   */
  maxHeight?: number
}

/** Altura máxima da foto ou do vídeo no feed (publicações e anúncios). O retrato 4:5 fica com ~384 px de largura. */
export const FEED_MEDIA_MAX_HEIGHT = 480

export function MediaCarousel({ items, onOpen, label = 'Fotos e vídeos', maxHeight }: MediaCarouselProps) {
  const [measured, setMeasured] = useState<MediaFormat | null>(null)
  const [index, setIndex] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const known = useMemo(() => mediaSetFormat(items), [items])
  const format = known ?? measured ?? DEFAULT_MEDIA_FORMAT
  const spec = MEDIA_FORMATS[format]

  const goTo = useCallback((next: number) => {
    const track = trackRef.current
    if (!track) return
    const clamped = Math.max(0, Math.min(items.length - 1, next))
    track.scrollTo({ left: clamped * track.clientWidth, behavior: 'smooth' })
  }, [items.length])

  const onScroll = () => {
    const track = trackRef.current
    if (!track || !track.clientWidth) return
    setIndex(Math.round(track.scrollLeft / track.clientWidth))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); goTo(index + 1) }
    if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(index - 1) }
  }

  if (!items.length) return null
  const many = items.length > 1

  return (
    <Frame $ratio={`${spec.width} / ${spec.height}`} $maxWidth={maxHeight ? Math.round(maxHeight * spec.ratio) : undefined} role="group" aria-roledescription="carrossel" aria-label={label}>
      <Track
        ref={trackRef}
        onScroll={onScroll}
        onKeyDown={many ? onKeyDown : undefined}
        tabIndex={many ? 0 : undefined}
        aria-label={many ? `${label}: use as setas para passar` : undefined}
      >
        {items.map((item, position) => (
          <Slide key={item.id ?? item.url ?? position} aria-roledescription="item" aria-label={`${position + 1} de ${items.length}`}>
            <MediaSlide
              item={item}
              alt={`${label}, ${position + 1} de ${items.length}`}
              onOpen={onOpen ? () => onOpen(position) : undefined}
              onMeasure={position === 0 && !known ? (w, h) => setMeasured(nearestMediaFormat(w, h)) : undefined}
            />
          </Slide>
        ))}
      </Track>
      {many && (
        <>
          <Counter aria-hidden>{index + 1}/{items.length}</Counter>
          {index > 0 && (
            <NavButton type="button" $side="left" aria-label="Anterior" onClick={() => goTo(index - 1)}>
              <CaretLeft size={18} weight="bold" />
            </NavButton>
          )}
          {index < items.length - 1 && (
            <NavButton type="button" $side="right" aria-label="Próxima" onClick={() => goTo(index + 1)}>
              <CaretRight size={18} weight="bold" />
            </NavButton>
          )}
          <Dots aria-hidden>
            {items.map((item, position) => <Dot key={item.id ?? item.url ?? position} $active={position === index} />)}
          </Dots>
        </>
      )}
    </Frame>
  )
}

interface MediaSlideProps {
  item: MediaItemDto
  alt: string
  onOpen?: () => void
  onMeasure?: (width: number, height: number) => void
}

function MediaSlide({ item, alt, onOpen, onMeasure }: MediaSlideProps) {
  if (item.status !== 'READY' || !item.url) {
    return (
      <Pending role="status">
        <Spinner aria-hidden />
        <span>{item.status === 'FAILED' ? 'Não foi possível processar este vídeo.' : 'Preparando o vídeo. Ele aparece aqui em instantes.'}</span>
      </Pending>
    )
  }
  const contain = item.fit === 'contain'
  if (item.kind === 'VIDEO') {
    return (
      <>
        {contain && item.posterUrl && <Backdrop src={item.posterUrl} alt="" aria-hidden />}
        <Video
          src={item.url}
          poster={item.posterUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          $fit={item.fit}
          aria-label={alt}
          onLoadedMetadata={onMeasure ? (event) => onMeasure(event.currentTarget.videoWidth, event.currentTarget.videoHeight) : undefined}
        />
      </>
    )
  }
  const image = (
    <Image
      src={item.url}
      alt={alt}
      loading="lazy"
      decoding="async"
      $fit={item.fit}
      width={item.width ?? undefined}
      height={item.height ?? undefined}
      onLoad={onMeasure ? (event) => onMeasure(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight) : undefined}
    />
  )
  return (
    <>
      {contain && <Backdrop src={item.thumbUrl ?? item.url} alt="" aria-hidden />}
      {onOpen ? (
        <OpenButton type="button" onClick={onOpen} aria-label={`Ampliar: ${alt}`}>
          {image}
          {item.kind === 'GIF' && <Badge aria-hidden>GIF</Badge>}
        </OpenButton>
      ) : image}
    </>
  )
}

/** Ícone de "vídeo" para miniaturas (lista de anexos, prévia do editor). */
export function VideoBadge() {
  return <Badge aria-hidden><Play size={10} weight="fill" /> Vídeo</Badge>
}

const spin = keyframes`to { transform: rotate(360deg); }`

const Frame = styled.div<{ $ratio: string; $maxWidth?: number }>`
  position: relative;
  width: 100%;
  max-width: ${({ $maxWidth }) => ($maxWidth ? `${$maxWidth}px` : 'none')};
  aspect-ratio: ${({ $ratio }) => $ratio};
  border-radius: ${({ theme }) => theme.radii.lg};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  margin-bottom: 12px;
`

const Track = styled.div`
  display: flex;
  width: 100%;
  height: 100%;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.action}; outline-offset: -2px; }
`

const Slide = styled.div`
  position: relative;
  flex: 0 0 100%;
  height: 100%;
  scroll-snap-align: start;
  overflow: hidden;
`

const Backdrop = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(24px) saturate(1.1);
  transform: scale(1.15);
  opacity: 0.55;
  pointer-events: none;
`

const Image = styled.img<{ $fit: 'cover' | 'contain' }>`
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: ${({ $fit }) => $fit};
`

const Video = styled.video<{ $fit: 'cover' | 'contain' }>`
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: ${({ $fit }) => $fit};
  background: ${({ $fit, theme }) => ($fit === 'contain' ? 'transparent' : theme.colors.primary)};
`

const OpenButton = styled.button`
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: none;
  cursor: zoom-in;
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.action}; outline-offset: -2px; }
`

const Pending = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding: 16px;
  text-align: center;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
`

const Spinner = styled.span`
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid ${({ theme }) => theme.colors.border};
  border-top-color: ${({ theme }) => theme.colors.action};
  animation: ${spin} 0.9s linear infinite;
`

const Counter = styled.span`
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => `${theme.colors.primary}B3`};
  color: ${({ theme }) => theme.colors.white};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-family: ${({ theme }) => theme.fonts.mono};
`

const NavButton = styled.button<{ $side: 'left' | 'right' }>`
  position: absolute;
  top: 50%;
  ${({ $side }) => ($side === 'left' ? 'left: 8px;' : 'right: 8px;')}
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 0;
  background: ${({ theme }) => `${theme.colors.white}E6`};
  color: ${({ theme }) => theme.colors.text};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  cursor: pointer;
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.action}; }
`

const Dots = styled.div`
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 5px;
  padding: 5px 8px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => `${theme.colors.primary}80`};
`

const Dot = styled.span<{ $active: boolean }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({ $active, theme }) => ($active ? theme.colors.white : `${theme.colors.white}80`)};
`

const Badge = styled.span`
  position: absolute;
  left: 8px;
  bottom: 8px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => `${theme.colors.primary}CC`};
  color: ${({ theme }) => theme.colors.white};
  font-size: 10px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
`
