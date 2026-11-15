import { useState, useRef, useEffect, useCallback } from 'react'
import logoSrc from '../../assets/brand/votz-logo-dark.svg'
import styled from 'styled-components'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { List, X } from '@phosphor-icons/react'
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

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    padding: 0 ${({ theme }) => theme.spacing[4]};
    gap: ${({ theme }) => theme.spacing[3]};
  }

  @media (max-width: calc(${({ theme }) => theme.breakpoints.md} - 1px)) {
    padding: 0 ${({ theme }) => theme.spacing[3]};
    gap: ${({ theme }) => theme.spacing[2]};
  }
`

const Logo = styled(Link)`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.25rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.white};
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;

  span {
    color: ${({ theme }) => theme.colors.action};
  }
`

const LogoImg = styled.img`
  height: 36px;
  width: auto;
  display: block;

  @media (max-width: calc(${({ theme }) => theme.breakpoints.md} - 1px)) {
    height: 28px;
  }
`

const NavLinks = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;

  @media (max-width: calc(${({ theme }) => theme.breakpoints.md} - 1px)) {
    display: none;
  }
`

const NavLink = styled(Link)`
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  padding: 6px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  white-space: nowrap;
  transition: all 0.15s;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    font-size: ${({ theme }) => theme.fontSizes.sm};
    padding: 6px ${({ theme }) => theme.spacing[2]};
  }

  &:hover {
    color: ${({ theme }) => theme.colors.white};
    background: rgba(255, 255, 255, 0.08);
  }
`

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;

  @media (max-width: calc(${({ theme }) => theme.breakpoints.md} - 1px)) {
    gap: ${({ theme }) => theme.spacing[2]};
  }
`

const AvatarWrapper = styled.div`
  position: relative;

  @media (max-width: calc(${({ theme }) => theme.breakpoints.md} - 1px)) {
    display: none;
  }
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

  @media (max-width: calc(${({ theme }) => theme.breakpoints.md} - 1px)) {
    position: fixed;
    top: 68px;
    right: ${({ theme }) => theme.spacing[3]};
    left: ${({ theme }) => theme.spacing[3]};
    width: auto;
  }
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

  @media (max-width: calc(${({ theme }) => theme.breakpoints.md} - 1px)) {
    display: none;
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

const MobileMenuBtn = styled.button`
  display: none;
  width: 36px;
  height: 36px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: rgba(255, 255, 255, 0.1);
  color: ${({ theme }) => theme.colors.white};
  border: 1px solid rgba(255, 255, 255, 0.15);
  cursor: pointer;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.18);
  }

  @media (max-width: calc(${({ theme }) => theme.breakpoints.md} - 1px)) {
    display: inline-flex;
  }
`

const MobileDrawer = styled.div`
  display: none;
  position: fixed;
  top: 64px;
  left: 0;
  right: 0;
  max-height: calc(100vh - 64px);
  overflow-y: auto;
  background: ${({ theme }) => theme.colors.primary};
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: ${({ theme }) => theme.shadows.lg};
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[4]} ${({ theme }) => theme.spacing[5]};
  z-index: 190;

  @media (max-width: calc(${({ theme }) => theme.breakpoints.md} - 1px)) {
    display: flex;
    flex-direction: column;
    gap: ${({ theme }) => theme.spacing[1]};
  }
`

const MobileSectionLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[1]};
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin-top: ${({ theme }) => theme.spacing[2]};
`

const MobileNavLink = styled(Link)<{ $highlight?: boolean }>`
  display: block;
  padding: ${({ theme }) => theme.spacing[3]};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ $highlight, theme }) => ($highlight ? theme.colors.action : theme.colors.white)};
  border-radius: ${({ theme }) => theme.radii.md};
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
`

const MobileDrawerAction = styled.button<{ $danger?: boolean }>`
  display: block;
  width: 100%;
  text-align: left;
  padding: ${({ theme }) => theme.spacing[3]};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.white)};
  background: none;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
`

export function Navbar() {
  const { user, activeContext, logout, sessionReady } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)

  const { data: profiles } = useMyProfiles(!!user && sessionReady)
  const { mutate: switchContext, isPending: switchPending, isError: switchError } = useSwitchContext()

  const closeMobileMenu = useCallback((restoreFocus = false) => {
    setMobileOpen(false)
    if (restoreFocus) {
      requestAnimationFrame(() => menuBtnRef.current?.focus())
    }
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    setOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    function close(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
      if (
        mobileOpen &&
        drawerRef.current &&
        !drawerRef.current.contains(e.target as Node) &&
        menuBtnRef.current &&
        !menuBtnRef.current.contains(e.target as Node)
      ) {
        closeMobileMenu(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && mobileOpen) {
        closeMobileMenu(true)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [mobileOpen, closeMobileMenu])

  async function handleLogout() {
    try {
      await api.post('/auth/logout')
    } catch {
      // falha de rede não impede o logout local
    }
    logout()
    setOpen(false)
    setMobileOpen(false)
    navigate('/')
  }

  const [mfaSetupRequired, setMfaSetupRequired] = useState(false)

  function handleProfileSelect(contextType: string, contextId?: string, mfaCode?: string) {
    setMfaSetupRequired(false)
    switchContext({ contextType, contextId, mfaCode }, {
      onSuccess: (data) => {
        if ('requiresMfaSetup' in data) { setMfaSetupRequired(true); return }
        if ('requiresMfa' in data) return
        setShowProfileModal(false)
      },
    })
  }

  const isStaff = user?.type === 'MODERATOR' || user?.type === 'ADMIN'
  const hasMultipleProfiles = profiles && profiles.orgs.length > 0

  return (
    <>
      <Nav>
        <Inner>
          <Logo to="/">
            <LogoImg src={logoSrc} alt="Votz" />
          </Logo>

          <NavLinks>
            <NavLink to="/">Explorar</NavLink>
            <NavLink to="/entidades">Entidades</NavLink>
            <NavLink to="/politicos">Políticos</NavLink>
            <NavLink to="/mapa">Mapa</NavLink>
            <NavLink to="/imprensa">Imprensa</NavLink>
            <NavLink to="/planos">Planos</NavLink>
            {activeContext && (activeContext.type === 'ENTITY' || activeContext.type === 'POLITICIAN') && (
              <NavLink to="/painel-dados">Painel</NavLink>
            )}
            {!user && <NavLink to="/solicitar-cadastro">Registrar organização</NavLink>}
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
                      <DropdownItem to="/minhas-solicitacoes" onClick={() => setOpen(false)}>
                        Minhas solicitações
                      </DropdownItem>
                      <DropdownItem to="/solicitar-cadastro" onClick={() => setOpen(false)}>
                        Registrar organização
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

            <MobileMenuBtn
              ref={menuBtnRef}
              type="button"
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-drawer"
              aria-label={mobileOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
              onClick={() => (mobileOpen ? closeMobileMenu(false) : setMobileOpen(true))}
            >
              {mobileOpen ? <X size={20} weight="bold" aria-hidden="true" /> : <List size={20} weight="bold" aria-hidden="true" />}
            </MobileMenuBtn>
          </Actions>
        </Inner>
      </Nav>

      {mobileOpen && (
        <MobileDrawer id="mobile-nav-drawer" ref={drawerRef} role="navigation" aria-label="Menu mobile">
          <MobileNavLink to="/" onClick={() => setMobileOpen(false)}>Explorar</MobileNavLink>
          <MobileNavLink to="/entidades" onClick={() => setMobileOpen(false)}>Entidades</MobileNavLink>
          <MobileNavLink to="/politicos" onClick={() => setMobileOpen(false)}>Políticos</MobileNavLink>
          <MobileNavLink to="/mapa" onClick={() => setMobileOpen(false)}>Mapa</MobileNavLink>
          <MobileNavLink to="/imprensa" onClick={() => setMobileOpen(false)}>Imprensa</MobileNavLink>
          <MobileNavLink to="/planos" onClick={() => setMobileOpen(false)}>Planos</MobileNavLink>
          {activeContext && (activeContext.type === 'ENTITY' || activeContext.type === 'POLITICIAN') && (
            <MobileNavLink to="/painel-dados" onClick={() => setMobileOpen(false)}>
              Painel de dados
            </MobileNavLink>
          )}
          {!user && (
            <MobileNavLink to="/solicitar-cadastro" onClick={() => setMobileOpen(false)}>
              Registrar organização
            </MobileNavLink>
          )}
          {!user && (
            <MobileNavLink to="/entrar" onClick={() => setMobileOpen(false)}>
              Entrar
            </MobileNavLink>
          )}
          {isStaff && (
            <MobileNavLink to="/admin" $highlight onClick={() => setMobileOpen(false)}>
              Admin
            </MobileNavLink>
          )}

          {user && (
            <>
              <MobileSectionLabel>
                {activeContext ? `Atuando como ${activeContext.name}` : user.name}
              </MobileSectionLabel>
              <MobileNavLink to={`/perfil/${user.id}`} onClick={() => setMobileOpen(false)}>
                Meu perfil
              </MobileNavLink>
              {profiles?.orgs.filter((o) => o.type === 'ENTITY').map((org) => (
                <MobileNavLink key={org.id} to={`/entidade/${org.id}`} onClick={() => setMobileOpen(false)}>
                  {org.name}
                </MobileNavLink>
              ))}
              {profiles?.orgs.filter((o) => o.type === 'POLITICIAN').map((org) => (
                <MobileNavLink key={org.id} to={`/politico/${org.id}`} onClick={() => setMobileOpen(false)}>
                  {org.name}
                </MobileNavLink>
              ))}
              <MobileNavLink to="/meu-perfil" onClick={() => setMobileOpen(false)}>
                Editar perfil
              </MobileNavLink>
              <MobileNavLink to="/minhas-solicitacoes" onClick={() => setMobileOpen(false)}>
                Minhas solicitações
              </MobileNavLink>
              <MobileNavLink to="/solicitar-cadastro" onClick={() => setMobileOpen(false)}>
                Registrar organização
              </MobileNavLink>
              {hasMultipleProfiles && (
                <MobileDrawerAction
                  type="button"
                  onClick={() => {
                    setMobileOpen(false)
                    setShowProfileModal(true)
                  }}
                >
                  Trocar perfil
                </MobileDrawerAction>
              )}
              <MobileDrawerAction type="button" $danger onClick={handleLogout}>
                Sair
              </MobileDrawerAction>
            </>
          )}
        </MobileDrawer>
      )}

      {showProfileModal && profiles && (
        <ProfileSelectModal
          profiles={profiles}
          loading={switchPending}
          error={switchError}
          mfaSetupRequired={mfaSetupRequired}
          onSelect={handleProfileSelect}
          onClose={() => setShowProfileModal(false)}
        />
      )}
    </>
  )
}
