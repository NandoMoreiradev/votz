import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowBendUpLeft,
  ArrowLeft,
  CaretDown,
  Copy as CopyIcon,
  DotsThreeVertical,
  Info,
  LockKey,
  MagnifyingGlass,
  ShareFat,
  ShieldCheck,
  Users,
} from '@phosphor-icons/react'
import {
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
import {
  ChatActions as Actions,
  ChatAvatar,
  ChatBanner as Banner,
  ChatBox as Box,
  ChatBubble as Bubble,
  ChatBubbleMenuButton as BubbleMenuButton,
  ChatButton as Button,
  ChatCard as Card,
  ChatCardLink as CardLink,
  ChatComposerBar,
  ChatDayChip as DayChip,
  ChatEmptyHint as EmptyHint,
  ChatForwardTag as ForwardTag,
  ChatHeader as Header,
  ChatHeaderIdentity as HeaderIdentity,
  ChatHeaderMenuWrap as HeaderMenuWrap,
  ChatHeaderStatus as HeaderStatus,
  ChatHistory as History,
  ChatIconButton as IconButton,
  ChatMediaBox as MediaBox,
  ChatMenuBackdrop as MenuBackdrop,
  ChatMenuPanel as MenuPanel,
  ChatMenuReactions as MenuReactions,
  ChatMetaRow as MetaRow,
  ChatNote as Note,
  ChatPill as Pill,
  ChatQuote as Quote,
  ChatReactionRow as ReactionRow,
  ChatSearchBar as SearchBar,
  ChatStatus as Status,
  ChatVisuallyHidden as VisuallyHidden,
  renderChatDeliveryIcon,
} from './ChatUi'

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
  async function send() {
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
  async function sendFile(file: File, chosenQuality: ChatMediaQuality) {
    if (!client.current || !sessionRef.current || busy) return
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
          ? await prepareChatImage(file, chosenQuality)
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
  async function sendAudio(blob: Blob) {
    if (!client.current || !sessionRef.current || busy) return
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
  const otherPerson = conversation.members.find((m) => m.user.id !== userId)?.user
  const headerStatus = conversationHeaderStatus(conversation, typingNames)
  // "Somente no Wi-Fi": sem informação de rede no navegador, só deixa de baixar se ele diz que é celular.
  const autoMedia =
    chatSettings.mediaAutoDownload === 'ALWAYS' ||
    (chatSettings.mediaAutoDownload === 'WIFI_ONLY' &&
      (navigator as { connection?: { type?: string } }).connection?.type !== 'cellular')
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
                  {renderChatDeliveryIcon(message.deliveryIcon)}
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
          <ChatComposerBar
            draft={draft}
            onDraftChange={(value) => {
              setDraft(value)
              emitTyping(value.trim().length > 0)
            }}
            onBlur={() => emitTyping(false)}
            onSubmitText={send}
            onSendFile={sendFile}
            onSendAudio={sendAudio}
            onError={setError}
            placeholder={view.placeholder}
            maxLength={4000}
            canType={view.canType}
            canWrite={view.canWrite}
            busy={busy}
            quality={quality}
            onToggleQuality={() => setQualityOverride(quality === 'high' ? 'normal' : 'high')}
            replyTo={replyTo}
            forwardedDraft={forwardedDraft}
            onCancelNote={() => {
              setReplyTo(null)
              setForwardedDraft(false)
            }}
            uploadProgress={uploadProgress}
            onCancelUpload={() => uploadAbort.current?.abort()}
          />
        </>
      )}
      {error && state && <Status role="alert">{error}</Status>}
    </Box>
  )
}
