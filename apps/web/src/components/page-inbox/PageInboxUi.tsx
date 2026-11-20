import { useEffect, useRef, useState, type FormEvent } from 'react'
import styled from 'styled-components'
import type { PageMessageView } from '../../hooks/usePageInbox'

export const NOTICE_TEXT =
  'Esta conversa é com a equipe da página. Várias pessoas da equipe podem ler e responder.'

export const Notice = styled.p`
  margin: 0 0 12px;
  padding: 10px 12px;
  background: ${({ theme }) => theme.colors.neutral};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
`

export const HandleLine = styled(({ username, className }: { username?: string | null; className?: string }) =>
  username ? <p className={className}>@{username}</p> : null,
)`
  margin: 2px 0 0;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
`

export const ErrorLine = styled.p`
  margin: 8px 0 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.action};
`

const Thread = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 420px;
  overflow-y: auto;
  padding: 4px 2px;
`

const Bubble = styled.div<{ $own: boolean }>`
  align-self: ${({ $own }) => ($own ? 'flex-end' : 'flex-start')};
  max-width: 82%;
  padding: 8px 12px;
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme, $own }) => ($own ? theme.colors.bubbleOwn : theme.colors.neutral)};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`

const Meta = styled.span`
  display: block;
  margin-top: 4px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
`

function time(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** `own` diz qual lado é "meu": cidadão vê a própria fala à direita; a equipe vê a da equipe. */
export function MessageList({ messages, ownSide }: { messages: PageMessageView[]; ownSide: 'CITIZEN' | 'STAFF' }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])
  return (
    <Thread role="log" aria-label="Mensagens">
      {messages.map((m) => (
        <Bubble key={m.id} $own={m.from === ownSide}>
          {m.text}
          <Meta>
            {m.staffName ? `${m.staffName} · ` : ''}
            {time(m.createdAt)}
          </Meta>
        </Bubble>
      ))}
      <div ref={end} />
    </Thread>
  )
}

const Form = styled.form`
  display: flex;
  gap: 8px;
  margin-top: 12px;
  align-items: flex-end;
`

const Area = styled.textarea`
  flex: 1;
  min-height: 44px;
  max-height: 140px;
  resize: vertical;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`

export const SendButton = styled.button`
  padding: 10px 18px;
  border: 0;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.white};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`

export function Composer({
  onSend,
  pending,
  placeholder = 'Escreva sua mensagem',
  label = 'Enviar',
}: {
  onSend: (text: string) => Promise<unknown>
  pending: boolean
  placeholder?: string
  label?: string
}) {
  const [text, setText] = useState('')
  async function submit(e?: FormEvent) {
    e?.preventDefault()
    const value = text.trim()
    if (!value || pending) return
    try {
      await onSend(value)
      setText('')
    } catch {
      /* a mensagem de erro aparece na tela e o texto fica para tentar de novo */
    }
  }
  return (
    <Form onSubmit={submit}>
      <Area
        aria-label={placeholder}
        placeholder={placeholder}
        value={text}
        maxLength={2000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit()
        }}
      />
      <SendButton type="submit" disabled={pending || !text.trim()}>
        {label}
      </SendButton>
    </Form>
  )
}
