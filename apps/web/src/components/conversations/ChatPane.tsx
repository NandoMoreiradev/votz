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
  deviceRequestText,
  enrollDevice,
  messagePlaceholder,
  messageStatusLabel,
  type ChatState,
  type ChatEnrollment,
  type ChatHttp,
  type VerificationAction,
} from '@votz/chat-core'
import type { ConversationSummary } from '@votz/shared-types'
import { useAuthStore } from '../../store/auth.store'
import { api } from '../../lib/api'
import { forgetWebChat, webChatStorage } from '../../lib/chat-storage'

/** Nome do aparelho na lista de aparelhos conectados, ex.: "Chrome no Windows". */
function browserLabel() {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Navegador'
  const system = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  return system ? `${browser} no ${system}` : browser
}

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
/** Outra aba já está com as conversas abertas (só uma aba por vez cuida das chaves). */
class LockBusy extends Error {}
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
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
  const peer = conversation.members.find(
    (member) => member.user.id !== userId,
  )!.user
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
  const cancelled = useRef(false)
  const abort = useRef(new AbortController())
  const lockRelease = useRef<(() => void) | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const history = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const lastMessageId = state?.messages[state.messages.length - 1]?.id
  const restart = () => {
    setError('')
    setAttempt((value) => value + 1)
  }
  // Aparelho desconectado: apaga o que este navegador guardava e recomeça sozinho.
  const startOver = () => {
    void forgetWebChat(userId).then(restart)
  }
  useEffect(() => {
    cancelled.current = false
    abort.current = new AbortController()
    void webChatStorage(userId)
      .then((store) => {
        const secret = store.storeSecret
        const wasInitialized = store.initialized
        store.close()
        if (cancelled.current) return
        setInitialized(wasInitialized)
        setLegacy(!secret)
        if (secret) void begin(secret)
      })
      .catch(() =>
        setError(
          'O navegador não conseguiu abrir o armazenamento das conversas.',
        ),
      )
    return () => {
      cancelled.current = true
      abort.current.abort()
      client.current = null
      cleanup.current()
      lockRelease.current?.()
      setDraft('')
      setState(null)
      setPending(null)
    }
  }, [userId, attempt])
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
  /**
   * Abre o motor das conversas. Uma só aba cuida das chaves por vez; ao
   * recarregar ou reabrir, a aba anterior ainda pode estar soltando a vez,
   * então espera um pouco antes de desistir.
   */
  function open(secret: string) {
    return new Promise<void>((accepted, rejected) => {
      if (!navigator.locks) {
        rejected(new Error('Use um navegador atualizado para usar as conversas.'))
        return
      }
      void navigator.locks
        .request(`votz-chat-${userId}`, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            rejected(new LockBusy())
            return
          }
          const store = await webChatStorage(userId)
          let engine: import('../../lib/chat-crypto').WebChatCrypto | null = null
          let active: ChatClient | null = null
          try {
            if (cancelled.current) {
              accepted()
              return
            }
            const headers = {
              'x-votz-chat-device': store.credentials.id,
              'x-votz-chat-secret': store.credentials.secret,
            }
            const http: ChatHttp = async (path, method = 'GET', body) => {
              const current = useAuthStore.getState()
              if (
                current.user?.id !== userId ||
                current.activeContext ||
                cancelled.current
              )
                throw new Error('Sessão alterada.')
              return (
                await api.request({
                  url: `/conversations${path}`,
                  method,
                  data: body,
                  headers,
                })
              ).data
            }
            // O primeiro aparelho da conta entra direto; os demais mostram um
            // código e esperam a permissão de um aparelho que a pessoa já usa.
            const session = await enrollDevice(
              async () =>
                (
                  await api.post<ChatEnrollment>('/conversations/chat/devices', {
                    ...store.credentials,
                    label: browserLabel(),
                  })
                ).data,
              {
                onPending: (value) => setPending({ code: value.code }),
                signal: abort.current.signal,
              },
            )
            setPending(null)
            const { WebChatCrypto } = await import('../../lib/chat-crypto')
            try {
              engine = await WebChatCrypto.open(
                session.matrixUserId,
                session.deviceId,
                `votz-keys-${userId}-${session.deviceId}`,
                secret,
              )
            } catch {
              throw new Error(
                store.storeSecret
                  ? 'Não foi possível abrir suas conversas neste navegador.'
                  : 'Não foi possível abrir suas conversas. Confira a senha.',
              )
            }
            await store.markInitialized()
            if (cancelled.current) {
              accepted()
              return
            }
            active = new ChatClient(
              conversation.id,
              session,
              engine,
              http,
              store.storage,
              () => crypto.randomUUID(),
            )
            client.current = active
            const unsubscribe = active.subscribe(setState)
            cleanup.current = () => {
              unsubscribe()
              void active?.stop()
            }
            setPassphrase('')
            setRepeat('')
            setInitialized(true)
            void active.start()
            accepted()
            await new Promise<void>((resolve) => {
              lockRelease.current = resolve
            })
          } catch (failure) {
            rejected(failure)
          } finally {
            await active?.stop()
            engine?.close()
            store.close()
          }
        })
        .catch(rejected)
    })
  }
  async function begin(secret: string) {
    setBusy(true)
    setError('')
    try {
      for (let tries = 0; ; tries++)
        try {
          await open(secret)
          return
        } catch (failure) {
          if (failure instanceof LockBusy && tries < 12 && !cancelled.current) {
            await wait(300)
            continue
          }
          throw failure
        }
    } catch (failure) {
      if (cancelled.current) return
      if (failure instanceof ChatDeviceDisconnectedError) startOver()
      else if (failure instanceof LockBusy)
        setError(
          'As conversas já estão abertas em outra aba. Feche a outra aba para continuar aqui.',
        )
      else setError(failureMessage(failure))
    } finally {
      setBusy(false)
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
      await forgetWebChat(userId)
      setPassword('')
      setResetting(false)
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
  const verification = state?.verification
  const verified = verification?.state === 'done'
  const view = chatView(state, peer.name, verified)
  const verifying =
    !!verification && !['none', 'cancelled', 'done'].includes(verification.state)
  return (
    <Box data-chat-pane>
      <Header>
        <Link to="/conversas" aria-label="Voltar às conversas">
          <ArrowLeft size={23} />
        </Link>
        <LockKey size={18} />
        <h1>{peer.name}</h1>
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
            role={state.room?.peer.deviceId && !verified ? 'button' : undefined}
            tabIndex={state.room?.peer.deviceId && !verified ? 0 : undefined}
            aria-label={
              state.room?.peer.deviceId && !verified
                ? 'Confirmar identidade, opcional'
                : undefined
            }
            style={
              state.room?.peer.deviceId && !verified
                ? { cursor: 'pointer' }
                : undefined
            }
            onClick={() => {
              if (state.room?.peer.deviceId && !verified)
                setShowVerify((value) => !value)
            }}
          >
            <ShieldCheck size={18} />
            {view.banner}
          </Status>
          {state.deviceLinks.map((link) => {
            const request = deviceRequestText(link)
            return (
              <Card key={link.id} role="alert">
                <h3>{request.title}</h3>
                <p>{request.text}</p>
                <Actions>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      void attemptAction(() =>
                        client.current!.decideDeviceLink(link.id, true),
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
                        client.current!.decideDeviceLink(link.id, false),
                      )
                    }}
                  >
                    {request.deny}
                  </Button>
                </Actions>
              </Card>
            )
          })}
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
          {state.ready &&
            state.room?.peer.deviceId &&
            !verified &&
            (showVerify || verifying) && (
              <Card>
                <h3>Confirmar identidade (opcional)</h3>
                <p>
                  Comparem os três números nas duas telas com {peer.name}. Só
                  confirme se forem iguais. Você pode conversar sem fazer isso.
                </p>
                {verification?.decimals && (
                  <p
                    aria-label="Código de verificação"
                    style={{
                      fontSize: 24,
                      letterSpacing: 2,
                      color: '#1A1A2E',
                      fontWeight: 700,
                    }}
                  >
                    {verification.decimals.join(' · ')}
                  </p>
                )}
                <Actions>
                  {(!verification ||
                    ['none', 'cancelled'].includes(verification.state)) && (
                    <Button
                      disabled={busy}
                      onClick={() => {
                        void verify('request')
                      }}
                    >
                      Começar a confirmação
                    </Button>
                  )}
                  {verification?.state === 'requested' &&
                    verification.incoming && (
                      <Button
                        disabled={busy}
                        onClick={() => {
                          void verify('accept')
                        }}
                      >
                        Aceitar
                      </Button>
                    )}
                  {verification?.state === 'requested' &&
                    !verification.incoming && (
                      <p>Esperando a outra pessoa aceitar…</p>
                    )}
                  {verification?.state === 'ready' && <p>Preparando os números…</p>}
                  {verification?.state === 'comparing' && (
                    <Button
                      disabled={busy}
                      onClick={() => {
                        void verify('confirm')
                      }}
                    >
                      Os números são iguais
                    </Button>
                  )}
                  {verification?.state === 'confirmed' && (
                    <p>Esperando a outra pessoa confirmar…</p>
                  )}
                  {verification &&
                    !['none', 'cancelled'].includes(verification.state) && (
                      <Button
                        $secondary
                        disabled={busy}
                        onClick={() => {
                          void verify('cancel')
                        }}
                      >
                        Cancelar
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
              {state.historyCursor && (
                <Button
                  $secondary
                  disabled={state.loadingHistory}
                  onClick={() => {
                    void older()
                  }}
                >
                  Mensagens anteriores
                </Button>
              )}
            </div>
            {state.messages.map((message) => (
              <Bubble
                key={message.id}
                data-message-id={message.id}
                $own={message.sender === 'self'}
              >
                <span>{message.text ?? messagePlaceholder(message.status)}</span>
                <small>
                  {new Date(message.createdAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {message.sender === 'self'
                    ? ` · ${messageStatusLabel(message.status)}`
                    : ''}
                </small>
                {message.status === 'failed' && message.txnId && (
                  <Button
                    $secondary
                    disabled={!state.room?.canSend || busy}
                    onClick={() => {
                      void client.current
                        ?.retry(message.txnId!)
                        .catch((failure) => setError(chatError(failure)))
                    }}
                  >
                    Tentar enviar novamente
                  </Button>
                )}
              </Bubble>
            ))}
            {!state.messages.length && state.ready && view.canWrite && (
              <p style={{ textAlign: 'center', color: '#6B7280' }}>
                A conversa de vocês começa aqui.
              </p>
            )}
            <div ref={bottom} />
          </History>
          <Status>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={state.readReceiptsEnabled}
                disabled={busy || !state.ready || !state.connected}
                onChange={() => {
                  void toggleReceipts()
                }}
              />
              Compartilhar quando eu ler
            </label>
            <span
              title="Entregue significa que a outra pessoa recebeu. Lida só aparece se ela ativar esta opção e a mensagem estiver na tela."
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
