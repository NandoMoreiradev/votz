import { useEffect, useState, type ReactNode } from 'react'
import styled from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from '@phosphor-icons/react'
import type { OrgType } from '../../hooks/useOrgMemberships'
import {
  pageErrorMessage,
  useDeleteMyPageConversation,
  useMyPageConversation,
  usePageThread,
  useReplyAsStaff,
  useRespondPageConversation,
  useSendPageMessage,
  useSetConversationStatus,
  useStaffConversation,
  useStaffFollowers,
  useStartAsStaff,
} from '../../hooks/usePageInbox'
import { Composer, ErrorLine, MessageList, NOTICE_TEXT, Notice } from './PageInboxUi'

/**
 * Telas de conversa com páginas dentro da caixa unificada (/conversas).
 * Cidadão: `/conversas/pagina/:orgType/:orgId`. Equipe (acessando como a página): `/conversas/pagina/:id`.
 * Sem ponta a ponta (decisão do dono, 20/11/2026): o texto fica cifrado no banco e a equipe lê.
 */

export const ORG_PATH: Record<OrgType, string> = { POLITICIAN: 'politico', ENTITY: 'entidade', COMPANY: 'empresa' }

const Pane = styled.section`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: ${({ theme }) => theme.colors.chatBackground ?? theme.colors.neutral};
  @media (max-width: 959px) {
    min-height: calc(100dvh - 56px);
  }
`
const Top = styled.header`
  position: sticky;
  top: 0;
  z-index: 2;
  flex-shrink: 0;
  min-height: 64px;
  padding: 0 12px 0 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: ${({ theme }) => theme.colors.white};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  > a:first-child {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    color: ${({ theme }) => theme.colors.primary};
  }
  > a:first-child:hover {
    background: ${({ theme }) => theme.colors.neutral};
  }
`
const Who = styled.div`
  flex: 1;
  min-width: 0;
  strong,
  small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  strong {
    font-size: 16px;
  }
  small {
    font-size: 12.5px;
    color: ${({ theme }) => theme.colors.muted};
  }
`
const Face = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.action}14;
  color: ${({ theme }) => theme.colors.action};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`
const TopLink = styled(Link)`
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 20px;
  color: ${({ theme }) => theme.colors.action};
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  &:hover {
    background: ${({ theme }) => theme.colors.neutral};
  }
`
const TextButton = styled.button`
  flex-shrink: 0;
  border: 0;
  background: transparent;
  padding: 8px 12px;
  border-radius: 20px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
  cursor: pointer;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral};
  }
`
const Body = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* A conversa usa a altura da tela, não a caixinha de 420 px do antigo painel do perfil. */
  [role='log'] {
    max-height: none;
    overflow: visible;
  }
`
const Foot = styled.div`
  flex-shrink: 0;
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.white};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  form {
    margin-top: 0;
  }
`
const Muted = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
`
const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`
const Pill = styled.button<{ $primary?: boolean }>`
  min-height: 36px;
  padding: 0 16px;
  border-radius: 18px;
  border: 1px solid ${({ theme, $primary }) => ($primary ? theme.colors.action : theme.colors.border)};
  background: ${({ theme, $primary }) => ($primary ? theme.colors.action : theme.colors.white)};
  color: ${({ theme, $primary }) => ($primary ? theme.colors.white : theme.colors.text)};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
`
const Search = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 12px 16px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 24px;
  background: ${({ theme }) => theme.colors.white};
  font-size: 15px;
`
const PersonButton = styled.button`
  display: block;
  width: 100%;
  padding: 12px 16px;
  text-align: left;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.white};
  cursor: pointer;
  span {
    display: block;
    font-size: 13px;
    color: ${({ theme }) => theme.colors.muted};
  }
  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover ?? theme.colors.neutral};
  }
`

function Avatar({ name, src }: { name: string; src?: string | null }) {
  return <Face aria-hidden="true">{src ? <img src={src} alt="" /> : name.charAt(0).toUpperCase()}</Face>
}

function Header({ title, subtitle, avatar, children }: { title: string; subtitle?: string; avatar?: string | null; children?: ReactNode }) {
  return (
    <Top>
      <Link to="/conversas" aria-label="Voltar às conversas">
        <ArrowLeft size={20} />
      </Link>
      <Avatar name={title} src={avatar} />
      <Who>
        <strong>{title}</strong>
        {subtitle && <small>{subtitle}</small>}
      </Who>
      {children}
    </Top>
  )
}

// ── Cidadão ──────────────────────────────────────────────────────────────────

/** Conversa do cidadão com a equipe de uma página. Sem conversa ainda, a primeira mensagem a cria. */
export function CitizenPagePane({ orgType, orgId }: { orgType: OrgType; orgId: string }) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const thread = usePageThread(orgType, orgId, true)
  const threadId = thread.data?.conversation?.id ?? ''
  const conversation = useMyPageConversation(threadId)
  const send = useSendPageMessage(orgType, orgId)
  const remove = useDeleteMyPageConversation()
  const respond = useRespondPageConversation()
  const opened = conversation.isSuccess
  // Abrir zera as não lidas no servidor: a lista da caixa e o selo precisam saber.
  useEffect(() => {
    if (opened) {
      void client.invalidateQueries({ queryKey: ['page-inbox', 'mine-list'] })
      void client.invalidateQueries({ queryKey: ['page-inbox', 'mine', 'unread'] })
    }
  }, [opened, threadId, client])

  const page = conversation.data?.page ?? thread.data?.page
  const name = page?.name ?? 'Página'
  const data = conversation.data
  // A página começou a conversa e a pessoa ainda não decidiu (ou recusou).
  const pendingRequest = !!data && data.startedBy === 'STAFF' && !data.accepted
  const declined = pendingRequest && data?.status === 'BLOCKED'
  const blocked = data?.status === 'BLOCKED' && !pendingRequest
  const loading = thread.isLoading || (!!threadId && conversation.isLoading)
  return (
    <Pane data-chat-pane aria-label={`Conversa com ${name}`}>
      <Header title={name} subtitle={`${page?.username ? `@${page.username} · ` : ''}Página`} avatar={page?.avatarUrl}>
        {page && <TopLink to={`/${ORG_PATH[orgType]}/${orgId}`}>Ver perfil</TopLink>}
        {threadId && (
          <TextButton
            type="button"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm('Apagar esta conversa? Ela some também para a equipe da página.')) {
                remove.mutate(threadId, { onSuccess: () => navigate('/conversas', { replace: true }) })
              }
            }}
          >
            Apagar
          </TextButton>
        )}
      </Header>
      <Body>
        <Notice>{NOTICE_TEXT}</Notice>
        {loading && <Muted role="status">Carregando…</Muted>}
        {thread.isError && <ErrorLine role="alert">{pageErrorMessage(thread.error)}</ErrorLine>}
        {conversation.isError && <ErrorLine role="alert">{pageErrorMessage(conversation.error)}</ErrorLine>}
        {data && <MessageList messages={data.messages} ownSide="CITIZEN" />}
        {thread.isSuccess && !threadId && <Muted>Escreva a primeira mensagem para {name}.</Muted>}
      </Body>
      {thread.isSuccess && (
        <Foot>
          {pendingRequest ? (
            <Actions>
              <Muted style={{ flex: 1 }}>{declined ? 'Você recusou esta conversa.' : `${name} quer conversar com você.`}</Muted>
              <Pill $primary type="button" disabled={respond.isPending} onClick={() => respond.mutate({ id: threadId, accept: true })}>
                Aceitar
              </Pill>
              {!declined && (
                <Pill type="button" disabled={respond.isPending} onClick={() => respond.mutate({ id: threadId, accept: false })}>
                  Recusar
                </Pill>
              )}
            </Actions>
          ) : blocked ? (
            <Muted>Esta página não está recebendo novas mensagens suas.</Muted>
          ) : (
            <Composer
              pending={send.isPending}
              placeholder={threadId ? 'Escreva sua mensagem' : `Escreva para ${name}`}
              onSend={(text) => send.mutateAsync(text)}
            />
          )}
          {respond.isError && <ErrorLine role="alert">{pageErrorMessage(respond.error)}</ErrorLine>}
          {send.isError && <ErrorLine role="alert">{pageErrorMessage(send.error)}</ErrorLine>}
          {remove.isError && <ErrorLine role="alert">{pageErrorMessage(remove.error)}</ErrorLine>}
        </Foot>
      )}
    </Pane>
  )
}

// ── Equipe da página ─────────────────────────────────────────────────────────

/** Uma conversa da caixa da página, para quem está acessando como a página. */
export function StaffPagePane({ orgType, orgId, id, canReply }: { orgType: OrgType; orgId: string; id: string; canReply: boolean }) {
  const conversation = useStaffConversation(orgType, orgId, id)
  const reply = useReplyAsStaff(orgType, orgId, id)
  const status = useSetConversationStatus(orgType, orgId, id)
  const data = conversation.data
  const waiting = !!data && data.startedBy === 'STAFF' && !data.accepted
  const citizen = data?.citizen
  return (
    <Pane data-chat-pane aria-label={citizen ? `Conversa com ${citizen.name}` : 'Conversa'}>
      <Header title={citizen?.name ?? 'Conversa'} subtitle={citizen?.username ? `@${citizen.username}` : undefined} avatar={citizen?.avatarUrl}>
        {canReply && data && (
          <>
            {data.status !== 'RESOLVED' && (
              <TextButton type="button" disabled={status.isPending} onClick={() => status.mutate('RESOLVED')}>
                Resolver
              </TextButton>
            )}
            {data.status !== 'OPEN' && (
              <TextButton type="button" disabled={status.isPending} onClick={() => status.mutate('OPEN')}>
                Reabrir
              </TextButton>
            )}
            {data.status !== 'BLOCKED' && (
              <TextButton
                type="button"
                disabled={status.isPending}
                onClick={() => {
                  if (window.confirm('Bloquear esta pessoa? Ela não poderá mais escrever para a página.')) status.mutate('BLOCKED')
                }}
              >
                Bloquear
              </TextButton>
            )}
          </>
        )}
      </Header>
      <Body>
        {conversation.isLoading && <Muted role="status">Carregando…</Muted>}
        {conversation.isError && <ErrorLine role="alert">{pageErrorMessage(conversation.error)}</ErrorLine>}
        {status.isError && <ErrorLine role="alert">{pageErrorMessage(status.error)}</ErrorLine>}
        {waiting && (
          <Notice>{data?.status === 'BLOCKED' ? 'A pessoa recusou esta conversa.' : 'Aguardando a pessoa aceitar a conversa.'}</Notice>
        )}
        {data && <MessageList messages={data.messages} ownSide="STAFF" />}
        {!!data?.readers.length && <Muted>Lida por: {data.readers.map((r) => r.name).join(', ')}</Muted>}
      </Body>
      {data && (
        <Foot>
          {canReply && data.status !== 'BLOCKED' && !waiting ? (
            <Composer pending={reply.isPending} placeholder="Responder como equipe da página" label="Responder" onSend={(t) => reply.mutateAsync(t)} />
          ) : (
            <Muted>
              {data.status === 'BLOCKED' ? 'Conversa bloqueada.' : waiting ? 'Você poderá escrever de novo quando a pessoa aceitar.' : 'Você pode ler, mas não responder.'}
            </Muted>
          )}
          {reply.isError && <ErrorLine role="alert">{pageErrorMessage(reply.error)}</ErrorLine>}
        </Foot>
      )}
    </Pane>
  )
}

/** A página chama um seguidor: escolhe a pessoa e escreve a primeira mensagem; ela precisa aceitar. */
export function StaffStartPane({ orgType, orgId }: { orgType: OrgType; orgId: string }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<{ id: string; name: string; avatarUrl: string | null } | null>(null)
  const followers = useStaffFollowers(orgType, orgId, q.trim(), !picked)
  const start = useStartAsStaff(orgType, orgId)
  return (
    <Pane data-chat-pane aria-label="Nova conversa">
      <Header title={picked ? `Mensagem para ${picked.name}` : 'Nova conversa'} subtitle="Só com quem segue a página" avatar={picked?.avatarUrl}>
        {picked && (
          <TextButton type="button" onClick={() => setPicked(null)}>
            Escolher outra pessoa
          </TextButton>
        )}
      </Header>
      <Body>
        <Notice>A pessoa precisa aceitar antes de a página mandar mais mensagens.</Notice>
        {!picked && (
          <>
            <Search aria-label="Buscar seguidor" placeholder="Nome ou @usuário" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} />
            {followers.isLoading && <Muted role="status">Carregando…</Muted>}
            {followers.isError && <ErrorLine role="alert">{pageErrorMessage(followers.error)}</ErrorLine>}
            {followers.data && !followers.data.length && <Muted>Nenhum seguidor encontrado.</Muted>}
            {followers.data?.map((f) => (
              <PersonButton key={f.id} type="button" onClick={() => setPicked({ id: f.id, name: f.name, avatarUrl: f.avatarUrl })}>
                <strong>{f.name}</strong>
                {f.username && <span>@{f.username}</span>}
              </PersonButton>
            ))}
          </>
        )}
      </Body>
      {picked && (
        <Foot>
          <Composer
            pending={start.isPending}
            placeholder="Primeira mensagem"
            onSend={async (text) => {
              const res = await start.mutateAsync({ citizenId: picked.id, text })
              navigate(`/conversas/pagina/${res.conversationId}`, { replace: true })
            }}
          />
          {start.isError && <ErrorLine role="alert">{pageErrorMessage(start.error)}</ErrorLine>}
        </Foot>
      )}
    </Pane>
  )
}
