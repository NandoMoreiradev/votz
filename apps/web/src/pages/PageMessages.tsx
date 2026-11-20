import styled from 'styled-components'
import { Link, Navigate } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { ErrorLine } from '../components/page-inbox/PageInboxUi'
import { useAuthStore } from '../store/auth.store'
import { pageErrorMessage, useMyPageConversations } from '../hooks/usePageInbox'
import type { OrgType } from '../hooks/useOrgMemberships'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`
const Content = styled.main`
  max-width: 640px;
  margin: 0 auto;
  padding: 16px 16px 64px;
`
const Card = styled.section`
  padding: 20px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
`
const H1 = styled.h1`
  margin: 0 0 16px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
`
const Row = styled(Link)`
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  color: inherit;
  text-decoration: none;
  &:first-of-type {
    border-top: 0;
  }
`
const Avatar = styled.span<{ $src: string | null }>`
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme, $src }) => ($src ? `url(${$src}) center/cover` : theme.colors.neutral)};
`
const Grow = styled.div`
  flex: 1;
  min-width: 0;
  strong {
    display: block;
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
const Dot = styled.span`
  min-width: 20px;
  padding: 2px 6px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.white};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  text-align: center;
`
const Muted = styled.p`
  color: ${({ theme }) => theme.colors.muted};
`

const ORG_PATH: Record<OrgType, string> = { POLITICIAN: 'politico', ENTITY: 'entidade', COMPANY: 'empresa' }

/** "Minhas mensagens para páginas" (lista). */
export function PageMessagesList() {
  const user = useAuthStore((s) => s.user)
  const list = useMyPageConversations(!!user)
  if (!user) return <Navigate to="/entrar" replace />
  return (
    <Page>
      <Navbar />
      <Content>
        <H1>Mensagens para páginas</H1>
        <Card>
          {list.isLoading && <Muted>Carregando…</Muted>}
          {list.isError && <ErrorLine role="alert">{pageErrorMessage(list.error)}</ErrorLine>}
          {list.data && !list.data.items.length && (
            <Muted>Você ainda não escreveu para nenhuma página. Abra o perfil de um político, entidade ou empresa e toque em “Mensagem”.</Muted>
          )}
          {list.data?.items.map((c) => (
            <Row key={c.id} to={`/${ORG_PATH[c.page.orgType]}/${c.page.orgId}?mensagens=1`}>
              <Avatar $src={c.page.avatarUrl} aria-hidden="true" />
              <Grow>
                <strong>{c.page.name}</strong>
                <span>
                  {c.lastFrom === 'CITIZEN' ? 'Você: ' : ''}
                  {c.lastText}
                </span>
              </Grow>
              {c.unread > 0 && <Dot aria-label={`${c.unread} não lidas`}>{c.unread}</Dot>}
            </Row>
          ))}
        </Card>
      </Content>
    </Page>
  )
}

