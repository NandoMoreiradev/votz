import { useEffect, useRef, useState, type FormEvent } from 'react'
import styled from 'styled-components'
import { ShieldCheck } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ChatDeviceDisconnectedError,
  ENROLL_WAITING,
  RESET_WARNING,
  chatError,
  type ChatPendingLink,
} from '@votz/chat-core'
import { api } from '../../lib/api'
import {
  acquireWebChatSession,
  resetWebChatSession,
} from '../../lib/chat-session'
import { webChatStorage } from '../../lib/chat-storage'
import { useConversationScope } from '../../hooks/useConversations'
import { DeviceLinkQr } from './DeviceLinkQr'

const Box = styled.div`
  max-width: 440px;
  width: 100%;
  margin: auto;
  padding: 20px 22px;
  border-radius: 16px;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  display: grid;
  gap: 10px;
  text-align: center;
  justify-items: center;
`
const Icon = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.colors.neutral};
  color: ${({ theme }) => theme.colors.primary};
`
const Heading = styled.h2`
  margin: 0;
  font-size: 20px;
  line-height: 1.25;
`
const Text = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.muted};
`
const Code = styled.p`
  margin: 4px 0;
  font-size: 30px;
  letter-spacing: 5px;
  font-weight: 700;
  font-family: ${({ theme }) => theme.fonts.mono};
  color: ${({ theme }) => theme.colors.text};
`
const Note = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: ${({ theme }) => theme.colors.muted};
`
const Form = styled.form`
  width: 100%;
  display: grid;
  gap: 10px;
  text-align: left;
  padding-top: 8px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`
const Input = styled.input`
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  font-size: 14px;
`
const Row = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;
`
const Primary = styled.button`
  height: 42px;
  padding: 0 18px;
  border: 0;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.white};
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`
const Secondary = styled.button`
  height: 40px;
  padding: 0 16px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`
const Alert = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.action};
`

/**
 * Fluxo de conexão na entrada de Conversas para um navegador novo quando a
 * conta já tem outro aparelho ativo — exibe código QR + código de 6 dígitos
 * sem precisar entrar em uma conversa específica primeiro.
 */
export function ConnectDeviceCard() {
  const scope = useConversationScope()
  const queryClient = useQueryClient()
  const [started, setStarted] = useState(false)
  const [pending, setPending] = useState<ChatPendingLink | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resetting, setResetting] = useState(false)
  const [password, setPassword] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  async function start() {
    const userId = scope.user?.id
    if (!userId) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStarted(true)
    setBusy(true)
    setError('')
    try {
      const store = await webChatStorage(userId)
      const secret = store.storeSecret
      store.close()
      if (!secret) {
        setError('Abra uma conversa para informar a senha deste navegador.')
        setBusy(false)
        return
      }
      await acquireWebChatSession({
        userId,
        secret,
        signal: controller.signal,
        onPending: (value) => {
          if (controller.signal.aborted) return
          setPending(value)
          setBusy(false)
        },
      })
      if (controller.signal.aborted) return
      setPending(null)
      setBusy(false)
      await queryClient.invalidateQueries({ queryKey: scope.key })
    } catch (failure) {
      if (controller.signal.aborted) return
      const status = (failure as { status?: number; response?: { status?: number } })
        ?.response?.status ?? (failure as { status?: number })?.status
      if (failure instanceof ChatDeviceDisconnectedError || status === 410) {
        await resetWebChatSession(userId)
        setPending(null)
        setStarted(false)
        setBusy(false)
        if (status === 410) {
          setError('O pedido anterior expirou. Clique em Conectar agora para gerar um novo código.')
        }
        return
      }
      setError(chatError(failure))
      setBusy(false)
    }
  }

  async function reset(event: FormEvent) {
    event.preventDefault()
    const userId = scope.user?.id
    if (!userId || !password) return
    setBusy(true)
    setError('')
    try {
      await api.post('/conversations/chat/devices/reset', { password })
      abortRef.current?.abort()
      await resetWebChatSession(userId)
      setPassword('')
      setResetting(false)
      setPending(null)
      setStarted(false)
      await queryClient.invalidateQueries({ queryKey: scope.key })
    } catch (failure) {
      setError(chatError(failure))
    } finally {
      setBusy(false)
    }
  }

  if (!started && !pending) {
    return (
      <Box role="region" aria-label={ENROLL_WAITING.bannerTitle}>
        <Icon aria-hidden="true">
          <ShieldCheck size={28} weight="duotone" />
        </Icon>
        <Heading>{ENROLL_WAITING.bannerTitle}</Heading>
        <Text>{ENROLL_WAITING.bannerText}</Text>
        <Note>{ENROLL_WAITING.historyNote}</Note>
        <Primary type="button" onClick={() => void start()}>
          {ENROLL_WAITING.bannerAction}
        </Primary>
        {error && <Alert role="alert">{error}</Alert>}
      </Box>
    )
  }

  return (
    <Box role="status">
      <Icon aria-hidden="true">
        <ShieldCheck size={28} weight="duotone" />
      </Icon>
      <Heading>{ENROLL_WAITING.title}</Heading>
      {pending ? (
        <>
          <Text>{ENROLL_WAITING.text}</Text>
          <DeviceLinkQr id={pending.id} code={pending.code} size={152} />
          <Code aria-label="Código do pedido">{pending.code}</Code>
          <Note>{ENROLL_WAITING.qrHint}</Note>
          <Note>{ENROLL_WAITING.historyNote}</Note>
          <Note>{ENROLL_WAITING.note}</Note>
        </>
      ) : error ? (
        <Primary type="button" onClick={() => void start()}>
          Pedir novo código
        </Primary>
      ) : (
        <Text>Preparando o pedido de conexão…</Text>
      )}
      {resetting ? (
        <Form onSubmit={(event) => void reset(event)}>
          <strong>{RESET_WARNING.title}</strong>
          <Note>{RESET_WARNING.text}</Note>
          <label htmlFor="connect-reset-password">Senha do Votz</label>
          <Input
            id="connect-reset-password"
            type="password"
            autoComplete="current-password"
            maxLength={200}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <Row>
            <Primary type="submit" disabled={busy || !password}>
              {RESET_WARNING.action}
            </Primary>
            <Secondary
              type="button"
              disabled={busy}
              onClick={() => {
                setResetting(false)
                setPassword('')
                setError('')
              }}
            >
              Cancelar
            </Secondary>
          </Row>
        </Form>
      ) : (
        <Secondary type="button" onClick={() => setResetting(true)}>
          {ENROLL_WAITING.lost}
        </Secondary>
      )}
      {error && <Alert role="alert">{error}</Alert>}
    </Box>
  )
}
