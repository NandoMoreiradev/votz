import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import {
  Camera,
  Check,
  Checks,
  Clock,
  Microphone,
  Paperclip,
  PaperPlaneTilt,
  Stop,
  WarningCircle,
} from '@phosphor-icons/react'
import { CHAT_QUALITY_VIEW, type ChatMediaQuality } from '@votz/chat-core'
import type { ConversationWallpaper } from '@votz/shared-types'

/**
 * Peças visuais compartilhadas entre conversas pessoais/grupo (`ChatPane`) e conversas com páginas
 * (`PageConversationViews`). O visual, as bolhas e a barra de digitação (texto, foto, mídia, HD e áudio)
 * são os mesmos; só muda o transporte por baixo.
 */

export const ChatBox = styled.section`
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 56px);
  min-height: 0;
  overflow: hidden;
  @media (min-width: 960px) {
    height: 100%;
  }
  background: ${({ theme }) => theme.colors.white};
`

export const ChatHeader = styled.header`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  min-height: 64px;
  padding: 0 16px;
  gap: 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  h1 {
    margin: 0;
    font-size: 16px;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  a {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 14px;
    min-height: 40px;
    display: flex;
    align-items: center;
  }
`

export const ChatHeaderIdentity = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`

export const ChatHeaderStatus = styled.span<{ $active?: boolean }>`
  font-size: 12.5px;
  color: ${({ theme, $active }) => ($active ? theme.colors.positive : theme.colors.muted)};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
`

export const ChatAvatar = styled.span`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.colors.action}14;
  color: ${({ theme }) => theme.colors.action};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  font-size: 17px;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`

export const ChatDayChip = styled.div`
  align-self: center;
  padding: 5px 14px;
  margin: 16px 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.muted};
  background: ${({ theme }) => theme.colors.white};
  box-shadow: 0 1px 1px rgba(13, 13, 13, 0.1);
`

export const ChatEmptyHint = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
`

export const ChatMetaRow = styled.small`
  float: right;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin: 8px 0 -3px 12px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10.5px;
  line-height: 1;
  color: ${({ theme }) => theme.colors.muted};
  white-space: nowrap;
  user-select: none;
`

export const ChatCheckRead = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.colors.positive};
`

export const ChatCheckAlert = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.colors.action};
`

export const ChatCard = styled.div`
  padding: 22px;
  margin: 20px;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 16px;
  p {
    color: ${({ theme }) => theme.colors.muted};
    line-height: 1.6;
  }
  input {
    display: block;
    box-sizing: border-box;
    width: 100%;
    padding: 12px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 10px;
    margin: 8px 0 16px;
    font: inherit;
  }
`

export const ChatButton = styled.button<{ $secondary?: boolean }>`
  min-height: 42px;
  padding: 9px 16px;
  border: 1px solid
    ${({ theme, $secondary }) => ($secondary ? theme.colors.border : theme.colors.action)};
  border-radius: 22px;
  color: ${({ theme, $secondary }) => ($secondary ? theme.colors.text : theme.colors.white)};
  background: ${({ theme, $secondary }) => ($secondary ? theme.colors.white : theme.colors.action)};
  font: inherit;
  cursor: pointer;
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`

export const ChatStatus = styled.div`
  svg { flex-shrink: 0; }
  padding: 10px 20px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  background: ${({ theme }) => theme.colors.neutral};
  line-height: 1.5;
  display: flex;
  gap: 8px;
  align-items: center;
`

export const ChatHistory = styled.div<{ $wallpaper?: ConversationWallpaper }>`
  flex: 1;
  padding: 24px clamp(16px, 6%, 112px);
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: ${({ theme, $wallpaper }) =>
    $wallpaper === 'SOFT'
      ? theme.colors.neutral
      : $wallpaper === 'PLAIN'
        ? theme.colors.white
        : theme.colors.chatBackground};
`

export const ChatBubble = styled.div<{
  $own: boolean
  $fontSize?: number
  $first?: boolean
  $unreadable?: boolean
  $tools?: boolean
}>`
  position: relative;
  display: flow-root;
  flex-shrink: 0;
  align-self: ${({ $own }) => ($own ? 'flex-end' : 'flex-start')};
  max-width: min(78%, 640px);
  padding: 8px 12px;
  margin-top: ${({ $first }) => ($first ? '14px' : '0')};
  border-radius: ${({ $own, $first }) =>
    $first ? ($own ? '12px 0 12px 12px' : '0 12px 12px 12px') : '12px'};
  background: ${({ theme, $own }) =>
    $own ? theme.colors.bubbleOwn : theme.colors.bubblePeer};
  box-shadow: 0 1px 1px rgba(13, 13, 13, 0.14);
  color: ${({ theme, $unreadable }) => ($unreadable ? theme.colors.muted : theme.colors.text)};
  font-size: ${({ $fontSize, $unreadable }) =>
    $unreadable ? '13px' : $fontSize ? `${$fontSize}px` : '15px'};
  font-style: ${({ $unreadable }) => ($unreadable ? 'italic' : 'normal')};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.4;
  ${({ $first, $own, theme }) =>
    $first
      ? `
    &::after {
      content: '';
      position: absolute;
      top: 0;
      ${$own ? 'right: -8px;' : 'left: -8px;'}
      width: 8px;
      height: 10px;
      background: ${$own ? theme.colors.bubbleOwn : theme.colors.bubblePeer};
      clip-path: ${$own ? 'polygon(0 0, 100% 0, 0 100%)' : 'polygon(0 0, 100% 0, 100% 100%)'};
    }
  `
      : ''}
  ${({ $tools }) =>
    $tools
      ? `
    @media (hover: none) {
      padding-right: 32px;
    }
  `
      : ''}
  &:hover > [data-bubble-menu],
  &:focus-within > [data-bubble-menu] {
    opacity: 1;
  }
  strong {
    display: block;
    font-size: 12px;
    color: ${({ theme }) => theme.colors.primary};
    margin-bottom: 2px;
  }
`

export const ChatBubbleMenuButton = styled.button`
  position: absolute;
  top: 2px;
  right: 4px;
  z-index: 1;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: ${({ theme }) => theme.colors.muted};
  background: transparent;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s;
  &:focus-visible {
    opacity: 1;
  }
  @media (hover: none) {
    opacity: 0.75;
  }
`

export const ChatMenuBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10;
`

export const ChatMenuPanel = styled.div<{ $align: 'left' | 'right' }>`
  position: absolute;
  top: 100%;
  ${({ $align }) => ($align === 'right' ? 'right: 0;' : 'left: 0;')}
  z-index: 20;
  min-width: 224px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14.5px;
  font-style: normal;
  font-weight: 400;
  white-space: normal;
  text-align: left;
  button,
  a,
  label {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 42px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-decoration: none;
    cursor: pointer;
  }
  button:hover,
  a:hover,
  label:hover {
    background: ${({ theme }) => theme.colors.neutral};
  }
  input[type='checkbox'] {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: ${({ theme }) => theme.colors.action};
  }
`

export const ChatMenuReactions = styled.div`
  display: flex;
  justify-content: space-around;
  gap: 4px;
  padding: 4px;
  border-radius: 24px;
  background: ${({ theme }) => theme.colors.neutral};
  button {
    width: 40px;
    min-height: 40px;
    padding: 0;
    justify-content: center;
    border-radius: 50%;
    font-size: 22px;
    line-height: 1;
  }
  button:hover {
    background: ${({ theme }) => theme.colors.white};
  }
`

export const ChatHeaderMenuWrap = styled.div`
  position: relative;
  flex-shrink: 0;
`

export const ChatIconButton = styled.button`
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: transparent;
  color: ${({ theme }) => theme.colors.primary};
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.colors.neutral};
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`

export const ChatBanner = styled.div`
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  max-width: 92%;
  margin: 4px 0 12px;
  padding: 8px 14px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.white};
  box-shadow: 0 1px 1px rgba(13, 13, 13, 0.1);
  color: ${({ theme }) => theme.colors.muted};
  font-size: 12.5px;
  line-height: 1.4;
  text-align: center;
  svg {
    flex-shrink: 0;
  }
`

export const ChatVisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`

export const ChatComposerForm = styled.form`
  flex-shrink: 0;
  background: ${({ theme }) => theme.colors.chatBackground};
  padding: 12px 16px;
  display: flex;
  gap: 12px;
  align-items: flex-end;
  button {
    display: grid;
    place-items: center;
  }
`

export const ChatInputPill = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-end;
  min-height: 46px;
  padding-right: 6px;
  border-radius: 24px;
  background: ${({ theme }) => theme.colors.white};
  textarea {
    flex: 1;
    min-width: 0;
    resize: none;
    max-height: 150px;
    min-height: 46px;
    border: 0;
    outline: 0;
    background: transparent;
    padding: 13px 18px;
    font: inherit;
    font-size: 15px;
    line-height: 1.3;
    box-sizing: border-box;
  }
  &:focus-within {
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.action};
  }
`

export const ChatInlineIcon = styled.button`
  width: 40px;
  height: 46px;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`

export const ChatRoundButton = styled.button`
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.white};
  cursor: pointer;
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`

export const ChatActions = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`

export const ChatNote = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 8px 20px 0;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.muted};
  background: ${({ theme }) => theme.colors.neutral};
  > span {
    flex: 1;
  }
  button {
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.action};
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    min-height: 32px;
  }
`

export const ChatMediaBox = styled.div`
  margin: 4px 0 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  img,
  video {
    display: block;
    max-width: 100%;
    max-height: 280px;
    border-radius: 12px;
    object-fit: cover;
  }
  audio {
    max-width: 100%;
  }
`

export const ChatQuote = styled.div`
  border-left: 3px solid ${({ theme }) => theme.colors.action};
  padding: 4px 8px;
  margin-bottom: 6px;
  background: rgba(26, 26, 46, 0.05);
  border-radius: 6px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
`

export const ChatForwardTag = styled.div`
  font-size: 11px;
  font-style: italic;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 4px;
`

export const ChatCardLink = styled(Link)`
  display: block;
  margin-top: 6px;
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.primary};
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
`

export const ChatReactionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
`

export const ChatPill = styled.button<{ $mine?: boolean }>`
  border: 1px solid
    ${({ theme, $mine }) => ($mine ? theme.colors.action : theme.colors.border)};
  background: ${({ theme }) => theme.colors.white};
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
`

export const ChatSearchBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.neutral};
  input {
    flex: 1;
    min-width: 0;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 8px;
    padding: 6px 10px;
    background: ${({ theme }) => theme.colors.white};
  }
`

export const ChatHdToggle = styled(ChatInlineIcon)<{ $on: boolean }>`
  width: 36px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: ${({ theme, $on }) => ($on ? theme.colors.action : theme.colors.muted)};
`

export function renderChatDeliveryIcon(icon: 'clock' | 'check' | 'checks' | 'checks-read' | 'alert' | null) {
  if (!icon) return null
  if (icon === 'clock') return <Clock size={13} aria-hidden="true" />
  if (icon === 'check') return <Check size={13} aria-hidden="true" />
  if (icon === 'checks') return <Checks size={14} aria-hidden="true" />
  if (icon === 'checks-read')
    return (
      <ChatCheckRead aria-hidden="true">
        <Checks size={14} weight="bold" />
      </ChatCheckRead>
    )
  return (
    <ChatCheckAlert aria-hidden="true">
      <WarningCircle size={13} />
    </ChatCheckAlert>
  )
}

export function formatChatDayDivider(ts: string | number | Date): { key: string; label: string } {
  const d = new Date(ts)
  const stamp = (v: Date) => `${v.getFullYear()}-${v.getMonth()}-${v.getDate()}`
  const key = stamp(d)
  const now = new Date()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (key === stamp(now)) return { key, label: 'Hoje' }
  if (key === stamp(yesterday)) return { key, label: 'Ontem' }
  return { key, label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) }
}

export function formatChatTime(ts: string | number | Date): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export interface ChatComposerBarProps {
  draft: string
  onDraftChange: (value: string) => void
  onBlur?: () => void
  onSubmitText: () => void | Promise<unknown>
  onSendFile: (file: File, quality: ChatMediaQuality) => void | Promise<unknown>
  onSendAudio: (blob: Blob) => void | Promise<unknown>
  onError: (message: string) => void
  placeholder: string
  maxLength?: number
  canType: boolean
  canWrite: boolean
  busy: boolean
  quality: ChatMediaQuality
  onToggleQuality: () => void
  replyTo?: { senderName?: string | null; excerpt: string } | null
  forwardedDraft?: boolean
  onCancelNote?: () => void
  uploadProgress: number | null
  onCancelUpload?: () => void
}

/**
 * Barra única de digitação e envio: texto, botão HD, anexo de arquivo/mídia, foto rápida da câmera
 * e gravação de áudio no microfone. Igual para conversas pessoais e conversas com páginas.
 */
export function ChatComposerBar({
  draft,
  onDraftChange,
  onBlur,
  onSubmitText,
  onSendFile,
  onSendAudio,
  onError,
  placeholder,
  maxLength = 4000,
  canType,
  canWrite,
  busy,
  quality,
  onToggleQuality,
  replyTo,
  forwardedDraft,
  onCancelNote,
  uploadProgress,
  onCancelUpload,
}: ChatComposerBarProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const [recording, setRecording] = useState(false)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!draft.trim() || !canWrite) return
    void onSubmitText()
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !canWrite || busy) return
    void onSendFile(file, quality)
  }

  async function toggleAudioRecording() {
    if (!canWrite || busy) return
    if (recording && recorderRef.current) {
      recorderRef.current.stop()
      return
    }
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onError('Gravação de áudio não está disponível neste navegador.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: BlobPart[] = []
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data)
      }
      recorder.onstop = () => {
        setRecording(false)
        recorderRef.current = null
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size > 0) void onSendAudio(blob)
      }
      recorder.start()
      setRecording(true)
    } catch {
      onError('Não foi possível acessar o microfone.')
    }
  }

  return (
    <>
      {(replyTo || forwardedDraft) && (
        <ChatNote role="status">
          <span>
            {replyTo
              ? `Respondendo a ${replyTo.senderName || 'mensagem'}: ${replyTo.excerpt}`
              : 'Encaminhando mensagem'}
          </span>
          <button type="button" onClick={onCancelNote}>
            Cancelar
          </button>
        </ChatNote>
      )}
      {uploadProgress !== null && (
        <ChatNote role="status">
          <span>Enviando arquivo… {uploadProgress}%</span>
          <button type="button" onClick={onCancelUpload}>
            Cancelar
          </button>
        </ChatNote>
      )}
      <ChatComposerForm onSubmit={submit}>
        <input
          ref={fileInput}
          type="file"
          aria-label="Escolher arquivo"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Tirar foto"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
        <ChatInputPill>
          <textarea
            aria-label="Mensagem"
            placeholder={recording ? 'Gravando áudio…' : placeholder}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onBlur={onBlur}
            maxLength={maxLength}
            rows={1}
            disabled={!canType || recording}
          />
          <ChatHdToggle
            type="button"
            $on={quality === 'high'}
            aria-pressed={quality === 'high'}
            aria-label={quality === 'high' ? CHAT_QUALITY_VIEW.oneShotOn : CHAT_QUALITY_VIEW.oneShotOff}
            title={quality === 'high' ? CHAT_QUALITY_VIEW.oneShotOn : CHAT_QUALITY_VIEW.oneShotOff}
            disabled={!canWrite || busy || recording}
            onClick={onToggleQuality}
          >
            {CHAT_QUALITY_VIEW.oneShotLabel}
          </ChatHdToggle>
          <ChatInlineIcon
            type="button"
            aria-label="Anexar arquivo"
            disabled={!canWrite || busy || recording}
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip size={22} />
          </ChatInlineIcon>
          {!draft.trim() && (
            <ChatInlineIcon
              type="button"
              aria-label="Enviar foto"
              disabled={!canWrite || busy || recording}
              onClick={() => cameraInput.current?.click()}
            >
              <Camera size={22} />
            </ChatInlineIcon>
          )}
        </ChatInputPill>
        {draft.trim() ? (
          <ChatRoundButton
            type="submit"
            aria-label="Enviar mensagem"
            disabled={!canWrite || busy || recording}
          >
            <PaperPlaneTilt size={22} weight="fill" />
          </ChatRoundButton>
        ) : (
          <ChatRoundButton
            type="button"
            aria-label={recording ? 'Parar e enviar áudio' : 'Gravar áudio'}
            disabled={!canWrite || busy}
            onClick={() => {
              void toggleAudioRecording()
            }}
          >
            {recording ? <Stop size={22} weight="fill" /> : <Microphone size={22} weight="fill" />}
          </ChatRoundButton>
        )}
      </ChatComposerForm>
    </>
  )
}
