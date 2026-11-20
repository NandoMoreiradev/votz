import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import {
  ArrowBendUpLeft,
  ArrowLeft,
  Camera,
  CaretDown,
  Check,
  Checks,
  Clock,
  Copy as CopyIcon,
  DotsThreeVertical,
  Info,
  LockKey,
  MagnifyingGlass,
  Microphone,
  Paperclip,
  PaperPlaneTilt,
  ShareFat,
  ShieldCheck,
  Stop,
  Users,
  WarningCircle,
} from '@phosphor-icons/react'
import {
  CHAT_QUALITY_VIEW,
  ChatClient,
  ChatDeviceDisconnectedError,
  ENROLL_WAITING,
  QUICK_REACTIONS,
  RESET_WARNING,
  chatError,
  chatSeedState,
  chatView,
  mediaKindFromMime,
  parseChatQuality,
  type ChatDeliveryIcon,
  type ChatMediaQuality,
  type ChatPendingLink,
  type ChatReplyTo,
  type ChatState,
  type ChatHttp,
  type ChatViewAttachment,
  type VerificationAction,
} from '@votz/chat-core'
import {
  DEFAULT_CONVERSATION_SETTINGS,
  conversationFontSize,
  conversationHeaderStatus,
  conversationTitle,
  type ConversationSummary,
  type ConversationWallpaper,
} from '@votz/shared-types'
import { useAuthStore } from '../../store/auth.store'
import {
  useConversationList,
  useConversationSettings,
} from '../../hooks/useConversations'
import { api } from '../../lib/api'
import { DeviceLinkQr } from './DeviceLinkQr'
import { useTypingUsers } from '../../lib/chat-typing'
import { webChatStorage } from '../../lib/chat-storage'
import { getMediaCache } from '../../lib/chat-media-cache'
import { prepareChatImage, readVideoPreview, type PreparedMedia } from '../../lib/chat-media-prepare'
import {
  WebChatLockBusyError,
  acquireWebChatSession,
  hasWebChatSession,
  resetWebChatSession,
  type WebChatSession,
} from '../../lib/chat-session'

const Box = styled.section`
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
const Header = styled.header`
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
const HeaderIdentity = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`
const HeaderStatus = styled.span<{ $active?: boolean }>`
  font-size: 12.5px;
  color: ${({ theme, $active }) => ($active ? theme.colors.positive : theme.colors.muted)};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
`
const ChatAvatar = styled.span`
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
const DayChip = styled.div`
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
const EmptyHint = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
`
// A hora fica no canto da última linha (flutua à direita); se não couber, desce para a linha de baixo.
const MetaRow = styled.small`
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
const CheckRead = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.colors.positive};
`
const CheckAlert = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.colors.action};
`
const Card = styled.div`
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
const Button = styled.button<{ $secondary?: boolean }>`
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
const Status = styled.div`
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
const History = styled.div<{ $wallpaper?: ConversationWallpaper }>`
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
const Bubble = styled.div<{
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
const BubbleMenuButton = styled.button`
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
const MenuBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10;
`
const MenuPanel = styled.div<{ $align: 'left' | 'right' }>`
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
const MenuReactions = styled.div`
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
const HeaderMenuWrap = styled.div`
  position: relative;
  flex-shrink: 0;
`
const IconButton = styled.button`
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
const Banner = styled.div`
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
const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`
const Composer = styled.form`
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
const InputPill = styled.div`
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
const InlineIcon = styled.button`
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
const RoundButton = styled.button`
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
const Actions = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`

const Note = styled.div`
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
const MediaBox = styled.div`
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
const Quote = styled.div`
  border-left: 3px solid ${({ theme }) => theme.colors.action};
  padding: 4px 8px;
  margin-bottom: 6px;
  background: rgba(26, 26, 46, 0.05);
  border-radius: 6px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
`
const ForwardTag = styled.div`
  font-size: 11px;
  font-style: italic;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 4px;
`
const CardLink = styled(Link)`
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
const ReactionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
`
const Pill = styled.button<{ $mine?: boolean }>`
  border: 1px solid
    ${({ theme, $mine }) => ($mine ? theme.colors.action : theme.colors.border)};
  background: ${({ theme }) => theme.colors.white};
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
`
const SearchBar = styled.div`
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
const failureMessage = (failure: unknown) =>
  (failure as { response?: { data?: { message?: string } } }).response?.data
    ?.message ||
  (failure as Error).message ||
  'Não foi possível abrir suas conversas. Tente de novo.'

/** Botão "HD" do envio: liga a alta qualidade só para o próximo arquivo. */
const HdToggle = styled(InlineIcon)<{ $on: boolean }>`
  width: 36px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: ${({ theme, $on }) => ($on ? theme.colors.action : theme.colors.muted)};
`

function AttachmentView({
  attachment,
  conversationId,
  client,
  session,
  auto,
  userId,
}: {
  attachment: ChatViewAttachment
  conversationId: string
  client: ChatClient | null
  session: WebChatSession | null
  /** Baixar sozinho (configuração "Download automático de mídia"). */
  auto: boolean
  userId: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState('')
  const urlRef = useRef<string | null>(null)
  const autoLoad = auto && (attachment.kind === 'image' || attachment.kind === 'audio')

  async function load(triggerDownload = false) {
    if (!client || !session || loading) return
    if (urlRef.current) {
      if (triggerDownload) {
        const a = document.createElement('a')
        a.href = urlRef.current
        a.download = attachment.name
        a.click()
      }
      return
    }
    setLoading(true)
    setFailed('')
    try {
      // Já aberto antes neste navegador: sai do cache cifrado, sem baixar nem decifrar de novo.
      const cache = await getMediaCache(userId)
      let plain = (await cache?.get(attachment.id)) ?? null
      if (!plain) {
        const cipher = await session.downloadMedia(conversationId, attachment.id)
        plain = await client.decryptMedia(cipher, attachment.secret)
        void cache?.put(attachment.id, plain)
      }
      const copy = new Uint8Array(plain.byteLength)
      copy.set(plain)
      const objectUrl = URL.createObjectURL(
        new Blob([copy.buffer], { type: attachment.mimeType }),
      )
      urlRef.current = objectUrl
      setUrl(objectUrl)
      if (triggerDownload) {
        const a = document.createElement('a')
        a.href = objectUrl
        a.download = attachment.name
        a.click()
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status
      setFailed(
        status === 410
          ? 'Este arquivo não está mais guardado no Votz.'
          : 'Não foi possível abrir este arquivo.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (autoLoad) void load(false)
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [attachment.id])

  return (
    <MediaBox>
      {url && attachment.kind === 'image' && (
        <img src={url} alt={attachment.name} />
      )}
      {url && attachment.kind === 'video' && (
        <video controls src={url} poster={attachment.thumbnail ?? undefined} />
      )}
      {url && attachment.kind === 'audio' && (
        <audio controls src={url} />
      )}
      {/* Antes de baixar: a miniatura que veio na mensagem, no tamanho certo, sem a bolha pular depois. */}
      {!url && attachment.thumbnail && (attachment.kind === 'image' || attachment.kind === 'video') && (
        <img
          src={attachment.thumbnail}
          alt=""
          aria-hidden="true"
          style={{
            width: 'min(100%, 280px)',
            aspectRatio: attachment.width && attachment.height ? `${attachment.width} / ${attachment.height}` : undefined,
          }}
        />
      )}
      {(!url || attachment.kind === 'file') && (
        <Button
          $secondary
          type="button"
          disabled={loading}
          onClick={() => {
            void load(attachment.kind === 'file')
          }}
        >
          {loading
            ? 'Baixando…'
            : `${attachment.kind === 'file' ? 'Baixar' : 'Abrir'} ${attachment.kindLabel.toLowerCase()} (${attachment.name} · ${attachment.sizeLabel})`}
        </Button>
      )}
      {failed && <small role="alert">{failed}</small>}
    </MediaBox>
  )
}

/**
 * A conversa abre sozinha: um segredo gerado neste navegador protege as
 * chaves, sem a pessoa criar nem lembrar de senha. Só aparece uma tela de
 * espera quando é preciso permitir este navegador em outro aparelho dela.
 * Navegadores antigos, que já usavam uma senha própria, continuam pedindo.
 */
export function ChatPane({
  conversation,
}: {
  conversation: ConversationSummary
}) {
  const userId = useAuthStore((state) => state.user!.id)
  const navigate = useNavigate()
  const location = useLocation()
  const conversations = useConversationList('active')
  const settingsQuery = useConversationSettings()
  const chatSettings = settingsQuery.data ?? DEFAULT_CONVERSATION_SETTINGS
  const bubbleFontSize = conversationFontSize(chatSettings.fontScale)
  const title = conversationTitle(conversation, userId)
  const [state, setState] = useState<ChatState | null>(null)
  // null: ainda lendo; true: navegador antigo com senha própria.
  const [legacy, setLegacy] = useState<boolean | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<ChatReplyTo | null>(null)
  const [forwardedDraft, setForwardedDraft] = useState(false)
  const [forwardingText, setForwardingText] = useState<string | null>(null)
  const typingNames = useTypingUsers(conversation.id)
  const typingSentAt = useRef(0)
  const typingActive = useRef(false)
  const emitTyping = (typing: boolean) => {
    const now = Date.now()
    if (typing) {
      if (typingActive.current && now - typingSentAt.current < 3000) return
      typingActive.current = true
      typingSentAt.current = now
    } else {
      if (!typingActive.current) return
      typingActive.current = false
      typingSentAt.current = 0
    }
    void api
      .post(`/conversations/${conversation.id}/chat/typing`, { typing })
      .catch(() => {})
  }
  useEffect(() => {
    return () => {
      if (typingActive.current) {
        typingActive.current = false
        void api
          .post(`/conversations/${conversation.id}/chat/typing`, {
            typing: false,
          })
          .catch(() => {})
      }
    }
  }, [conversation.id])
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch] = useState('')
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null)
  const [headerMenu, setHeaderMenu] = useState(false)
  // Esc fecha os menus (cabeçalho e mensagem).
  useEffect(() => {
    if (!headerMenu && !menuMessageId) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setHeaderMenu(false)
      setMenuMessageId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [headerMenu, menuMessageId])
  const [pending, setPending] = useState<ChatPendingLink | null>(null)
  const [showVerify, setShowVerify] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [password, setPassword] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  // Alta qualidade só no próximo envio (botão HD); sem ela vale o que a pessoa escolheu nas Configurações.
  const [qualityOverride, setQualityOverride] = useState<ChatMediaQuality | null>(null)
  const quality: ChatMediaQuality = qualityOverride ?? parseChatQuality(chatSettings.mediaUploadQuality)
  const client = useRef<ChatClient | null>(null)
  const sessionRef = useRef<WebChatSession | null>(null)
  const uploadAbort = useRef<AbortController | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const [recording, setRecording] = useState(false)
  const cleanup = useRef<() => void>(() => {})
  const abort = useRef(new AbortController())
  const bottom = useRef<HTMLDivElement>(null)
  const history = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const lastMessageId = state?.messages[state.messages.length - 1]?.id
  const restart = () => {
    setError('')
    setAttempt((value) => value + 1)
  }
  function stopClient() {
    abort.current.abort()
    client.current = null
    cleanup.current()
    cleanup.current = () => {}
  }
  // Aparelho desconectado: encerra a sessão cifrada, apaga o armazenamento local e recomeça sozinho.
  const startOver = () => {
    stopClient()
    void resetWebChatSession(userId).then(restart)
  }
  useEffect(() => {
    const controller = new AbortController()
    abort.current = controller
    const { signal } = controller
    // Se a sessão cifrada já está aberta nesta visita a /conversas, reutiliza
    // direto sem reabrir IndexedDB, sem recarregar WASM e sem pedir senha.
    if (hasWebChatSession(userId)) {
      setInitialized(true)
      setLegacy(false)
      void begin('', signal)
    } else {
      void webChatStorage(userId)
        .then((store) => {
          const secret = store.storeSecret
          const wasInitialized = store.initialized
          store.close()
          if (signal.aborted) return
          setInitialized(wasInitialized)
          setLegacy(!secret)
          if (secret) void begin(secret, signal)
        })
        .catch(() => {
          if (!signal.aborted)
            setError(
              'O navegador não conseguiu abrir o armazenamento das conversas.',
            )
        })
    }
    return () => {
      controller.abort()
      client.current = null
      cleanup.current()
      cleanup.current = () => {}
      setDraft('')
      setState(null)
      setPending(null)
    }
  }, [userId, conversation.id, attempt])
  useEffect(() => {
    const incoming = (location.state as { forwardText?: string } | null)
      ?.forwardText
    if (incoming) {
      setDraft(incoming)
      setForwardedDraft(true)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, location.pathname, navigate])
  useEffect(() => {
    if (state?.reactivate) startOver()
  }, [state?.reactivate])
  useEffect(() => {
    if (pinned.current)
      bottom.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [lastMessageId])
  useEffect(() => {
    const root = history.current
    if (!root || !state?.ready) return
    const visible = new Set<string>()
    const timers = new Map<Element, ReturnType<typeof setTimeout>>()
    const publish = () =>
      client.current?.visibleMessages(
        document.visibilityState === 'visible' ? [...visible] : [],
      )
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.messageId!
          const old = timers.get(entry.target)
          if (old) clearTimeout(old)
          if (
            entry.isIntersecting &&
            entry.intersectionRatio >= 0.6 &&
            document.visibilityState === 'visible'
          ) {
            timers.set(
              entry.target,
              setTimeout(() => {
                visible.add(id)
                publish()
              }, 500),
            )
          } else {
            visible.delete(id)
            publish()
          }
        }
      },
      { root, threshold: [0, 0.6] },
    )
    root
      .querySelectorAll('[data-message-id]')
      .forEach((element) => observer.observe(element))
    const visibility = () => {
      for (const timer of timers.values()) clearTimeout(timer)
      visible.clear()
      publish()
      if (document.visibilityState === 'visible')
        root.querySelectorAll('[data-message-id]').forEach((element) => {
          observer.unobserve(element)
          observer.observe(element)
        })
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      observer.disconnect()
      for (const timer of timers.values()) clearTimeout(timer)
      document.removeEventListener('visibilitychange', visibility)
      client.current?.visibleMessages([])
    }
  }, [state?.ready, state?.messages.length])
  async function older() {
    const root = history.current
    if (!root || !client.current) return
    const height = root.scrollHeight
    const top = root.scrollTop
    pinned.current = false
    try {
      await client.current.older()
      requestAnimationFrame(() => {
        root.scrollTop = top + root.scrollHeight - height
      })
    } catch (failure) {
      setError(chatError(failure))
    }
  }
  async function toggleReceipts() {
    if (!client.current || !state || busy) return
    setBusy(true)
    setError('')
    try {
      await client.current.setReadReceipts(!state.readReceiptsEnabled)
    } catch (failure) {
      setError(chatError(failure))
    } finally {
      setBusy(false)
    }
  }
  async function begin(secret: string, signal: AbortSignal = abort.current.signal) {
    setBusy(true)
    setError('')
    try {
      const webSession = await acquireWebChatSession({
        userId,
        secret,
        signal,
        onPending: (value) => {
          if (signal.aborted) return
          setPending(value)
          setBusy(false)
        },
      })
      if (signal.aborted) return
      sessionRef.current = webSession
      setPending(null)
      cleanup.current()
      const guardedHttp: ChatHttp = (path, method, body) => {
        if (signal.aborted) return Promise.reject(new Error('Sessão alterada.'))
        return webSession.http(path, method, body)
      }
      const active = new ChatClient(
        conversation.id,
        webSession.session,
        webSession.engine,
        guardedHttp,
        webSession.storage,
        () => crypto.randomUUID(),
      )
      client.current = active
      const unsubscribe = active.subscribe(setState)
      cleanup.current = () => {
        unsubscribe()
        void active.stop()
      }
      setPassphrase('')
      setRepeat('')
      setInitialized(true)
      void active.start()
    } catch (failure) {
      if (signal.aborted) return
      if (failure instanceof ChatDeviceDisconnectedError) startOver()
      else if (failure instanceof WebChatLockBusyError)
        setError(
          'As conversas já estão abertas em outra aba. Feche a outra aba para continuar aqui.',
        )
      else setError(failureMessage(failure))
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  async function unlock(event: FormEvent) {
    event.preventDefault()
    if (
      busy ||
      passphrase.length < 12 ||
      (!initialized && passphrase !== repeat)
    )
      return
    await begin(passphrase)
  }
  async function reset(event: FormEvent) {
    event.preventDefault()
    if (busy || !password) return
    setBusy(true)
    setError('')
    try {
      await api.post('/conversations/chat/devices/reset', { password })
      stopClient()
      await resetWebChatSession(userId)
      setPassword('')
      setResetting(false)
      setPending(null)
      restart()
    } catch (failure) {
      setError(failureMessage(failure))
    } finally {
      setBusy(false)
    }
  }
  async function verify(action: VerificationAction) {
    if (!client.current || busy) return
    setBusy(true)
    setError('')
    try {
      await client.current.verification(action)
    } catch (failure) {
      setError(chatError(failure))
    } finally {
      setBusy(false)
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault()
    if (!client.current || !draft.trim()) return
    // Como no WhatsApp: o campo esvazia na hora e a bolha aparece; o envio segue por trás.
    // Só se for recusado o texto volta para o campo. O campo não trava: dá para mandar várias seguidas.
    const text = draft
    const replying = replyTo
    const forwarding = forwardedDraft
    setDraft('')
    setReplyTo(null)
    setForwardedDraft(false)
    setError('')
    emitTyping(false)
    try {
      await client.current.send(text, {
        ...(replying ? { replyTo: replying } : {}),
        ...(forwarding ? { forwarded: true } : {}),
      })
    } catch (failure) {
      setDraft((current) => current || text)
      setReplyTo((current) => current ?? replying)
      setForwardedDraft((current) => current || forwarding)
      setError((failure as Error).message || chatError(failure))
    }
  }
  async function react(messageId: string, emoji: string) {
    if (!client.current || busy) return
    setMenuMessageId(null)
    try {
      await client.current.react(messageId, emoji)
    } catch (failure) {
      setError(chatError(failure))
    }
  }
  async function attachFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !client.current || !sessionRef.current || busy) return
    const controller = new AbortController()
    uploadAbort.current = controller
    setBusy(true)
    setUploadProgress(0)
    setError('')
    try {
      const kind = mediaKindFromMime(file.type)
      // O servidor não vê o conteúdo das conversas e não consegue comprimir: a foto é reduzida aqui, antes de
      // cifrar. O vídeo ainda vai como veio, com miniatura e medidas. O resto vai sem mudança.
      const prepared: PreparedMedia =
        kind === 'image'
          ? await prepareChatImage(file, quality)
          : {
              bytes: new Uint8Array(await file.arrayBuffer()),
              mimeType: file.type || 'application/octet-stream',
              name: file.name,
              ...(kind === 'video' ? await readVideoPreview(file) : {}),
            }
      await client.current.sendMedia({
        kind,
        name: prepared.name,
        mimeType: prepared.mimeType,
        bytes: prepared.bytes,
        width: prepared.width,
        height: prepared.height,
        durationMs: prepared.durationMs,
        thumbnail: prepared.thumbnail,
        caption: draft.trim() || undefined,
        upload: (ciphertext, info) =>
          sessionRef.current!.uploadMedia(conversation.id, ciphertext, {
            signal: controller.signal,
            onProgress: setUploadProgress,
            kind: info.kind,
          }),
      })
      setDraft('')
      setQualityOverride(null)
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failureMessage(failure))
    } finally {
      uploadAbort.current = null
      setUploadProgress(null)
      setBusy(false)
    }
  }
  async function attemptAction(work: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (failure) {
      setError((failure as Error).message || chatError(failure))
    } finally {
      setBusy(false)
    }
  }
  async function toggleAudioRecording() {
    if (!client.current || !sessionRef.current || busy) return
    if (recording && recorderRef.current) {
      recorderRef.current.stop()
      return
    }
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Gravação de áudio não está disponível neste navegador.')
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
      recorder.onstop = async () => {
        setRecording(false)
        recorderRef.current = null
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (!blob.size || !client.current || !sessionRef.current) return
        const controller = new AbortController()
        uploadAbort.current = controller
        setBusy(true)
        setUploadProgress(0)
        try {
          const bytes = new Uint8Array(await blob.arrayBuffer())
          await client.current.sendMedia({
            kind: 'audio',
            name: `audio-${Date.now()}.webm`,
            mimeType: blob.type || 'audio/webm',
            bytes,
            upload: (ciphertext, info) =>
              sessionRef.current!.uploadMedia(conversation.id, ciphertext, {
                signal: controller.signal,
                onProgress: setUploadProgress,
                kind: info.kind,
              }),
          })
        } catch (failure) {
          if (!controller.signal.aborted) setError(failureMessage(failure))
        } finally {
          uploadAbort.current = null
          setUploadProgress(null)
          setBusy(false)
        }
      }
      recorder.start()
      setRecording(true)
    } catch {
      setError('Não foi possível acessar o microfone.')
    }
  }
  const otherPerson = conversation.members.find((m) => m.user.id !== userId)?.user
  const headerStatus = conversationHeaderStatus(conversation, typingNames)
  // "Somente no Wi-Fi": sem informação de rede no navegador, só deixa de baixar se ele diz que é celular.
  const autoMedia =
    chatSettings.mediaAutoDownload === 'ALWAYS' ||
    (chatSettings.mediaAutoDownload === 'WIFI_ONLY' &&
      (navigator as { connection?: { type?: string } }).connection?.type !== 'cellular')
  const renderDeliveryIcon = (icon: ChatDeliveryIcon | null) => {
    if (!icon) return null
    if (icon === 'clock') return <Clock size={13} aria-hidden="true" />
    if (icon === 'check') return <Check size={13} aria-hidden="true" />
    if (icon === 'checks') return <Checks size={14} aria-hidden="true" />
    if (icon === 'checks-read')
      return (
        <CheckRead aria-hidden="true">
          <Checks size={14} weight="bold" />
        </CheckRead>
      )
    return (
      <CheckAlert aria-hidden="true">
        <WarningCircle size={13} />
      </CheckAlert>
    )
  }
  // Voltando a uma conversa recente, as últimas mensagens aparecem na hora, da memória.
  const seed = useMemo(
    () => (state ? null : chatSeedState(conversation.id)),
    [state, conversation.id],
  )
  const shown = state ?? seed
  const view = useMemo(
    () => chatView(shown, title, undefined, showSearch ? search : ''),
    [shown, title, showSearch, search],
  )
  const forwardTargets = (
    conversations.data?.pages.flatMap((page) => page.items) ?? []
  ).filter((item) => item.id !== conversation.id && !item.archivedAt)
  return (
    <Box data-chat-pane>
      <Header>
        <Link to="/conversas" aria-label="Voltar às conversas">
          <ArrowLeft size={23} />
        </Link>
        <ChatAvatar aria-hidden="true">
          {conversation.kind === 'GROUP' ? (
            <Users size={18} />
          ) : otherPerson?.avatarUrl ? (
            <img src={otherPerson.avatarUrl} alt="" />
          ) : (
            (title.trim()[0] ?? '').toUpperCase()
          )}
        </ChatAvatar>
        <HeaderIdentity>
          <h1>{title}</h1>
          <HeaderStatus $active={headerStatus.typing} role="status" aria-live="polite">
            {!headerStatus.typing && <LockKey size={12} aria-hidden="true" />}
            {headerStatus.text}
          </HeaderStatus>
        </HeaderIdentity>
        <IconButton
          type="button"
          aria-label="Buscar na conversa"
          onClick={() => {
            setShowSearch((value) => !value)
            setSearch('')
          }}
        >
          <MagnifyingGlass size={20} />
        </IconButton>
        <HeaderMenuWrap>
          <IconButton
            type="button"
            aria-label="Mais opções"
            aria-haspopup="menu"
            aria-expanded={headerMenu}
            onClick={() => setHeaderMenu((value) => !value)}
          >
            <DotsThreeVertical size={22} weight="bold" />
          </IconButton>
          {headerMenu && (
            <>
              <MenuBackdrop onClick={() => setHeaderMenu(false)} />
              <MenuPanel $align="right" role="menu" aria-label="Opções da conversa">
                <Link
                  role="menuitem"
                  to={`/conversas/${conversation.id}?detalhes=1`}
                  aria-label="Detalhes da conversa"
                >
                  <Info size={20} aria-hidden="true" />
                  Detalhes da conversa
                </Link>
                {state && (
                  <label>
                    <input
                      type="checkbox"
                      checked={view.readReceipts.enabled}
                      disabled={busy || view.readReceipts.disabled}
                      onChange={() => {
                        setHeaderMenu(false)
                        void toggleReceipts()
                      }}
                    />
                    {view.readReceipts.label}
                  </label>
                )}
              </MenuPanel>
            </>
          )}
        </HeaderMenuWrap>
      </Header>
      {showSearch && (
        <SearchBar>
          <input
            aria-label="Buscar mensagens"
            placeholder="Buscar na conversa…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
          <Button
            $secondary
            type="button"
            onClick={() => {
              setShowSearch(false)
              setSearch('')
            }}
          >
            Fechar
          </Button>
        </SearchBar>
      )}
      {forwardingText && (
        <Card role="dialog" aria-label="Encaminhar mensagem">
          <h3>Encaminhar para</h3>
          {forwardTargets.length ? (
            <Actions>
              {forwardTargets.slice(0, 8).map((target) => (
                <Button
                  key={target.id}
                  $secondary
                  type="button"
                  onClick={() => {
                    const textToForward = forwardingText
                    setForwardingText(null)
                    navigate(`/conversas/${target.id}`, {
                      state: { forwardText: textToForward },
                    })
                  }}
                >
                  {conversationTitle(target, userId)}
                </Button>
              ))}
            </Actions>
          ) : (
            <p>Nenhuma outra conversa disponível.</p>
          )}
          <Actions>
            <Button
              $secondary
              type="button"
              onClick={() => setForwardingText(null)}
            >
              Cancelar
            </Button>
          </Actions>
        </Card>
      )}
      {pending ? (
        <Card role="status">
          <h2>{ENROLL_WAITING.title}</h2>
          <p>{ENROLL_WAITING.text}</p>
          <DeviceLinkQr id={pending.id} code={pending.code} />
          <p
            aria-label="Código do pedido"
            style={{ fontSize: 28, letterSpacing: 4, fontWeight: 700 }}
          >
            {pending.code}
          </p>
          <p>{ENROLL_WAITING.qrHint}</p>
          <p>{ENROLL_WAITING.historyNote}</p>
          <p>{ENROLL_WAITING.note}</p>
          {resetting ? (
            <form onSubmit={reset}>
              <h3>{RESET_WARNING.title}</h3>
              <p>{RESET_WARNING.text}</p>
              <label htmlFor="chat-reset-password">Senha do Votz</label>
              <input
                id="chat-reset-password"
                type="password"
                autoComplete="current-password"
                maxLength={200}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <Actions>
                <Button type="submit" disabled={busy || !password}>
                  {RESET_WARNING.action}
                </Button>
                <Button
                  $secondary
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setResetting(false)
                    setPassword('')
                    setError('')
                  }}
                >
                  Cancelar
                </Button>
              </Actions>
            </form>
          ) : (
            <Button $secondary type="button" onClick={() => setResetting(true)}>
              {ENROLL_WAITING.lost}
            </Button>
          )}
          {error && <p role="alert">{error}</p>}
        </Card>
      ) : !state && legacy ? (
        <Card>
          <h2>
            {initialized
              ? 'Desbloquear suas conversas'
              : 'Proteja suas conversas'}
          </h2>
          <p>
            {initialized
              ? 'Digite a senha que você criou para as conversas neste navegador.'
              : 'Escolha uma senha de pelo menos 12 caracteres para proteger as conversas neste navegador. Guarde-a: o Votz não consegue recuperá-la.'}
          </p>
          <form onSubmit={unlock}>
            <label htmlFor="chat-passphrase">Senha das conversas</label>
            <input
              id="chat-passphrase"
              type="password"
              minLength={12}
              maxLength={200}
              autoComplete={initialized ? 'current-password' : 'new-password'}
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              required
            />
            {!initialized && (
              <>
                <label htmlFor="chat-passphrase-confirm">
                  Repita a senha das conversas
                </label>
                <input
                  id="chat-passphrase-confirm"
                  type="password"
                  minLength={12}
                  maxLength={200}
                  autoComplete="new-password"
                  value={repeat}
                  onChange={(event) => setRepeat(event.target.value)}
                  required
                />
              </>
            )}
            <Button
              type="submit"
              disabled={
                busy ||
                passphrase.length < 12 ||
                (!initialized && passphrase !== repeat)
              }
            >
              {busy ? 'Abrindo…' : initialized ? 'Desbloquear' : 'Continuar'}
            </Button>
          </form>
        </Card>
      ) : !shown ? (
        <Card role="status">
          {error ? (
            <>
              <p>{error}</p>
              <Button type="button" onClick={restart}>
                Tentar de novo
              </Button>
            </>
          ) : (
            <p>Preparando a conversa…</p>
          )}
        </Card>
      ) : (
        <>
          {view.deviceRequests.map((request) => (
            <Card key={request.id} role="alert">
              <h3>{request.title}</h3>
              <p>{request.text}</p>
              <Actions>
                <Button
                  disabled={busy}
                  onClick={() => {
                    void attemptAction(() =>
                      client.current!.decideDeviceLink(request.id, true),
                    )
                  }}
                >
                  {request.allow}
                </Button>
                <Button
                  $secondary
                  disabled={busy}
                  onClick={() => {
                    void attemptAction(() =>
                      client.current!.decideDeviceLink(request.id, false),
                    )
                  }}
                >
                  {request.deny}
                </Button>
              </Actions>
            </Card>
          ))}
          {view.notices.map((notice) => (
            <Note key={notice.id} role="status">
              <span>
                {notice.text}
                {notice.detail ? ` ${notice.detail}` : ''}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void attemptAction(() =>
                    client.current!.acknowledgeNotice(notice.id),
                  )
                }}
              >
                {notice.action}
              </button>
            </Note>
          ))}
          {view.waitingPeer && (
            <Note role="status">
              <span>{view.waitingPeer}</span>
            </Note>
          )}
          {view.verification && (showVerify || view.verification.active) && (
            <Card>
              <h3>{view.verification.title}</h3>
              <p>{view.verification.description}</p>
              {view.verification.code && (
                <p
                  aria-label="Código de verificação"
                  style={{
                    fontSize: 24,
                    letterSpacing: 2,
                    color: '#1A1A2E',
                    fontWeight: 700,
                  }}
                >
                  {view.verification.code}
                </p>
              )}
              <Actions>
                {view.verification.primaryAction && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      void verify(view.verification!.primaryAction!.action)
                    }}
                  >
                    {view.verification.primaryAction.label}
                  </Button>
                )}
                {view.verification.waitingText && (
                  <p>{view.verification.waitingText}</p>
                )}
                {view.verification.canCancel && (
                  <Button
                    $secondary
                    disabled={busy}
                    onClick={() => {
                      void verify('cancel')
                    }}
                  >
                    {view.verification.cancelLabel}
                  </Button>
                )}
              </Actions>
            </Card>
          )}
          {shown.error && <Status role="status">{shown.error}</Status>}
          <History
            ref={history}
            $wallpaper={chatSettings.wallpaper}
            data-wallpaper={chatSettings.wallpaper}
            onScroll={() => {
              const node = history.current
              if (node)
                pinned.current =
                  node.scrollHeight - node.scrollTop - node.clientHeight < 80
            }}
            aria-label="Mensagens"
          >
            <Banner
              role={view.canVerify ? 'button' : undefined}
              tabIndex={view.canVerify ? 0 : undefined}
              aria-label={
                view.canVerify ? 'Confirmar identidade, opcional' : undefined
              }
              style={view.canVerify ? { cursor: 'pointer' } : undefined}
              onClick={() => {
                if (view.canVerify) setShowVerify((value) => !value)
              }}
            >
              <ShieldCheck size={14} aria-hidden="true" />
              {view.banner}
            </Banner>
            <div>
              {view.canLoadOlder && (
                <Button
                  $secondary
                  disabled={shown.loadingHistory}
                  onClick={() => {
                    void older()
                  }}
                >
                  {view.olderLabel}
                </Button>
              )}
            </div>
            {view.messages.map((message) => (
              <Fragment key={message.id}>
                {message.dayDivider && (
                  <DayChip data-day-divider>{message.dayDivider}</DayChip>
                )}
                <Bubble
                  data-message-id={message.id}
                  $own={message.own}
                  $fontSize={bubbleFontSize}
                  $first={message.isFirstInGroup}
                  $unreadable={message.unreadable}
                  $tools={message.canReact}
                >
                {message.senderName && <strong>{message.senderName}</strong>}
                {message.forwarded && <ForwardTag>Encaminhada</ForwardTag>}
                {message.replyTo && (
                  <Quote>
                    {message.replyTo.senderName
                      ? `${message.replyTo.senderName}: `
                      : ''}
                    {message.replyTo.excerpt}
                  </Quote>
                )}
                {message.attachment && (
                  <AttachmentView
                    attachment={message.attachment}
                    conversationId={conversation.id}
                    client={client.current}
                    session={sessionRef.current}
                    auto={autoMedia}
                    userId={userId}
                  />
                )}
                {message.body && <span>{message.body}</span>}
                {message.card && (
                  <CardLink to={message.card.url}>
                    {message.card.label}
                    {message.card.title ? ` · ${message.card.title}` : ''}
                  </CardLink>
                )}
                {message.reactions.length > 0 && (
                  <ReactionRow>
                    {message.reactions.map((item) => (
                      <Pill
                        key={item.emoji}
                        type="button"
                        $mine={item.mine}
                        onClick={() => {
                          void react(message.id, item.emoji)
                        }}
                      >
                        {item.emoji} {item.count}
                      </Pill>
                    ))}
                  </ReactionRow>
                )}
                {message.canReact && (
                  <>
                    <BubbleMenuButton
                      data-bubble-menu
                      type="button"
                      aria-label="Mais opções da mensagem"
                      aria-haspopup="menu"
                      aria-expanded={menuMessageId === message.id}
                      onClick={() =>
                        setMenuMessageId((id) =>
                          id === message.id ? null : message.id,
                        )
                      }
                    >
                      <CaretDown size={16} weight="bold" aria-hidden="true" />
                    </BubbleMenuButton>
                    {menuMessageId === message.id && (
                      <>
                        <MenuBackdrop onClick={() => setMenuMessageId(null)} />
                        <MenuPanel
                          $align={message.own ? 'right' : 'left'}
                          role="menu"
                          aria-label="Opções da mensagem"
                          style={{ top: 28 }}
                        >
                          <MenuReactions>
                            {QUICK_REACTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                role="menuitem"
                                aria-label={`Reagir com ${emoji}`}
                                onClick={() => {
                                  void react(message.id, emoji)
                                }}
                              >
                                {emoji}
                              </button>
                            ))}
                          </MenuReactions>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setReplyTo({
                                eventId: message.id,
                                senderName: message.own
                                  ? 'Você'
                                  : (message.senderName ?? title),
                                excerpt:
                                  message.body ||
                                  message.attachment?.kindLabel ||
                                  'Mensagem',
                              })
                              setMenuMessageId(null)
                            }}
                          >
                            <ArrowBendUpLeft size={20} aria-hidden="true" />
                            Responder
                          </button>
                          {message.body && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setForwardingText(message.body)
                                setMenuMessageId(null)
                              }}
                            >
                              <ShareFat size={20} aria-hidden="true" />
                              Encaminhar
                            </button>
                          )}
                          {message.body && !message.unreadable && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuMessageId(null)
                                void navigator.clipboard
                                  ?.writeText(message.body)
                                  .catch(() =>
                                    setError('Não foi possível copiar o texto.'),
                                  )
                              }}
                            >
                              <CopyIcon size={20} aria-hidden="true" />
                              Copiar texto
                            </button>
                          )}
                        </MenuPanel>
                      </>
                    )}
                  </>
                )}
                <MetaRow>
                  <span>{message.time}</span>
                  {renderDeliveryIcon(message.deliveryIcon)}
                  {message.statusLabel && (
                    <VisuallyHidden>{message.statusLabel}</VisuallyHidden>
                  )}
                </MetaRow>
                {message.retryTxnId && (
                  <Button
                    $secondary
                    disabled={!message.canRetry || busy}
                    onClick={() => {
                      void client.current
                        ?.retry(message.retryTxnId!)
                        .catch((failure) => setError(chatError(failure)))
                    }}
                  >
                    {message.retryLabel}
                  </Button>
                )}
                </Bubble>
              </Fragment>
            ))}
            {view.emptyText && <EmptyHint>{view.emptyText}</EmptyHint>}
            <div ref={bottom} />
          </History>
          {(replyTo || forwardedDraft) && (
            <Note role="status">
              <span>
                {replyTo
                  ? `Respondendo a ${replyTo.senderName || 'mensagem'}: ${replyTo.excerpt}`
                  : 'Encaminhando mensagem'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setReplyTo(null)
                  setForwardedDraft(false)
                }}
              >
                Cancelar
              </button>
            </Note>
          )}
          {uploadProgress !== null && (
            <Note role="status">
              <span>Enviando arquivo… {uploadProgress}%</span>
              <button
                type="button"
                onClick={() => uploadAbort.current?.abort()}
              >
                Cancelar
              </button>
            </Note>
          )}
          <Composer onSubmit={send}>
            <input
              ref={fileInput}
              type="file"
              aria-label="Escolher arquivo"
              style={{ display: 'none' }}
              onChange={(event) => {
                void attachFile(event)
              }}
            />
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              aria-label="Tirar foto"
              style={{ display: 'none' }}
              onChange={(event) => {
                void attachFile(event)
              }}
            />
            <InputPill>
              <textarea
                aria-label="Mensagem"
                placeholder={recording ? 'Gravando áudio…' : view.placeholder}
                value={draft}
                onChange={(event) => {
                  const value = event.target.value
                  setDraft(value)
                  emitTyping(value.trim().length > 0)
                }}
                onBlur={() => emitTyping(false)}
                maxLength={4000}
                rows={1}
                disabled={!view.canType || recording}
              />
              <HdToggle
                type="button"
                $on={quality === 'high'}
                aria-pressed={quality === 'high'}
                aria-label={quality === 'high' ? CHAT_QUALITY_VIEW.oneShotOn : CHAT_QUALITY_VIEW.oneShotOff}
                title={quality === 'high' ? CHAT_QUALITY_VIEW.oneShotOn : CHAT_QUALITY_VIEW.oneShotOff}
                disabled={!view.canWrite || busy || recording}
                onClick={() => setQualityOverride(quality === 'high' ? 'normal' : 'high')}
              >
                {CHAT_QUALITY_VIEW.oneShotLabel}
              </HdToggle>
              <InlineIcon
                type="button"
                aria-label="Anexar arquivo"
                disabled={!view.canWrite || busy || recording}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip size={22} />
              </InlineIcon>
              {!draft.trim() && (
                <InlineIcon
                  type="button"
                  aria-label="Enviar foto"
                  disabled={!view.canWrite || busy || recording}
                  onClick={() => cameraInput.current?.click()}
                >
                  <Camera size={22} />
                </InlineIcon>
              )}
            </InputPill>
            {draft.trim() ? (
              <RoundButton
                type="submit"
                aria-label="Enviar mensagem"
                disabled={!view.canWrite || busy || recording}
              >
                <PaperPlaneTilt size={22} weight="fill" />
              </RoundButton>
            ) : (
              <RoundButton
                type="button"
                aria-label={recording ? 'Parar e enviar áudio' : 'Gravar áudio'}
                disabled={!view.canWrite || busy}
                onClick={() => {
                  void toggleAudioRecording()
                }}
              >
                {recording ? <Stop size={22} weight="fill" /> : <Microphone size={22} weight="fill" />}
              </RoundButton>
            )}
          </Composer>
        </>
      )}
      {error && state && <Status role="alert">{error}</Status>}
    </Box>
  )
}
