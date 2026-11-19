import { Fragment, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import {
  ArrowBendUpLeft,
  ArrowLeft,
  Camera,
  Check,
  Checks,
  Clock,
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
  ChatClient,
  ChatDeviceDisconnectedError,
  ENROLL_WAITING,
  QUICK_REACTIONS,
  RESET_WARNING,
  chatError,
  chatView,
  mediaKindFromMime,
  type ChatDeliveryIcon,
  type ChatReplyTo,
  type ChatState,
  type ChatHttp,
  type ChatViewAttachment,
  type VerificationAction,
} from '@votz/chat-core'
import {
  DEFAULT_CONVERSATION_SETTINGS,
  conversationFontSize,
  conversationMemberLabel,
  conversationTime,
  conversationTitle,
  conversationTypingLabel,
  type ConversationSummary,
  type ConversationWallpaper,
} from '@votz/shared-types'
import { useAuthStore } from '../../store/auth.store'
import {
  useConversationList,
  useConversationSettings,
} from '../../hooks/useConversations'
import { api } from '../../lib/api'
import { useTypingUsers } from '../../lib/chat-typing'
import { webChatStorage } from '../../lib/chat-storage'
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
  background: ${({ theme }) => theme.colors.white};
`
const Header = styled.header`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  min-height: 60px;
  padding: 6px 14px;
  gap: 10px;
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
  font-size: 12px;
  color: ${({ theme, $active }) => ($active ? theme.colors.positive : theme.colors.muted)};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
`
const ChatAvatar = styled.span`
  width: 38px;
  height: 38px;
  border-radius: 50%;
  flex-shrink: 0;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  font-weight: 700;
  font-size: 14px;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`
const DayChip = styled.div`
  align-self: center;
  padding: 4px 12px;
  margin: 8px 0 4px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.muted};
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
`
const EmptyHint = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
`
const MetaRow = styled.small`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  width: 100%;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 5px;
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
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: ${({ theme, $wallpaper }) =>
    $wallpaper === 'SOFT'
      ? theme.colors.neutral
      : $wallpaper === 'PLAIN'
        ? theme.colors.white
        : theme.colors.surfaceHover};
`
const Bubble = styled.div<{ $own: boolean; $fontSize?: number; $first?: boolean }>`
  position: relative;
  flex-shrink: 0;
  align-self: ${({ $own }) => ($own ? 'flex-end' : 'flex-start')};
  max-width: min(85%, 530px);
  padding: 10px 14px;
  margin-top: ${({ $first }) => ($first ? '6px' : '0')};
  border-radius: ${({ $own, $first }) =>
    $first
      ? $own
        ? '16px 4px 16px 16px'
        : '4px 16px 16px 16px'
      : '16px'};
  border: 1px solid
    ${({ theme, $own }) =>
      $own
        ? `color-mix(in srgb, ${theme.colors.action} 18%, ${theme.colors.border})`
        : theme.colors.border};
  background: ${({ theme, $own }) =>
    $own
      ? `color-mix(in srgb, ${theme.colors.action} 9%, ${theme.colors.white})`
      : theme.colors.white};
  font-size: ${({ $fontSize }) => ($fontSize ? `${$fontSize}px` : '15px')};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.5;
  ${({ $first, $own, theme }) =>
    $first
      ? `
    &::after {
      content: '';
      position: absolute;
      top: 0;
      ${$own ? 'right: -6px;' : 'left: -6px;'}
      width: 10px;
      height: 10px;
      background: ${
        $own
          ? `color-mix(in srgb, ${theme.colors.action} 9%, ${theme.colors.white})`
          : theme.colors.white
      };
      clip-path: ${$own ? 'polygon(0 0, 100% 0, 0 100%)' : 'polygon(0 0, 100% 0, 100% 100%)'};
    }
  `
      : ''}
  strong {
    display: block;
    font-size: 12px;
    color: ${({ theme }) => theme.colors.primary};
    margin-bottom: 3px;
  }
  small {
    display: block;
    text-align: right;
    font-size: 11px;
    color: ${({ theme }) => theme.colors.muted};
    margin-top: 5px;
  }
`
const Composer = styled.form`
  flex-shrink: 0;
  background: ${({ theme }) => theme.colors.white};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  padding: 12px 16px;
  display: flex;
  gap: 10px;
  align-items: flex-end;
  textarea {
    flex: 1;
    min-width: 0;
    resize: vertical;
    max-height: 150px;
    min-height: 44px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 20px;
    padding: 10px 14px;
    font: inherit;
    box-sizing: border-box;
  }
  button {
    display: grid;
    place-items: center;
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
const BubbleTools = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  button {
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.muted};
    font-size: 12px;
    padding: 2px 4px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
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

function AttachmentView({
  attachment,
  conversationId,
  client,
  session,
}: {
  attachment: ChatViewAttachment
  conversationId: string
  client: ChatClient | null
  session: WebChatSession | null
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState('')
  const urlRef = useRef<string | null>(null)
  const autoLoad = attachment.kind === 'image' || attachment.kind === 'audio'

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
      const cipher = await session.downloadMedia(conversationId, attachment.id)
      const plain = await client.decryptMedia(cipher, attachment.secret)
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
          ? 'Este arquivo expirou após 90 dias.'
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
        <video controls src={url} />
      )}
      {url && attachment.kind === 'audio' && (
        <audio controls src={url} />
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
  const [reactMenuId, setReactMenuId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ code: string } | null>(null)
  const [showVerify, setShowVerify] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [password, setPassword] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
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
          setPending({ code: value.code })
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
    if (!client.current || busy || !draft.trim()) return
    setBusy(true)
    setError('')
    try {
      await client.current.send(draft, {
        ...(replyTo ? { replyTo } : {}),
        ...(forwardedDraft ? { forwarded: true } : {}),
      })
      setDraft('')
      setReplyTo(null)
      setForwardedDraft(false)
      emitTyping(false)
    } catch (failure) {
      setError((failure as Error).message || chatError(failure))
    } finally {
      setBusy(false)
    }
  }
  async function react(messageId: string, emoji: string) {
    if (!client.current || busy) return
    setReactMenuId(null)
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
      const bytes = new Uint8Array(await file.arrayBuffer())
      const kind = mediaKindFromMime(file.type)
      await client.current.sendMedia({
        kind,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        bytes,
        caption: draft.trim() || undefined,
        upload: (ciphertext) =>
          sessionRef.current!.uploadMedia(conversation.id, ciphertext, {
            signal: controller.signal,
            onProgress: setUploadProgress,
          }),
      })
      setDraft('')
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
            upload: (ciphertext) =>
              sessionRef.current!.uploadMedia(conversation.id, ciphertext, {
                signal: controller.signal,
                onProgress: setUploadProgress,
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
  const headerSubtitle =
    typingNames.length > 0
      ? conversationTypingLabel(typingNames)
      : conversation.kind === 'GROUP'
        ? conversationMemberLabel(conversation.memberCount)
        : conversation.peerLastSeenAt
          ? `Visto por último ${conversationTime(conversation.peerLastSeenAt)}`
          : 'Protegida de ponta a ponta'
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
  const view = chatView(state, title, undefined, showSearch ? search : '')
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
            title
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase() ?? '')
              .join('')
          )}
        </ChatAvatar>
        <HeaderIdentity>
          <h1>{title}</h1>
          <HeaderStatus $active={typingNames.length > 0}>
            {typingNames.length === 0 && <LockKey size={12} aria-hidden="true" />}
            {headerSubtitle}
          </HeaderStatus>
        </HeaderIdentity>
        <button
          type="button"
          aria-label="Buscar na conversa"
          onClick={() => {
            setShowSearch((value) => !value)
            setSearch('')
          }}
          style={{
            border: 0,
            background: 'transparent',
            cursor: 'pointer',
            padding: 6,
          }}
        >
          <MagnifyingGlass size={20} />
        </button>
        <Link to={`/conversas/${conversation.id}?detalhes=1`}>Detalhes</Link>
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
          <p
            aria-label="Código do pedido"
            style={{ fontSize: 28, letterSpacing: 3, fontWeight: 700 }}
          >
            {pending.code}
          </p>
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
      ) : !state ? (
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
          <Status
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
            <ShieldCheck size={18} />
            {view.banner}
          </Status>
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
          {state.error && <Status role="status">{state.error}</Status>}
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
            <div>
              {view.canLoadOlder && (
                <Button
                  $secondary
                  disabled={state.loadingHistory}
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
                  <BubbleTools>
                    <button
                      type="button"
                      onClick={() =>
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
                      }
                    >
                      <ArrowBendUpLeft size={14} />
                      Responder
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setReactMenuId((id) =>
                          id === message.id ? null : message.id,
                        )
                      }
                    >
                      Reagir
                    </button>
                    {message.body && (
                      <button
                        type="button"
                        onClick={() => setForwardingText(message.body)}
                      >
                        <ShareFat size={14} />
                        Encaminhar
                      </button>
                    )}
                  </BubbleTools>
                )}
                {reactMenuId === message.id && (
                  <ReactionRow>
                    {QUICK_REACTIONS.map((emoji) => (
                      <Pill
                        key={emoji}
                        type="button"
                        aria-label={`Reagir com ${emoji}`}
                        onClick={() => {
                          void react(message.id, emoji)
                        }}
                      >
                        {emoji}
                      </Pill>
                    ))}
                  </ReactionRow>
                )}
                <MetaRow>
                  <span>{message.meta}</span>
                  {renderDeliveryIcon(message.deliveryIcon)}
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
          <Status>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={view.readReceipts.enabled}
                disabled={busy || view.readReceipts.disabled}
                onChange={() => {
                  void toggleReceipts()
                }}
              />
              {view.readReceipts.label}
            </label>
            <span
              title={view.readReceipts.help}
              aria-label="Informações sobre confirmações"
            >
              ⓘ
            </span>
          </Status>
          {typingNames.length > 0 && (
            <Status role="status" aria-live="polite">
              <span>{conversationTypingLabel(typingNames)}</span>
            </Status>
          )}
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
            <Button
              $secondary
              type="button"
              aria-label="Anexar arquivo"
              disabled={!view.canWrite || busy || recording}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip size={20} />
            </Button>
            <Button
              $secondary
              type="button"
              aria-label="Enviar foto"
              disabled={!view.canWrite || busy || recording}
              onClick={() => cameraInput.current?.click()}
            >
              <Camera size={20} />
            </Button>
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
              disabled={!view.canWrite || recording}
            />
            {!draft.trim() && (
              <Button
                $secondary={!recording}
                type="button"
                aria-label={recording ? 'Parar e enviar áudio' : 'Gravar áudio'}
                disabled={!view.canWrite || busy}
                onClick={() => {
                  void toggleAudioRecording()
                }}
              >
                {recording ? <Stop size={20} /> : <Microphone size={20} />}
              </Button>
            )}
            <Button
              type="submit"
              aria-label="Enviar mensagem"
              disabled={!view.canWrite || busy || recording || !draft.trim()}
            >
              <PaperPlaneTilt size={22} />
            </Button>
          </Composer>
        </>
      )}
      {error && state && <Status role="alert">{error}</Status>}
    </Box>
  )
}
