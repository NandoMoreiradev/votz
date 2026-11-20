import { useState } from 'react'
import styled from 'styled-components'
import type { OrgType } from '../../hooks/useOrgMemberships'
import {
  pageErrorMessage,
  useReplyAsStaff,
  useSetConversationStatus,
  useStaffConversation,
  useStaffConversations,
  useStaffUnread,
  type PageConversationStatus,
} from '../../hooks/usePageInbox'
import { Composer, ErrorLine, MessageList } from './PageInboxUi'

const Panel = styled.section`
  margin-top: 24px;
  padding: 24px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
`
const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
`
const Title = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
`
const Badge = styled.span`
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.white};
  font-size: ${({ theme }) => theme.fontSizes.xs};
`
const Tabs = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`
const Tab = styled.button<{ $on: boolean }>`
  padding: 6px 12px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme, $on }) => ($on ? theme.colors.primary : theme.colors.white)};
  color: ${({ theme, $on }) => ($on ? theme.colors.white : theme.colors.text)};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  cursor: pointer;
`
const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 260px) minmax(0, 1fr);
  gap: 16px;
  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`
const Item = styled.button<{ $on: boolean }>`
  display: block;
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 6px;
  text-align: left;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme, $on }) => ($on ? theme.colors.neutral : theme.colors.white)};
  cursor: pointer;
  strong {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: ${({ theme }) => theme.fontSizes.sm};
    color: ${({ theme }) => theme.colors.muted};
  }
`
const Muted = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`
const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 8px 0;
`
const Small = styled.button`
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  cursor: pointer;
`

const FILTERS: { label: string; value: PageConversationStatus | undefined }[] = [
  { label: 'Abertas', value: 'OPEN' },
  { label: 'Resolvidas', value: 'RESOLVED' },
  { label: 'Bloqueadas', value: 'BLOCKED' },
  { label: 'Todas', value: undefined },
]

function Detail({ orgType, orgId, id, canReply }: { orgType: OrgType; orgId: string; id: string; canReply: boolean }) {
  const conversation = useStaffConversation(orgType, orgId, id)
  const reply = useReplyAsStaff(orgType, orgId, id)
  const status = useSetConversationStatus(orgType, orgId, id)
  const data = conversation.data
  if (conversation.isLoading) return <Muted>Carregando…</Muted>
  if (conversation.isError) return <ErrorLine role="alert">{pageErrorMessage(conversation.error)}</ErrorLine>
  if (!data) return null
  return (
    <div>
      <strong>
        {data.citizen.name}
        {data.citizen.username ? ` (@${data.citizen.username})` : ''}
      </strong>
      {canReply && (
        <Actions>
          {data.status !== 'RESOLVED' && <Small onClick={() => status.mutate('RESOLVED')}>Marcar como resolvida</Small>}
          {data.status !== 'OPEN' && <Small onClick={() => status.mutate('OPEN')}>Reabrir</Small>}
          {data.status !== 'BLOCKED' && (
            <Small
              onClick={() => {
                if (window.confirm('Bloquear esta pessoa? Ela não poderá mais escrever para a página.')) status.mutate('BLOCKED')
              }}
            >
              Bloquear
            </Small>
          )}
        </Actions>
      )}
      <MessageList messages={data.messages} ownSide="STAFF" />
      {canReply && data.status !== 'BLOCKED' ? (
        <Composer pending={reply.isPending} placeholder="Responder como equipe da página" label="Responder" onSend={(t) => reply.mutateAsync(t)} />
      ) : (
        <Muted>{data.status === 'BLOCKED' ? 'Conversa bloqueada.' : 'Você pode ler, mas não responder.'}</Muted>
      )}
      {reply.isError && <ErrorLine role="alert">{pageErrorMessage(reply.error)}</ErrorLine>}
      {data.readers.length > 0 && (
        <Muted style={{ marginTop: 12 }}>
          Lida por: {data.readers.map((r) => r.name).join(', ')}
        </Muted>
      )}
    </div>
  )
}

/** Caixa de entrada da página: para quem tem READ_MESSAGES (e responde com REPLY_MESSAGES). */
export function PageInboxPanel({ orgType, orgId, permissions }: { orgType: OrgType; orgId: string; permissions: string[] }) {
  const canRead = permissions.includes('READ_MESSAGES')
  const canReply = permissions.includes('REPLY_MESSAGES')
  const [filter, setFilter] = useState<PageConversationStatus | undefined>('OPEN')
  const [selected, setSelected] = useState<string | null>(null)
  const unread = useStaffUnread(orgType, orgId, canRead)
  const list = useStaffConversations(orgType, orgId, filter)
  if (!canRead) return null
  return (
    <Panel aria-label="Mensagens da página">
      <Head>
        <Title>
          Mensagens
          {!!unread.data && <Badge aria-label={`${unread.data} não lidas`}>{unread.data}</Badge>}
        </Title>
        <Tabs role="tablist" aria-label="Filtro">
          {FILTERS.map((f) => (
            <Tab key={f.label} role="tab" aria-selected={filter === f.value} $on={filter === f.value} onClick={() => { setFilter(f.value); setSelected(null) }}>
              {f.label}
            </Tab>
          ))}
        </Tabs>
      </Head>
      <Layout>
        <div>
          {list.isLoading && <Muted>Carregando…</Muted>}
          {list.isError && <ErrorLine role="alert">{pageErrorMessage(list.error)}</ErrorLine>}
          {list.data && !list.data.items.length && <Muted>Nenhuma conversa aqui.</Muted>}
          {list.data?.items.map((c) => (
            <Item key={c.id} $on={selected === c.id} onClick={() => setSelected(c.id)}>
              <strong>
                {c.citizen.name}
                {c.unread > 0 && <Badge>{c.unread}</Badge>}
              </strong>
              <span>{c.lastFrom === 'STAFF' ? 'Equipe: ' : ''}{c.lastText}</span>
            </Item>
          ))}
        </div>
        <div>
          {selected ? <Detail key={selected} orgType={orgType} orgId={orgId} id={selected} canReply={canReply} /> : <Muted>Escolha uma conversa para ler.</Muted>}
        </div>
      </Layout>
    </Panel>
  )
}
