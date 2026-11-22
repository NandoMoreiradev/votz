import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import styled from 'styled-components'
import { MagnifyingGlassMinus, MagnifyingGlassPlus, X } from '@phosphor-icons/react'
import {
  MEDIA_FORMATS,
  MEDIA_FORMAT_ORDER,
  cropFromView,
  maxCropZoom,
  type MediaAssetKind,
  type MediaCrop,
  type MediaFormat,
} from '@votz/shared-types'

/** Um arquivo no editor: o que foi escolhido no computador e o recorte atual. */
export interface CropEditorItem {
  key: string
  /** Endereço local (blob) do arquivo escolhido: a prévia não depende do servidor. */
  previewUrl: string
  kind: MediaAssetKind
  width: number
  height: number
  view: CropView
}

export interface CropView {
  zoom: number
  centerX: number
  centerY: number
}

export const INITIAL_VIEW: CropView = { zoom: 1, centerX: 0.5, centerY: 0.5 }

/** Recorte (frações do original) do que o editor mostra. GIF não é recortado. */
export function cropOf(item: Pick<CropEditorItem, 'kind' | 'width' | 'height' | 'view'>, format: MediaFormat): MediaCrop | undefined {
  if (item.kind === 'GIF') return undefined
  return cropFromView(item.width, item.height, format, item.view)
}

/**
 * Mostra o arquivo dentro da moldura exatamente como vai ficar no feed: o original é posicionado para que a
 * parte recortada ocupe a moldura inteira. GIF aparece inteiro (não é recortado).
 */
export function CroppedMedia({ item, format, label }: { item: Pick<CropEditorItem, 'previewUrl' | 'kind' | 'width' | 'height' | 'view'>; format: MediaFormat; label: string }) {
  const crop = cropOf(item, format)
  const style = crop
    ? {
        width: `${100 / crop.w}%`,
        height: `${100 / crop.h}%`,
        left: `${(-crop.x / crop.w) * 100}%`,
        top: `${(-crop.y / crop.h) * 100}%`,
      }
    : { width: '100%', height: '100%', left: 0, top: 0, objectFit: 'contain' as const }
  if (item.kind === 'VIDEO') return <PositionedVideo src={item.previewUrl} style={style} muted playsInline preload="metadata" aria-label={label} />
  return <PositionedImage src={item.previewUrl} style={style} alt={label} draggable={false} />
}

interface MediaCropEditorProps {
  open: boolean
  items: CropEditorItem[]
  format: MediaFormat
  /** Item que abre selecionado. */
  startIndex?: number
  onFormatChange: (format: MediaFormat) => void
  onViewChange: (key: string, view: CropView) => void
  onClose: () => void
}

/**
 * Editor de formato e enquadramento, como no Instagram: escolha Quadrado, Retrato ou Paisagem (vale para todos os
 * itens da publicação), arraste para enquadrar e aproxime com a roda do mouse, o controle deslizante, os botões ou o
 * teclado (setas movem, + e − aproximam). A prévia é exatamente o que o servidor vai gerar.
 */
export function MediaCropEditor({ open, items, format, startIndex = 0, onFormatChange, onViewChange, onClose }: MediaCropEditorProps) {
  const [selected, setSelected] = useState(startIndex)
  const frameRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointerId: number; x: number; y: number; view: CropView } | null>(null)

  useEffect(() => { if (open) setSelected(Math.min(startIndex, Math.max(0, items.length - 1))) }, [open, startIndex, items.length])

  const item = items[selected]
  if (!item) return null
  const spec = MEDIA_FORMATS[format]
  const croppable = item.kind !== 'GIF'
  const maxZoom = croppable ? maxCropZoom(item.width, item.height, format) : 1
  const crop = cropOf(item, format)

  /** Aplica a vista já ajustada (a moldura nunca sai da imagem). */
  const apply = (view: CropView) => {
    if (!croppable) return
    const next = cropFromView(item.width, item.height, format, view)
    onViewChange(item.key, { zoom: Math.min(maxZoom, Math.max(1, view.zoom)), centerX: next.x + next.w / 2, centerY: next.y + next.h / 2 })
  }

  /** Arrastar `dx` pixels na moldura move o centro em `dx × largura do recorte ÷ largura da moldura`. */
  const moveBy = (dxPx: number, dyPx: number, from: CropView) => {
    const frame = frameRef.current
    if (!frame || !crop) return
    apply({ ...from, centerX: from.centerX - (dxPx / frame.clientWidth) * crop.w, centerY: from.centerY - (dyPx / frame.clientHeight) * crop.h })
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!croppable) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, view: item.view }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (!start || start.pointerId !== event.pointerId) return
    moveBy(event.clientX - start.x, event.clientY - start.y, start.view)
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!croppable) return
    apply({ ...item.view, zoom: item.view.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08) })
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!croppable || !crop) return
    const step = 0.04
    const keys: Record<string, () => void> = {
      ArrowLeft: () => apply({ ...item.view, centerX: item.view.centerX - step * crop.w }),
      ArrowRight: () => apply({ ...item.view, centerX: item.view.centerX + step * crop.w }),
      ArrowUp: () => apply({ ...item.view, centerY: item.view.centerY - step * crop.h }),
      ArrowDown: () => apply({ ...item.view, centerY: item.view.centerY + step * crop.h }),
      '+': () => apply({ ...item.view, zoom: item.view.zoom * 1.1 }),
      '=': () => apply({ ...item.view, zoom: item.view.zoom * 1.1 }),
      '-': () => apply({ ...item.view, zoom: item.view.zoom / 1.1 }),
    }
    const action = keys[event.key]
    if (action) { event.preventDefault(); action() }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Overlay />
        <Content aria-describedby="crop-help">
          <Header>
            <Title>Formato e enquadramento</Title>
            <CloseButton aria-label="Fechar editor"><X size={16} /></CloseButton>
          </Header>

          <Formats role="radiogroup" aria-label="Formato da publicação">
            {MEDIA_FORMAT_ORDER.map((option) => {
              const optionSpec = MEDIA_FORMATS[option]
              return (
                <FormatButton key={option} type="button" role="radio" aria-checked={format === option} $active={format === option} onClick={() => onFormatChange(option)}>
                  <FormatShape $ratio={optionSpec.ratio} aria-hidden />
                  <span>{optionSpec.label}</span>
                  <small>{optionSpec.ratioLabel}</small>
                </FormatButton>
              )
            })}
          </Formats>

          <Stage>
            <CropFrame
              ref={frameRef}
              $ratio={`${spec.width} / ${spec.height}`}
              $tall={spec.ratio < 1}
              $draggable={croppable}
              tabIndex={croppable ? 0 : -1}
              role={croppable ? 'application' : undefined}
              aria-label={croppable ? 'Área de enquadramento. Arraste ou use as setas para mover; + e − para aproximar.' : 'GIF: aparece inteiro, sem recorte.'}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
              onKeyDown={onKeyDown}
            >
              <CroppedMedia item={item} format={format} label={`Item ${selected + 1}`} />
              {croppable && <Grid aria-hidden />}
            </CropFrame>
          </Stage>

          <Help id="crop-help">
            {croppable
              ? 'Arraste a imagem para enquadrar. Todos os itens da publicação usam o mesmo formato.'
              : 'GIF aparece inteiro dentro da moldura, sem recorte.'}
          </Help>

          {croppable && (
            <ZoomRow>
              <IconBtn type="button" aria-label="Afastar" onClick={() => apply({ ...item.view, zoom: item.view.zoom / 1.15 })} disabled={item.view.zoom <= 1.001}>
                <MagnifyingGlassMinus size={16} />
              </IconBtn>
              <ZoomRange
                type="range"
                min={1}
                max={maxZoom}
                step={0.01}
                value={Math.min(item.view.zoom, maxZoom)}
                aria-label="Aproximação"
                onChange={(event) => apply({ ...item.view, zoom: Number(event.target.value) })}
                disabled={maxZoom <= 1}
              />
              <IconBtn type="button" aria-label="Aproximar" onClick={() => apply({ ...item.view, zoom: item.view.zoom * 1.15 })} disabled={item.view.zoom >= maxZoom - 0.001}>
                <MagnifyingGlassPlus size={16} />
              </IconBtn>
            </ZoomRow>
          )}

          {items.length > 1 && (
            <Thumbs role="tablist" aria-label="Itens da publicação">
              {items.map((entry, position) => (
                <Thumb
                  key={entry.key}
                  type="button"
                  role="tab"
                  aria-selected={position === selected}
                  aria-label={`Item ${position + 1}${entry.kind === 'VIDEO' ? ' (vídeo)' : ''}`}
                  $active={position === selected}
                  $ratio={`${spec.width} / ${spec.height}`}
                  onClick={() => setSelected(position)}
                >
                  <CroppedMedia item={entry} format={format} label="" />
                </Thumb>
              ))}
            </Thumbs>
          )}

          <Footer>
            <DoneButton type="button" onClick={onClose}>Concluir</DoneButton>
          </Footer>
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const PositionedImage = styled.img`
  position: absolute;
  max-width: none;
  user-select: none;
  pointer-events: none;
`

const PositionedVideo = styled.video`
  position: absolute;
  max-width: none;
  pointer-events: none;
`

const Overlay = styled(Dialog.Overlay)`
  position: fixed;
  inset: 0;
  background: ${({ theme }) => `${theme.colors.primary}99`};
  z-index: 900;
`

const Content = styled(Dialog.Content)`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(560px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  background: ${({ theme }) => theme.colors.white};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  padding: ${({ theme }) => theme.spacing[5]};
  z-index: 901;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`

const Title = styled(Dialog.Title)`
  margin: 0;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.primary};
`

const CloseButton = styled(Dialog.Close)`
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
`

const Formats = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`

const FormatButton = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 2px solid ${({ $active, theme }) => ($active ? theme.colors.action : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? `${theme.colors.action}0F` : theme.colors.surface)};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  small { color: ${({ theme }) => theme.colors.muted}; font-family: ${({ theme }) => theme.fonts.mono}; font-weight: 400; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 2px; }
`

const FormatShape = styled.span<{ $ratio: number }>`
  display: block;
  height: 26px;
  width: ${({ $ratio }) => Math.round(26 * $ratio)}px;
  border: 2px solid currentColor;
  border-radius: 3px;
`

const Stage = styled.div`
  display: flex;
  justify-content: center;
  background: ${({ theme }) => theme.colors.neutral};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 8px;
`

const CropFrame = styled.div<{ $ratio: string; $tall: boolean; $draggable: boolean }>`
  position: relative;
  overflow: hidden;
  aspect-ratio: ${({ $ratio }) => $ratio};
  ${({ $tall }) => ($tall ? 'height: min(60vh, 520px);' : 'width: 100%;')}
  max-width: 100%;
  background: ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.radii.sm};
  touch-action: none;
  cursor: ${({ $draggable }) => ($draggable ? 'grab' : 'default')};
  &:active { cursor: ${({ $draggable }) => ($draggable ? 'grabbing' : 'default')}; }
  &:focus-visible { outline: 3px solid ${({ theme }) => theme.colors.action}; outline-offset: 2px; }
`

/** Regra dos terços, para ajudar a enquadrar. */
const Grid = styled.span`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(to right, transparent calc(33.33% - 0.5px), ${({ theme }) => `${theme.colors.white}66`} calc(33.33% - 0.5px), ${({ theme }) => `${theme.colors.white}66`} calc(33.33% + 0.5px), transparent calc(33.33% + 0.5px), transparent calc(66.66% - 0.5px), ${({ theme }) => `${theme.colors.white}66`} calc(66.66% - 0.5px), ${({ theme }) => `${theme.colors.white}66`} calc(66.66% + 0.5px), transparent calc(66.66% + 0.5px)),
    linear-gradient(to bottom, transparent calc(33.33% - 0.5px), ${({ theme }) => `${theme.colors.white}66`} calc(33.33% - 0.5px), ${({ theme }) => `${theme.colors.white}66`} calc(33.33% + 0.5px), transparent calc(33.33% + 0.5px), transparent calc(66.66% - 0.5px), ${({ theme }) => `${theme.colors.white}66`} calc(66.66% - 0.5px), ${({ theme }) => `${theme.colors.white}66`} calc(66.66% + 0.5px), transparent calc(66.66% + 0.5px));
`

const Help = styled.p`
  margin: ${({ theme }) => theme.spacing[3]} 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
`

const ZoomRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const ZoomRange = styled.input`
  flex: 1;
  accent-color: ${({ theme }) => theme.colors.action};
`

const IconBtn = styled.button`
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`

const Thumbs = styled.div`
  display: flex;
  gap: 8px;
  margin-top: ${({ theme }) => theme.spacing[4]};
  overflow-x: auto;
`

const Thumb = styled.button<{ $active: boolean; $ratio: string }>`
  position: relative;
  flex: 0 0 64px;
  aspect-ratio: ${({ $ratio }) => $ratio};
  overflow: hidden;
  padding: 0;
  border-radius: ${({ theme }) => theme.radii.sm};
  border: 2px solid ${({ $active, theme }) => ($active ? theme.colors.action : 'transparent')};
  background: ${({ theme }) => theme.colors.primary};
  cursor: pointer;
`

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-top: ${({ theme }) => theme.spacing[5]};
`

const DoneButton = styled.button`
  padding: 10px 20px;
  border: 0;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.white};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  cursor: pointer;
`
