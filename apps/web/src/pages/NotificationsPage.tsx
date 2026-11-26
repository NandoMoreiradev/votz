import { useState } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import { Bell, Check } from '@phosphor-icons/react'
import {
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
} from '../hooks/useNotifications'
import { notificationContent } from '../lib/notification-content'

const Page = styled.main`
  max-width: 760px;
  margin: 0 auto;
  padding: 28px 16px 64px;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.5rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  display: flex;
  align-items: center;
  gap: 10px;
`

const FilterRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
`

const FilterBtn = styled.button<{ $active: boolean }>`
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.action : theme.colors.border)};
  background: ${({ theme, $active }) => ($active ? theme.colors.action : theme.colors.white)};
  color: ${({ theme, $active }) => ($active ? theme.colors.onAccent : theme.colors.text)};
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
`

const ActionBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const Card = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  overflow: hidden;
`

const Item = styled.div<{ $unread: boolean }>`
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ $unread }) => ($unread ? 'rgba(15, 118, 110, 0.05)' : 'transparent')};
  &:last-child {
    border-bottom: none;
  }
  a,
  button {
    width: 100%;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 18px;
    text-decoration: none;
    background: none;
    border: none;
    cursor: pointer;
    color: ${({ theme }) => theme.colors.text};
  }
`

const ItemText = styled.span`
  font-size: 0.9375rem;
  line-height: 1.45;
  display: flex;
  align-items: center;
  gap: 8px;
`

const UnreadDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.action};
  flex-shrink: 0;
`

const MetaText = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
`

const Empty = styled.div`
  padding: 40px 20px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.9375rem;
`

const Pager = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
`

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [page, setPage] = useState(1)
  const { data: unreadCount = 0 } = useUnreadCount()
  const { data, isLoading, isError, refetch } = useNotifications({
    page,
    limit: 25,
    unreadOnly,
  })
  const { mutate: markRead } = useMarkRead()
  const { mutate: markAll, isPending: markingAll } = useMarkAllRead()

  const items = data?.data ?? []
  const meta = data?.meta

  return (
    <Page>
      <Header>
        <Title>
          <Bell size={24} weight="duotone" />
          Notificações
        </Title>
        {unreadCount > 0 && (
          <ActionBtn type="button" onClick={() => markAll()} disabled={markingAll}>
            <Check size={16} />
            Marcar todas como lidas ({unreadCount})
          </ActionBtn>
        )}
      </Header>

      <FilterRow>
        <FilterBtn
          type="button"
          $active={!unreadOnly}
          onClick={() => {
            setUnreadOnly(false)
            setPage(1)
          }}
        >
          Todas
        </FilterBtn>
        <FilterBtn
          type="button"
          $active={unreadOnly}
          onClick={() => {
            setUnreadOnly(true)
            setPage(1)
          }}
        >
          Não lidas {unreadCount > 0 ? `(${unreadCount})` : ''}
        </FilterBtn>
      </FilterRow>

      <Card>
        {isLoading ? (
          <Empty>Carregando notificações…</Empty>
        ) : isError ? (
          <Empty>
            Não foi possível carregar as notificações.{' '}
            <ActionBtn type="button" onClick={() => refetch()}>
              Tentar novamente
            </ActionBtn>
          </Empty>
        ) : items.length === 0 ? (
          <Empty>
            {unreadOnly
              ? 'Você não tem notificações não lidas.'
              : 'Você ainda não recebeu notificações.'}
          </Empty>
        ) : (
          items.map((n) => {
            const { label, href } = notificationContent(n)
            const body = (
              <>
                <ItemText>
                  {!n.read && <UnreadDot />}
                  {label}
                </ItemText>
                <MetaText>{formatDateTime(n.createdAt)}</MetaText>
              </>
            )
            const handleOpen = () => {
              if (!n.read) markRead(n.id)
            }
            return (
              <Item key={n.id} $unread={!n.read}>
                {href ? (
                  <Link to={href} onClick={handleOpen}>
                    {body}
                  </Link>
                ) : (
                  <button type="button" onClick={handleOpen}>
                    {body}
                  </button>
                )}
              </Item>
            )
          })
        )}
      </Card>

      {meta && meta.totalPages > 1 && (
        <Pager>
          <ActionBtn type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </ActionBtn>
          <MetaText>
            Página {meta.page} de {meta.totalPages} ({meta.total} notificações)
          </MetaText>
          <ActionBtn
            type="button"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </ActionBtn>
        </Pager>
      )}
    </Page>
  )
}
