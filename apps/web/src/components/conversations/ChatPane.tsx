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
  chatError,
  messageStatusLabel,
  type ChatState,
  type ChatSession,
  type ChatHttp,
  type VerificationAction,
} from '@votz/chat-core'
import type { ConversationSummary } from '@votz/shared-types'
import { useAuthStore } from '../../store/auth.store'
import { api } from '../../lib/api'
import { webChatStorage } from '../../lib/chat-storage'

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
  const [initialized, setInitialized] = useState<boolean | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const client = useRef<ChatClient | null>(null)
  const cleanup = useRef<() => void>(() => {})
  const cancelled = useRef(false)
  const lockRelease = useRef<(() => void) | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const history = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const lastMessageId = state?.messages[state.messages.length - 1]?.id
  useEffect(() => {
    cancelled.current = false
    void webChatStorage(userId)
      .then((store) => {
        if (!cancelled.current) setInitialized(store.initialized)
        store.close()
      })
      .catch(() =>
        setError(
          'O navegador não conseguiu abrir o armazenamento das conversas.',
        ),
      )
    return () => {
      cancelled.current = true
      client.current = null
      cleanup.current()
      lockRelease.current?.()
      setDraft('')
      setState(null)
    }
  }, [userId])
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
  async function unlock(event: FormEvent) {
    event.preventDefault()
    if (
      busy ||
      passphrase.length < 12 ||
      (!initialized && passphrase !== repeat)
    )
      return
    setBusy(true)
    setError('')
    let accepted!: () => void
    let rejected!: (error: unknown) => void
    const started = new Promise<void>((resolve, reject) => {
      accepted = resolve
      rejected = reject
    })
    if (!navigator.locks) {
      setError(
        'Use um navegador atualizado para ativar as conversas protegidas.',
      )
      setBusy(false)
      return
    }
    void navigator.locks
      .request(`votz-chat-${userId}`, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          rejected(
            new Error(
              'O mensageiro já está aberto em outra aba. Feche a outra aba e tente novamente.',
            ),
          )
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
          const session = (
            await api.post<ChatSession>(
              '/conversations/chat/devices',
              store.credentials,
            )
          ).data
          const { WebChatCrypto } = await import('../../lib/chat-crypto')
          try {
            engine = await WebChatCrypto.open(
              session.matrixUserId,
              session.deviceId,
              `votz-keys-${userId}-${session.deviceId}`,
              passphrase,
            )
          } catch {
            throw new Error(
              'Não foi possível abrir as chaves. Confira a senha das conversas.',
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
    try {
      await started
    } catch (failure) {
      setError(
        (
          failure as {
            response?: { data?: { message?: string } }
            message?: string
          }
        ).response?.data?.message ||
          (failure as Error).message ||
          'Não foi possível desbloquear. Confira a senha das conversas.',
      )
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
  const verification = state?.verification
  const verified = verification?.state === 'done'
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
      {!state ? (
        <Card>
          <h2>
            {initialized
              ? 'Desbloquear suas conversas'
              : 'Proteja suas conversas'}
          </h2>
          <p>
            {initialized
              ? 'Sua senha abre as chaves guardadas neste navegador.'
              : 'Escolha uma senha exclusiva de pelo menos 12 caracteres. Ela protege suas chaves neste navegador e não é enviada ao Votz. Guarde-a: o Votz não pode recuperá-la.'}
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
                initialized === null ||
                passphrase.length < 12 ||
                (!initialized && passphrase !== repeat)
              }
            >
              {busy
                ? 'Desbloqueando…'
                : initialized
                  ? 'Desbloquear'
                  : 'Ativar neste navegador'}
            </Button>
          </form>
        </Card>
      ) : (
        <>
          <Status>
            <ShieldCheck size={18} />
            {verified
              ? 'Identidade verificada neste dispositivo. Mensagens protegidas de ponta a ponta.'
              : 'Verifique a identidade antes de trocar mensagens.'}
          </Status>
          {!state.ready && <Card role="status">Preparando sua conversa…</Card>}
          {state.ready && !state.room?.peer.deviceId && (
            <Card>
              A outra pessoa ainda precisa ativar as conversas protegidas no
              dispositivo dela.
            </Card>
          )}
          {state.ready && state.room?.peer.deviceId && !verified && (
            <Card>
              <h3>Confirme com {peer.name}</h3>
              <p>
                Conversem pessoalmente ou por um canal de confiança e comparem
                os três números nas duas telas. Confirme somente se forem
                iguais.
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
                    Verificar identidade
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
                      Aceitar verificação
                    </Button>
                  )}
                {verification?.state === 'requested' &&
                  !verification.incoming && (
                    <p>Aguardando a outra pessoa aceitar…</p>
                  )}
                {verification?.state === 'ready' && (
                  <p>Preparando os códigos de verificação…</p>
                )}
                {verification?.state === 'comparing' && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      void verify('confirm')
                    }}
                  >
                    Os códigos são iguais
                  </Button>
                )}
                {verification?.state === 'confirmed' && (
                  <p>Aguardando a confirmação da outra pessoa…</p>
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
                      Cancelar verificação
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
                <span>
                  {message.text ??
                    (message.status === 'unverified'
                      ? 'Verifique a identidade para ler esta mensagem.'
                      : 'Não foi possível abrir esta mensagem com as chaves deste dispositivo.')}
                </span>
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
            {!state.messages.length && state.ready && verified && (
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
              title="Entregue confirma a abertura pelo dispositivo. Lida é compartilhada com esta opção ativa e a mensagem visível."
              aria-label="Informações sobre confirmações"
            >
              ⓘ
            </span>
          </Status>
          <Composer onSubmit={send}>
            <textarea
              aria-label="Mensagem"
              placeholder={
                verified
                  ? 'Escreva uma mensagem…'
                  : 'Verifique a identidade para conversar'
              }
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={4000}
              rows={1}
              disabled={!verified || !state.room?.canSend}
            />
            <Button
              type="submit"
              aria-label="Enviar mensagem"
              disabled={
                !verified || !state.room?.canSend || busy || !draft.trim()
              }
            >
              <PaperPlaneTilt size={22} />
            </Button>
          </Composer>
        </>
      )}
      {error && <Status role="alert">{error}</Status>}
    </Box>
  )
}
