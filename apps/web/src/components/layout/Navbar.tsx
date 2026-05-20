import { useState, useRef, useEffect } from 'react'
import styled from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { ProfileSelectModal } from '../ui/ProfileSelectModal'
import { useAuthStore } from '../../store/auth.store'
import { useUnreadCount, useNotifications, useMarkRead, useMarkAllRead, AppNotification } from '../../hooks/useNotifications'
import { useMyProfiles, useSwitchContext } from '../../hooks/useAuth'
import { api } from '../../lib/api'

const Nav = styled.nav`
  position: sticky;
  top: 0;
  z-index: 100;
  background: ${({ theme }) => theme.colors.primary};
  height: 64px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid rgba(255,255,255,0.06);
`

const Inner = styled.div`
  width: 100%;
  max-width: 1480px;
  margin: 0 auto;
  padding: 0 32px;
  display: flex;
  align-items: center;
  gap: 32px;
`

const Logo = styled(Link)`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.25rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: #fff;
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;

  span {
    color: ${({ theme }) => theme.colors.action};
  }
`

const NavLinks = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
`

const NavLink = styled(Link)`
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  padding: 6px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  transition: all 0.15s;

  &:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
  }
`

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
`

const AvatarWrapper = styled.div`
  position: relative;
`

const Avatar = styled.button<{ $src?: string | null }>`
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover` : theme.colors.action};
  color: #fff;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  font-size: 0.875rem;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`

const Dropdown = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  box-shadow: ${({ theme }) => theme.shadows.md};
  min-width: 168px;
  overflow: hidden;
  z-index: 200;
`

const DropdownItem = styled(Link)`
  display: block;
  padding: 10px 16px;
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  transition: background 0.1s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const DropdownButton = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 16px;
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.action};
  background: none;
  border: none;
  cursor: pointer;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  transition: background 0.1s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const DropdownAction = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 16px;
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: none;
  border: none;
  cursor: pointer;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  transition: background 0.1s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

// ── Notificações ──────────────────────────────────────────────────────────

const BellWrapper = styled.div`
  position: relative;
`

const BellBtn = styled.button`
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.8);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  transition: background 0.15s;
  flex-shrink: 0;

  &:hover { background: rgba(255,255,255,0.18); color: #fff; }
`

const UnreadBadge = styled.span`
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 16px;
  height: 16px;
  border-radius: 99px;
  background: ${({ theme }) => theme.colors.action};
  color: #fff;
  font-size: 0.625rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  line-height: 1;
  pointer-events: none;
`

const NotifDropdown = styled.div`
  position: absolute;
  top: calc(100% + 10px);
  right: -8px;
  width: 320px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  box-shadow: ${({ theme }) => theme.shadows.md};
  z-index: 200;
  overflow: hidden;
`

const NotifHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`

const NotifTitle = styled.span`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`

const MarkAllBtn = styled.button`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.primary};
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  &:hover { text-decoration: underline; }
`

const NotifList = styled.div`
  max-height: 360px;
  overflow-y: auto;
`

const NotifItem = styled(Link)<{ $unread: boolean }>`
  display: block;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ $unread, theme }) => $unread ? theme.colors.primary + '06' : 'transparent'};
  transition: background 0.1s;

  &:last-child { border-bottom: none; }
  &:hover { background: ${({ theme }) => theme.colors.surfaceHover}; }
`

const NotifText = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 2px;
  line-height: 1.4;
`

const NotifSub = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
`

const NotifDot = styled.span`
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.action};
  margin-right: 6px;
  vertical-align: middle;
  flex-shrink: 0;
`

const NotifEmpty = styled.p`
  text-align: center;
  padding: 32px 16px;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`

function notifLabel(n: AppNotification): string {
  if (n.type === 'NEW_COMMENT') return `Novo comentário em "${n.report.title}"`
  if (n.type === 'STATUS_CHANGED') {
    const s = (n.metadata?.newStatus as string) ?? ''
    const labels: Record<string, string> = {
      OPEN: 'Aberto', UNDER_REVIEW: 'Em análise', IN_PROGRESS: 'Em andamento',
      RESOLVED: 'Resolvido', DISPUTED: 'Contestado', ARCHIVED: 'Arquivado',
    }
    return `Relato "${n.report.title}" → ${labels[s] ?? s}`
  }
  return n.report.title
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function NotificationsPanel() {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { data: count = 0 } = useUnreadCount()
  const { data } = useNotifications()
  const { mutate: markRead } = useMarkRead()
  const { mutate: markAll } = useMarkAllRead()

  useEffect(() => {
    function close(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <BellWrapper ref={wrapperRef}>
      <BellBtn onClick={() => setOpen((o) => !o)} title="Notificações">🔔</BellBtn>
      {count > 0 && <UnreadBadge>{count > 99 ? '99+' : count}</UnreadBadge>}

      {open && (
        <NotifDropdown>
          <NotifHeader>
            <NotifTitle>Notificações</NotifTitle>
            {count > 0 && <MarkAllBtn onClick={() => markAll()}>Marcar todas como lidas</MarkAllBtn>}
          </NotifHeader>
          <NotifList>
            {!data || data.data.length === 0 ? (
              <NotifEmpty>Nenhuma notificação ainda.</NotifEmpty>
            ) : (
              data.data.map((n) => (
                <NotifItem
                  key={n.id}
                  to={`/relatos/${n.report.id}`}
                  $unread={!n.read}
                  onClick={() => { if (!n.read) markRead(n.id); setOpen(false) }}
                >
                  <NotifText>
                    {!n.read && <NotifDot />}
                    {notifLabel(n)}
                  </NotifText>
                  <NotifSub>{timeAgo(n.createdAt)}</NotifSub>
                </NotifItem>
              ))
            )}
          </NotifList>
        </NotifDropdown>
      )}
    </BellWrapper>
  )
}

const ReportButton = styled(Button)`
  background: ${({ theme }) => theme.colors.action};
  color: #fff;
  border-color: transparent;
  font-size: 0.875rem;
  padding: 7px 16px;

  &:hover {
    background: #c8313d;
  }
`

const ContextBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: ${({ theme }) => theme.radii.full};
  padding: 3px 10px 3px 4px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.18);
  }
`

const ContextAvatar = styled.div<{ $src?: string | null }>`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover` : theme.colors.action};
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 700;
  font-family: ${({ theme }) => theme.fonts.heading};
  flex-shrink: 0;
`

const ContextName = styled.span`
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: rgba(255, 255, 255, 0.9);
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

export function Navbar() {
  const { user, activeContext, logout } = useAuthStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const { data: profiles } = useMyProfiles(!!user)
  const { mutate: switchContext, isPending: switchPending, isError: switchError } = useSwitchContext()

  useEffect(() => {
    function close(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  async function handleLogout() {
    try {
      await api.post('/auth/logout')
    } catch {
      // falha de rede não impede o logout local
    }
    logout()
    setOpen(false)
    navigate('/')
  }

  function handleProfileSelect(contextType: string, contextId?: string) {
    switchContext({ contextType, contextId }, {
      onSuccess: () => setShowProfileModal(false),
    })
  }

  const isStaff = user?.type === 'MODERATOR' || user?.type === 'ADMIN'
  const hasMultipleProfiles = profiles && profiles.orgs.length > 0

  return (
    <>
      <Nav>
        <Inner>
          <Logo to="/">
            <span>◆</span> VOTZ
          </Logo>

          <NavLinks>
            <NavLink to="/">Explorar</NavLink>
            <NavLink to="/entidades">Entidades</NavLink>
            <NavLink to="/politicos">Políticos</NavLink>
            <NavLink to="/mapa">Mapa</NavLink>
            <NavLink to="/imprensa">Imprensa</NavLink>
            {isStaff && <NavLink to="/admin" style={{ color: '#F59E0B' }}>Admin</NavLink>}
          </NavLinks>

          <Actions>
            {user ? (
              <>
                {activeContext && hasMultipleProfiles && (
                  <ContextBadge
                    title={`Atuando como: ${activeContext.name}`}
                    onClick={() => { setShowProfileModal(true); setOpen(false) }}
                  >
                    <ContextAvatar $src={activeContext.logoUrl}>
                      {!activeContext.logoUrl && activeContext.name.charAt(0).toUpperCase()}
                    </ContextAvatar>
                    <ContextName>{activeContext.name}</ContextName>
                  </ContextBadge>
                )}

                <ReportButton as={Link as any} to="/novo">
                  + Relatar
                </ReportButton>
                <NotificationsPanel />
                <AvatarWrapper ref={wrapperRef}>
                  <Avatar
                    $src={user.avatarUrl}
                    onClick={() => setOpen((o) => !o)}
                    title={user.name}
                  >
                    {!user.avatarUrl && user.name.charAt(0).toUpperCase()}
                  </Avatar>
                  {open && (
                    <Dropdown>
                      <DropdownItem to={`/perfil/${user.id}`} onClick={() => setOpen(false)}>
                        Meu perfil
                      </DropdownItem>
                      {profiles?.orgs.filter(o => o.type === 'ENTITY').map(org => (
                        <DropdownItem key={org.id} to={`/entidade/${org.id}`} onClick={() => setOpen(false)}>
                          {org.name}
                        </DropdownItem>
                      ))}
                      {profiles?.orgs.filter(o => o.type === 'POLITICIAN').map(org => (
                        <DropdownItem key={org.id} to={`/politico/${org.id}`} onClick={() => setOpen(false)}>
                          {org.name}
                        </DropdownItem>
                      ))}
                      <DropdownItem to="/meu-perfil" onClick={() => setOpen(false)}>
                        Editar perfil
                      </DropdownItem>
                      {hasMultipleProfiles && (
                        <DropdownAction onClick={() => { setShowProfileModal(true); setOpen(false) }}>
                          Trocar perfil
                        </DropdownAction>
                      )}
                      <DropdownButton onClick={handleLogout}>Sair</DropdownButton>
                    </Dropdown>
                  )}
                </AvatarWrapper>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  as={Link as any}
                  to="/entrar"
                  style={{ color: 'rgba(255,255,255,0.8)' }}
                >
                  Entrar
                </Button>
                <ReportButton as={Link as any} to="/novo">
                  + Relatar
                </ReportButton>
              </>
            )}
          </Actions>
        </Inner>
      </Nav>

      {showProfileModal && profiles && (
        <ProfileSelectModal
          profiles={profiles}
          loading={switchPending}
          error={switchError}
          onSelect={handleProfileSelect}
        />
      )}
    </>
  )
}
