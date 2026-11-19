import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import {
  ArrowLeft,
  LockKey,
  PaperPlaneTilt,
  ShieldCheck,
} from '@phosphor-icons/react'
import {
  ChatClient,
  ChatDeviceDisconnectedError,
  ENROLL_WAITING,
  RESET_WARNING,
  chatError,
  chatView,
  type ChatState,
  type ChatHttp,
  type VerificationAction,
} from '@votz/chat-core'
import {
  conversationTitle,
  type ConversationSummary,
} from '@votz/shared-types'
import { useAuthStore } from '../../store/auth.store'
import { api } from '../../lib/api'
import { webChatStorage } from '../../lib/chat-storage'
import {
  WebChatLockBusyError,
  acquireWebChatSession,
  hasWebChatSession,
  resetWebChatSession,
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
  min-height: 56px;
  padding: 0 16px;
  gap: 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  h1 {
    flex: 1;
    font-size: 17px;
  }
  a {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 14px;
    min-height: 40px;
    display: flex;
    align-items: center;
  }
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
const History = styled.div`
  flex: 1;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
`
const Bubble = styled.div<{ $own: boolean }>`
  flex-shrink: 0;
  align-self: ${({ $own }) => ($own ? 'flex-end' : 'flex-start')};
  max-width: min(85%, 530px);
  padding: 12px 15px;
  border-radius: ${({ $own }) => ($own ? '18px 18px 4px 18px' : '18px 18px 18px 4px')};
  background: ${({ theme, $own }) => ($own ? '#FFF0F1' : theme.colors.neutral)};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.5;
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
const failureMessage = (failure: unknown) =>
  (failure as { response?: { data?: { message?: string } } }).response?.data
    ?.message ||
  (failure as Error).message ||
  'Não foi possível abrir suas conversas. Tente de novo.'

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
  const [pending, setPending] = useState<{ code: string } | null>(null)
  const [showVerify, setShowVerify] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [password, setPassword] = useState('')
  const [attempt, setAttempt] = useState(0)
  const client = useRef<ChatClient | null>(null)
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
      await client.current.send(draft)
      setDraft('')
    } catch (failure) {
      setError((failure as Error).message || chatError(failure))
    } finally {
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
  const view = chatView(state, title)
  return (
    <Box data-chat-pane>
      <Header>
        <Link to="/conversas" aria-label="Voltar às conversas">
          <ArrowLeft size={23} />
        </Link>
        <LockKey size={18} />
        <h1>{title}</h1>
        <Link to={`/conversas/${conversation.id}?detalhes=1`}>Detalhes</Link>
      </Header>
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
              <Bubble
                key={message.id}
                data-message-id={message.id}
                $own={message.own}
              >
                {message.senderName && <strong>{message.senderName}</strong>}
                <span>{message.body}</span>
                <small>{message.meta}</small>
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
            ))}
            {view.emptyText && (
              <p style={{ textAlign: 'center', color: '#6B7280' }}>
                {view.emptyText}
              </p>
            )}
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
          <Composer onSubmit={send}>
            <textarea
              aria-label="Mensagem"
              placeholder={view.placeholder}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={4000}
              rows={1}
              disabled={!view.canWrite}
            />
            <Button
              type="submit"
              aria-label="Enviar mensagem"
              disabled={!view.canWrite || busy || !draft.trim()}
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
