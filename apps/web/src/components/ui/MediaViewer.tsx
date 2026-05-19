import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styled, { keyframes } from 'styled-components'

// ── Types ─────────────────────────────────────────────────────────────────────

export type MediaType = 'image' | 'video' | 'audio' | 'pdf'

export interface MediaViewerItem {
  url: string
  type?: MediaType
}

interface MediaViewerCtx {
  open: (items: MediaViewerItem[], startIndex?: number) => void
  close: () => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const MediaViewerContext = createContext<MediaViewerCtx | null>(null)

export function useMediaViewer(): MediaViewerCtx {
  const ctx = useContext(MediaViewerContext)
  if (!ctx) throw new Error('useMediaViewer must be used inside MediaViewerProvider')
  return ctx
}

// ── Auto-detection ────────────────────────────────────────────────────────────

function detect(url: string): MediaType {
  const u = url.toLowerCase().split('?')[0]
  if (/\.(mp4|mov|webm|avi|mkv)$/.test(u)) return 'video'
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(u)) return 'audio'
  if (/\.pdf$/.test(u)) return 'pdf'
  return 'image'
}

function fileName(url: string) {
  return decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? '')
}

// ── Keyframes ─────────────────────────────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0 }
  to   { opacity: 1 }
`

const popIn = keyframes`
  from { opacity: 0; transform: scale(0.96) translateY(4px) }
  to   { opacity: 1; transform: scale(1)    translateY(0)   }
`

// ── Overlay ───────────────────────────────────────────────────────────────────

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(8, 8, 10, 0.94);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ${fadeIn} 0.15s ease;
`

const Stage = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 64px 80px 56px;
  box-sizing: border-box;
  overflow: hidden;

  @media (max-width: 640px) { padding: 64px 16px 56px; }
`

const MediaWrap = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  max-height: 100%;
  animation: ${popIn} 0.18s ease;
`

// ── Media renderers ───────────────────────────────────────────────────────────

const StyledImg = styled.img`
  max-width: min(92vw, 1280px);
  max-height: calc(100vh - 148px);
  object-fit: contain;
  border-radius: 6px;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
`

const StyledVideo = styled.video`
  max-width: min(92vw, 1100px);
  max-height: calc(100vh - 148px);
  border-radius: 6px;
  display: block;
  outline: none;
`

const AudioBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;

  audio {
    width: min(360px, 88vw);
  }
`

const AudioIcon = styled.div`
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.75rem;
`

const MediaFileName = styled.p`
  margin: 0;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const PdfBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: min(900px, 92vw);
`

const PdfFrame = styled.iframe`
  width: 100%;
  height: calc(100vh - 196px);
  border: none;
  border-radius: 6px;
  background: #fff;
  display: block;

  @media (max-width: 640px) { display: none; }
`

const PdfMobileFallback = styled.div`
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 3rem;

  @media (max-width: 640px) { display: flex; }
`

const PdfOpenLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.8125rem;
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.35);
    color: #fff;
  }
`

// ── Controls ──────────────────────────────────────────────────────────────────

const IconBtn = styled.button`
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, border-color 0.15s;
  flex-shrink: 0;

  &:hover { background: rgba(255, 255, 255, 0.15); border-color: rgba(255, 255, 255, 0.2); }
  &:disabled { opacity: 0; pointer-events: none; }

  @media (max-width: 640px) { width: 36px; height: 36px; }
`

const CloseBtn = styled(IconBtn)`
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 1;
`

const NavBtn = styled(IconBtn)<{ $side: 'left' | 'right' }>`
  position: absolute;
  top: 50%;
  ${({ $side }) => $side}: 14px;
  transform: translateY(-50%);
  font-size: 1.375rem;
  z-index: 1;

  @media (max-width: 640px) {
    ${({ $side }) => $side}: 6px;
  }
`

// ── Footer / pagination ───────────────────────────────────────────────────────

const PaginationBar = styled.div`
  position: fixed;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 5px;
`

const Dot = styled.div<{ $active: boolean }>`
  width: ${({ $active }) => ($active ? '18px' : '6px')};
  height: 6px;
  border-radius: 3px;
  background: ${({ $active }) => ($active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.28)')};
  transition: width 0.2s ease, background 0.2s ease;
`

const CountText = styled.span`
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.4);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
`

// ── Modal component ───────────────────────────────────────────────────────────

interface State {
  items: Required<MediaViewerItem>[]
  index: number
}

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="1" y1="1" x2="12" y2="12" />
      <line x1="12" y1="1" x2="1" y2="12" />
    </svg>
  )
}

function Modal({ state, close, prev, next }: {
  state: State
  close: () => void
  prev: () => void
  next: () => void
}) {
  const { items, index } = state
  const item = items[index]
  const total = items.length
  const name = fileName(item.url)

  function stopProp(e: React.MouseEvent) { e.stopPropagation() }

  return (
    <Overlay onClick={close}>
      <CloseBtn onClick={(e) => { stopProp(e); close() }} aria-label="Fechar"><CloseIcon /></CloseBtn>

      <NavBtn $side="left"  disabled={index === 0}         onClick={(e) => { stopProp(e); prev() }} aria-label="Anterior">‹</NavBtn>
      <NavBtn $side="right" disabled={index === total - 1} onClick={(e) => { stopProp(e); next() }} aria-label="Próximo">›</NavBtn>

      <Stage onClick={close}>
        <MediaWrap key={item.url} onClick={stopProp}>
          {item.type === 'image' && (
            <StyledImg src={item.url} alt={name} draggable={false} />
          )}

          {item.type === 'video' && (
            <StyledVideo controls autoPlay playsInline>
              <source src={item.url} />
              Seu navegador não suporta reprodução de vídeo.
            </StyledVideo>
          )}

          {item.type === 'audio' && (
            <AudioBox>
              <AudioIcon>🎵</AudioIcon>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls autoPlay src={item.url} aria-label={name} />
              <MediaFileName>{name}</MediaFileName>
            </AudioBox>
          )}

          {item.type === 'pdf' && (
            <PdfBox>
              <PdfFrame src={item.url} title={name} />
              <PdfMobileFallback>
                <span>📄</span>
                <MediaFileName>{name}</MediaFileName>
              </PdfMobileFallback>
              <PdfOpenLink href={item.url} target="_blank" rel="noopener noreferrer">
                Abrir PDF em nova aba ↗
              </PdfOpenLink>
            </PdfBox>
          )}
        </MediaWrap>
      </Stage>

      {total > 1 && (
        <PaginationBar>
          {total <= 9
            ? items.map((_, i) => <Dot key={i} $active={i === index} />)
            : <CountText>{index + 1} / {total}</CountText>
          }
        </PaginationBar>
      )}
    </Overlay>
  )
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function MediaViewerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null)
  const isOpen = state !== null

  const open = useCallback((items: MediaViewerItem[], startIndex = 0) => {
    setState({
      items: items.map((it) => ({ url: it.url, type: it.type ?? detect(it.url) })),
      index: Math.max(0, Math.min(startIndex, items.length - 1)),
    })
  }, [])

  const close = useCallback(() => setState(null), [])

  const prev = useCallback(() =>
    setState((s) => (s && s.index > 0 ? { ...s, index: s.index - 1 } : s)), [])

  const next = useCallback(() =>
    setState((s) => (s && s.index < s.items.length - 1 ? { ...s, index: s.index + 1 } : s)), [])

  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')      close()
      if (e.key === 'ArrowLeft')   prev()
      if (e.key === 'ArrowRight')  next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close, prev, next])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  return (
    <MediaViewerContext.Provider value={{ open, close }}>
      {children}
      {state && createPortal(
        <Modal state={state} close={close} prev={prev} next={next} />,
        document.body,
      )}
    </MediaViewerContext.Provider>
  )
}
