import { useEffect, useRef } from 'react'
import styled from 'styled-components'
import { useSearchParams } from 'react-router-dom'
import type { OrgType } from '../../hooks/useOrgMemberships'
import {
  pageErrorMessage,
  useDeleteMyPageConversation,
  useMyPageConversation,
  usePageThread,
  useSendPageMessage,
} from '../../hooks/usePageInbox'
import { Composer, ErrorLine, MessageList, NOTICE_TEXT, Notice } from './PageInboxUi'

/** Parâmetro de endereço que abre a conversa DENTRO do perfil da página (e permite link direto). */
export const CHAT_PARAM = 'mensagens'

const Panel = styled.section`
  margin-bottom: 20px;
  padding: 20px 24px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
`
const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
`
const Title = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
`
const Link = styled.button`
  border: 0;
  background: none;
  padding: 0;
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  text-decoration: underline;
  cursor: pointer;
`
const Muted = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.muted};
`

/** Abre ou fecha o painel de mensagens do perfil (usa o endereço, então vale para link e voltar). */
export function useChatOpen() {
  const [params, setParams] = useSearchParams()
  const open = params.has(CHAT_PARAM)
  function set(next: boolean) {
    const copy = new URLSearchParams(params)
    if (next) copy.set(CHAT_PARAM, '1')
    else copy.delete(CHAT_PARAM)
    setParams(copy, { replace: false })
  }
  return { open, set }
}

/**
 * Conversa do cidadão com a equipe, dentro do perfil da página.
 * Sem conversa ainda: mostra só o aviso e o campo; a primeira mensagem cria a conversa.
 */
export function PageChatPanel({ orgType, orgId, pageName }: { orgType: OrgType; orgId: string; pageName: string }) {
  const { open, set } = useChatOpen()
  const ref = useRef<HTMLElement>(null)
  const thread = usePageThread(orgType, orgId, open)
  const threadId = thread.data?.id ?? ''
  const conversation = useMyPageConversation(open ? threadId : '')
  const send = useSendPageMessage(orgType, orgId)
  const remove = useDeleteMyPageConversation()

  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [open])

  if (!open) return null
  const blocked = conversation.data?.status === 'BLOCKED'
  return (
    <Panel ref={ref} aria-label={`Mensagens com ${pageName}`}>
      <Head>
        <Title>Mensagens com {pageName}</Title>
        <Link type="button" onClick={() => set(false)}>
          Fechar
        </Link>
      </Head>
      <Notice>{NOTICE_TEXT}</Notice>
      {(thread.isLoading || (!!threadId && conversation.isLoading)) && <Muted>Carregando…</Muted>}
      {thread.isError && <ErrorLine role="alert">{pageErrorMessage(thread.error)}</ErrorLine>}
      {conversation.data && <MessageList messages={conversation.data.messages} ownSide="CITIZEN" />}
      {!thread.isLoading &&
        (blocked ? (
          <Muted>Esta página não está recebendo novas mensagens suas.</Muted>
        ) : (
          <Composer
            pending={send.isPending}
            placeholder={threadId ? 'Escreva sua mensagem' : `Escreva para ${pageName}`}
            onSend={(text) => send.mutateAsync(text)}
          />
        ))}
      {send.isError && <ErrorLine role="alert">{pageErrorMessage(send.error)}</ErrorLine>}
      {threadId && (
        <Link
          type="button"
          style={{ marginTop: 12 }}
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm('Apagar esta conversa? Ela some também para a equipe da página.')) {
              remove.mutate(threadId)
            }
          }}
        >
          Apagar conversa
        </Link>
      )}
    </Panel>
  )
}
