import { useState, useRef, useEffect, useCallback } from 'react'
import logoDarkSrc from '../../assets/brand/votz-logo-dark.svg'
import logoLightSrc from '../../assets/brand/votz-logo.svg'
import styled from 'styled-components'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowsLeftRight,
  Bell,
  Buildings,
  CaretDown,
  ChartBar,
  ChatCircle,
  Check,
  ClipboardText,
  Lightbulb,
  List,
  MagnifyingGlass,
  Monitor,
  Moon,
  PencilSimple,
  PlusCircle,
  ShieldCheck,
  SignOut,
  Sun,
  UserPlus,
  X,
} from '@phosphor-icons/react'
import { useConversationCapabilities, useConversationsUnread } from '../../hooks/useConversations'
import { useMyPageUnread, useStaffUnread } from '../../hooks/usePageInbox'
import type { OrgType } from '../../hooks/useOrgMemberships'
import { Button } from '../ui/Button'
import { ProfileSelectModal } from '../ui/ProfileSelectModal'
import { InviteVotzModal } from '../ui/InviteVotzModal'
import { useAuthStore } from '../../store/auth.store'
import { useUnreadCount, useNotifications, useMarkRead, useMarkAllRead } from '../../hooks/useNotifications'
import { notificationContent } from '../../lib/notification-content'
import { useMyProfiles, useSwitchContext } from '../../hooks/useAuth'
import { api } from '../../lib/api'
import { useContextNotesEnabled } from '../../hooks/useContextNotes'
import { useSurveysEnabled } from '../../hooks/useSurveys'
import { useAppTheme } from '../../theme/ThemeContext'

const Nav = styled.nav`
  position: sticky;
  top: 0;
  z-index: 100;
  width: 100%;
  max-width: 100%;
  overflow-x: clip;
  background: ${({ theme }) => theme.colors.chromeBg};
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  height: 56px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid ${({ theme }) => theme.colors.chromeBorder};
`

const Inner = styled.div`
  width: 100%;
  max-width: 1480px;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 0 ${({ theme }) => theme.spacing[6]};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing[4]};
  min-width: 0;

  @media (max-width: calc(${({ theme }) => theme.breakpoints.xl} - 1px)) {
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
  color: ${({ theme }) => theme.colors.text};
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;

  span {
    color: ${({ theme }) => theme.colors.action};
  }
`

const LogoMenuWrap = styled.div`
  position: relative;
  flex-shrink: 0;
`

const LogoMenuBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  padding: 4px 6px;
  margin: 0 -6px;
  border-radius: ${({ theme }) => theme.radii.md};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const LogoMenu = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  box-shadow: ${({ theme }) => theme.shadows.md};
  min-width: 240px;
  overflow: hidden;
  z-index: 200;
`

const LogoMenuItem = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 10px 16px;
  background: none;
  border: none;
  cursor: pointer;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.9375rem;
  font-weight: 700;
  color: ${({ theme, $active }) => ($active ? theme.colors.action : theme.colors.text)};

  small {
    display: block;
    font-family: ${({ theme }) => theme.fonts.body};
    font-size: 0.75rem;
    font-weight: 400;
    color: ${({ theme }) => theme.colors.muted};
  }

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const LogoImg = styled.img`
  height: 30px;
  width: auto;
  display: block;

  @media (max-width: calc(${({ theme }) => theme.breakpoints.md} - 1px)) {
    height: 28px;
  }
`

const NavLinks = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing[1]};
  flex: 1;
  min-width: 0;

  @media (max-width: calc(${({ theme }) => theme.breakpoints.xl} - 1px)) {
    display: none;
  }
`

const NavLink = styled(Link)<{ $tone?: 'warning' | 'danger' }>`
  color: ${({ $tone, theme }) =>
    $tone === 'warning'
      ? theme.colors.warning
      : $tone === 'danger'
        ? theme.colors.action
        : theme.colors.muted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  padding: ${({ theme }) => theme.spacing[1]} ${({ theme }) => theme.spacing[3]};
  border-radius: ${({ theme }) => theme.radii.md};
  white-space: nowrap;
  transition: all 0.15s;

  &:hover {
    color: ${({ $tone, theme }) =>
      $tone === 'warning'
        ? theme.colors.warning
        : $tone === 'danger'
          ? theme.colors.action
          : theme.colors.text};
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

/** Botão do Estúdio na barra: em destaque, para quem tem acesso a uma organização. */
const OrgMenuButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing[1]};
  text-decoration: none;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surfaceHover};
  border: 1px solid ${({ theme }) => theme.colors.border};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  padding: 5px 12px;
  border-radius: ${({ theme }) => theme.radii.full};
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral};
    border-color: ${({ theme }) => theme.colors.borderStrong};
  }
`

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing[2]};
  margin-left: auto;
  flex-shrink: 0;
`

const AvatarWrapper = styled.div`
  position: relative;

  @media (max-width: calc(${({ theme }) => theme.breakpoints.xl} - 1px)) {
    display: none;
  }
`

const Avatar = styled.button<{ $src?: string | null }>`
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover` : theme.colors.primary};
  color: ${({ theme }) => theme.colors.onAccent};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  font-size: 0.875rem;
  border: 1px solid ${({ theme }) => theme.colors.border};
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
  border-radius: 14px;
  box-shadow: ${({ theme }) => theme.shadows.lg};
  width: 248px;
  max-height: calc(100vh - 72px);
  overflow-y: auto;
  padding: 6px;
  z-index: 200;
`

const DropdownHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 8px;
`

const DropdownProfileLink = styled(Link)`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;

  strong {
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: 13.5px;
    font-weight: 700;
    color: ${({ theme }) => theme.colors.text};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  span {
    font-size: 11.5px;
    color: ${({ theme }) => theme.colors.muted};
  }

  &:hover strong {
    text-decoration: underline;
  }
`

const DropdownEditBtn = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.muted};
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
    color: ${({ theme }) => theme.colors.text};
  }
`

const DropdownDivider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.colors.border};
  margin: 4px 6px;
`

const dropdownRowStyles = `
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.1s;

  svg {
    flex-shrink: 0;
    opacity: 0.78;
  }
`

const DropdownItem = styled(Link)`
  ${dropdownRowStyles}
  color: ${({ theme }) => theme.colors.text};

  span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const DropdownAction = styled.button`
  ${dropdownRowStyles}
  color: ${({ theme }) => theme.colors.text};
  background: none;
  border: none;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const DropdownButton = styled.button`
  ${dropdownRowStyles}
  color: ${({ theme }) => theme.colors.action};
  background: none;
  border: none;
  cursor: pointer;

  svg {
    opacity: 1;
  }

  &:hover {
    background: ${({ theme }) => `${theme.colors.action}12`};
  }
`

const ThemeRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 10px;
  font-size: 12.5px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.muted};
`

const ThemeSeg = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
`

const ThemeSegBtn = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: ${({ $active, theme }) => ($active ? theme.colors.white : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.colors.text : theme.colors.muted)};
  box-shadow: ${({ $active, theme }) => ($active ? theme.shadows.sm : 'none')};
  cursor: pointer;
  transition: background 0.12s, color 0.12s;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`

// ── Notificações ──────────────────────────────────────────────────────────

const BellWrapper = styled.div`
  position: relative;
`

const BellBtn = styled.button`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
    color: ${({ theme }) => theme.colors.text};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.action};
    outline-offset: 2px;
  }
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

const NotifItem = styled.div<{ $unread: boolean }>`
  display: block;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ $unread, theme }) => $unread ? theme.colors.primary + '06' : 'transparent'};
  transition: background 0.1s;

  &:last-child { border-bottom: none; }
  &:hover { background: ${({ theme }) => theme.colors.surfaceHover}; }
  > a, > button {
    display: block;
    width: 100%;
    padding: 12px 16px;
    text-align: left;
    border: none;
    background: transparent;
    font: inherit;
    cursor: pointer;
  }
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
  const { data, isLoading, isError, refetch } = useNotifications()
  const { mutate: markRead } = useMarkRead()
  const { mutate: markAll } = useMarkAllRead()

  useEffect(() => {
    function close(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [])

  return (
    <BellWrapper ref={wrapperRef}>
      <BellBtn type="button" onClick={() => setOpen((o) => !o)} title="Notificações" aria-label="Notificações" aria-expanded={open} aria-controls="notifications-panel"><Bell size={22} weight="regular" aria-hidden="true" /></BellBtn>
      {count > 0 && <UnreadBadge>{count > 99 ? '99+' : count}</UnreadBadge>}

      {open && (
        <NotifDropdown id="notifications-panel" role="region" aria-label="Notificações">
          <NotifHeader>
            <NotifTitle>Notificações</NotifTitle>
            {count > 0 && <MarkAllBtn onClick={() => markAll()}>Marcar todas como lidas</MarkAllBtn>}
          </NotifHeader>
          <NotifList>
            {isLoading ? <NotifEmpty>Carregando notificações…</NotifEmpty> : isError ? (
              <NotifEmpty>Não foi possível carregar as notificações. <MarkAllBtn onClick={() => refetch()}>Tentar novamente</MarkAllBtn></NotifEmpty>
            ) : !data || data.data.length === 0 ? (
              <NotifEmpty>Nenhuma notificação ainda.</NotifEmpty>
            ) : (
              data.data.map((n) => {
                const { label, href } = notificationContent(n)
                const content = <><NotifText>{!n.read && <NotifDot />}{label}</NotifText><NotifSub>{timeAgo(n.createdAt)}</NotifSub></>
                const onClick = () => { if (!n.read) markRead(n.id); setOpen(false) }
                return <NotifItem key={n.id} $unread={!n.read}>
                  {href ? <Link to={href} onClick={onClick}>{content}</Link> : <button type="button" onClick={onClick}>{content}</button>}
                </NotifItem>
              })
            )}
          </NotifList>
        </NotifDropdown>
      )}
    </BellWrapper>
  )
}

const LoginButton = styled(Button)`
  color: ${({ theme }) => theme.colors.text};
  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.colors.surfaceHover};
    color: ${({ theme }) => theme.colors.text};
  }
`

const ReportButton = styled(Button)`
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.onAccent};
  border-color: transparent;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: 0.875rem;
  padding: 6px 16px;

  &:hover {
    background: ${({ theme }) => theme.colors.actionHover};
  }
`

const ContextBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  background: ${({ theme }) => theme.colors.surfaceHover};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.full};
  padding: 3px 10px 3px 4px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral};
    border-color: ${({ theme }) => theme.colors.borderStrong};
  }

  @media (max-width: calc(${({ theme }) => theme.breakpoints.xl} - 1px)) {
    display: none;
  }
`

const ContextAvatar = styled.div<{ $src?: string | null }>`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover` : theme.colors.primary};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.onAccent};
  font-size: 0.6875rem;
  font-weight: 700;
  font-family: ${({ theme }) => theme.fonts.heading};
  flex-shrink: 0;
`

const ContextName = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  max-width: 112px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const MobileMenuBtn = styled.button`
  display: none;
  width: 36px;
  height: 36px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surfaceHover};
  color: ${({ theme }) => theme.colors.text};
  border: 1px solid ${({ theme }) => theme.colors.border};
  cursor: pointer;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral};
  }

  @media (max-width: calc(${({ theme }) => theme.breakpoints.xl} - 1px)) {
    display: inline-flex;
  }
`

const MobileDrawer = styled.div`
  display: none;
  position: fixed;
  top: 56px;
  left: 0;
  right: 0;
  max-height: calc(100vh - 64px);
  overflow-y: auto;
  background: ${({ theme }) => theme.colors.chromeSolid};
  border-top: 1px solid ${({ theme }) => theme.colors.chromeBorder};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[4]} ${({ theme }) => theme.spacing[5]};
  z-index: 190;

  @media (max-width: calc(${({ theme }) => theme.breakpoints.xl} - 1px)) {
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
  color: ${({ theme }) => theme.colors.muted};
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[1]};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  margin-top: ${({ theme }) => theme.spacing[2]};
`

const MobileNavLink = styled(Link)<{ $highlight?: boolean }>`
  display: block;
  padding: ${({ theme }) => theme.spacing[3]};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ $highlight, theme }) => ($highlight ? theme.colors.action : theme.colors.text)};
  border-radius: ${({ theme }) => theme.radii.md};
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const MobileDrawerAction = styled.button<{ $danger?: boolean }>`
  display: block;
  width: 100%;
  text-align: left;
  padding: ${({ theme }) => theme.spacing[3]};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.text)};
  background: none;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

export type FeedMenuKind = 'publicacoes' | 'relatos'

/** `feedMenu` faz do logo um menu (como o Instagram) para escolher entre Publicações e Relatos. Só a Home usa. */
export function Navbar({ feedMenu }: { feedMenu?: { value: FeedMenuKind; onChange: (value: FeedMenuKind) => void } } = {}) {
  const { user, activeContext, logout, sessionReady } = useAuthStore()
  const conversations = useConversationCapabilities()
  const convUnread = useConversationsUnread(!!conversations.data?.enabled)
  const myPageUnread = useMyPageUnread(!!user && !activeContext)
  const canReadPageInbox = !!activeContext && activeContext.permissions.includes('READ_MESSAGES')
  const staffUnread = useStaffUnread(
    (activeContext?.type ?? 'ENTITY') as OrgType,
    activeContext?.id ?? '',
    canReadPageInbox,
  )
  const chatUnread = activeContext
    ? (staffUnread.data ?? 0)
    : (convUnread.data?.unread ?? 0) + (myPageUnread.data ?? 0)
  const showMessagesIcon = !activeContext || canReadPageInbox
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [feedMenuOpen, setFeedMenuOpen] = useState(false)
  const feedMenuRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)

  const { data: profiles } = useMyProfiles(!!user && sessionReady)
  const contextNotesEnabled = useContextNotesEnabled()
  const surveysEnabled = useSurveysEnabled()
  const { preference: themePref, resolvedMode, setPreference: setThemePref } = useAppTheme()
  const logoSrc = resolvedMode === 'dark' ? logoDarkSrc : logoLightSrc
  const nextThemePref = themePref === 'SYSTEM' ? 'DARK' : themePref === 'DARK' ? 'LIGHT' : 'SYSTEM'
  const themeLabel = themePref === 'DARK' ? 'Escuro' : themePref === 'LIGHT' ? 'Claro' : 'Automático'
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
    if (!feedMenuOpen) return
    function close(e: MouseEvent) {
      if (feedMenuRef.current && !feedMenuRef.current.contains(e.target as Node)) setFeedMenuOpen(false)
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') setFeedMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [feedMenuOpen])

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
      if (e.key === 'Escape') {
        if (mobileOpen) closeMobileMenu(true)
        setOpen(false)
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
        // Entrou no perfil de uma organização: leva direto ao Estúdio.
        if ('ctx' in data && data.ctx) navigate('/estudio')
        else if (location.pathname.startsWith('/estudio')) navigate('/')
      },
    })
  }

  const isStaff = user?.type === 'MODERATOR' || user?.type === 'ADMIN'
  const isSuperAdmin = user?.type === 'ADMIN'
  const isPressOrResearch =
    user?.type === 'PRESS' || user?.type === 'RESEARCHER' || user?.type === 'NGO'
  const hasOrgContext =
    activeContext &&
    (activeContext.type === 'ENTITY' ||
      activeContext.type === 'POLITICIAN' ||
      activeContext.type === 'COMPANY')
  const hasMultipleProfiles = profiles && profiles.orgs.length > 0

  return (
    <>
      <Nav>
        <Inner>
          {feedMenu ? (
            <LogoMenuWrap ref={feedMenuRef}>
              <LogoMenuBtn
                type="button"
                aria-haspopup="menu"
                aria-expanded={feedMenuOpen}
                aria-label="Votz. Escolher o que ver"
                onClick={() => setFeedMenuOpen((v) => !v)}
              >
                <LogoImg src={logoSrc} alt="" />
                <CaretDown size={16} weight="bold" />
              </LogoMenuBtn>
              {feedMenuOpen && (
                <LogoMenu role="menu">
                  {([
                    ['publicacoes', 'Publicações', 'Conversa da comunidade'],
                    ['relatos', 'Relatos', 'Problemas registrados na cidade'],
                  ] as const).map(([value, label, hint]) => (
                    <LogoMenuItem
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={feedMenu.value === value}
                      $active={feedMenu.value === value}
                      onClick={() => { feedMenu.onChange(value); setFeedMenuOpen(false) }}
                    >
                      <span>{label}<small>{hint}</small></span>
                      {feedMenu.value === value && <Check size={18} weight="bold" />}
                    </LogoMenuItem>
                  ))}
                </LogoMenu>
              )}
            </LogoMenuWrap>
          ) : (
            <Logo to="/">
              <LogoImg src={logoSrc} alt="Votz" />
            </Logo>
          )}

          <NavLinks>
            <NavLink to="/">Explorar</NavLink>
            <NavLink to="/mapa">Mapa</NavLink>
            <NavLink to="/entidades">Entidades</NavLink>
            <NavLink to="/politicos">Políticos</NavLink>
            <NavLink to="/debates">Debates</NavLink>
            <NavLink to="/propostas">Propostas</NavLink>
            <NavLink to="/sobre">Sobre</NavLink>
            {(isPressOrResearch || isStaff) && <NavLink to="/imprensa">Imprensa</NavLink>}
            {hasOrgContext && (
              <OrgMenuButton as={Link as any} to="/estudio">
                <Buildings size={16} aria-hidden="true" />
                Estúdio
              </OrgMenuButton>
            )}
            {!user && <NavLink to="/planos">Para organizações</NavLink>}
            {isStaff && <NavLink to="/admin" $tone="warning">Moderação</NavLink>}
            {isSuperAdmin && <NavLink to="/superadmin" $tone="danger">Superadmin</NavLink>}
          </NavLinks>

          <Actions>
            <BellBtn as={Link} to="/buscar" aria-label="Buscar no Votz" title="Buscar no Votz"><MagnifyingGlass size={21} aria-hidden="true" /></BellBtn>
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

                {!activeContext && hasMultipleProfiles && (
                  <OrgMenuButton
                    type="button"
                    title="Trocar para o perfil de uma organização que você gerencia"
                    onClick={() => { setShowProfileModal(true); setOpen(false) }}
                  >
                    <Buildings size={16} aria-hidden="true" />
                    Abrir Estúdio
                  </OrgMenuButton>
                )}

                <ReportButton as={Link as any} to="/novo">
                  + Relatar
                </ReportButton>
                <NotificationsPanel />
                {showMessagesIcon && (
                  <BellWrapper>
                    <BellBtn
                      as={Link}
                      to="/conversas"
                      aria-label={chatUnread > 0 ? `Conversas, ${chatUnread} não lidas` : 'Conversas'}
                      title="Conversas"
                    >
                      <ChatCircle size={23} aria-hidden="true" />
                    </BellBtn>
                    {chatUnread > 0 && <UnreadBadge>{chatUnread > 99 ? '99+' : chatUnread}</UnreadBadge>}
                  </BellWrapper>
                )}
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
                      <DropdownHeader>
                        <DropdownProfileLink to={`/perfil/${user.id}`} onClick={() => setOpen(false)}>
                          <strong>{user.name}</strong>
                          <span>Ver meu perfil</span>
                        </DropdownProfileLink>
                        <DropdownEditBtn
                          to="/meu-perfil"
                          onClick={() => setOpen(false)}
                          title="Editar perfil"
                          aria-label="Editar perfil"
                        >
                          <PencilSimple size={15} />
                        </DropdownEditBtn>
                      </DropdownHeader>

                      {hasMultipleProfiles && (
                        <>
                          <DropdownDivider />
                          {profiles?.orgs.filter(o => o.type === 'ENTITY').map(org => (
                            <DropdownItem key={org.id} to={`/entidade/${org.id}`} onClick={() => setOpen(false)}>
                              <Buildings size={15} />
                              <span>{org.name}</span>
                            </DropdownItem>
                          ))}
                          {profiles?.orgs.filter(o => o.type === 'POLITICIAN').map(org => (
                            <DropdownItem key={org.id} to={`/politico/${org.id}`} onClick={() => setOpen(false)}>
                              <Buildings size={15} />
                              <span>{org.name}</span>
                            </DropdownItem>
                          ))}
                          <DropdownAction onClick={() => { setShowProfileModal(true); setOpen(false) }}>
                            <ArrowsLeftRight size={15} />
                            <span>Trocar perfil</span>
                          </DropdownAction>
                        </>
                      )}

                      <DropdownDivider />

                      {surveysEnabled && (
                        <DropdownItem to="/pesquisas" onClick={() => setOpen(false)}>
                          <ChartBar size={15} />
                          <span>Pesquisa Votz</span>
                        </DropdownItem>
                      )}
                      {contextNotesEnabled && (
                        <DropdownItem to="/contexto" onClick={() => setOpen(false)}>
                          <ShieldCheck size={15} />
                          <span>Contexto da Comunidade</span>
                        </DropdownItem>
                      )}
                      <DropdownItem to="/minhas-solicitacoes" onClick={() => setOpen(false)}>
                        <ClipboardText size={15} />
                        <span>Minhas solicitações</span>
                      </DropdownItem>
                      <DropdownItem to="/solicitar-cadastro" onClick={() => setOpen(false)}>
                        <PlusCircle size={15} />
                        <span>Registrar organização</span>
                      </DropdownItem>
                      <DropdownItem to="/sugestoes" onClick={() => setOpen(false)}>
                        <Lightbulb size={15} />
                        <span>Sugestões e melhorias</span>
                      </DropdownItem>
                      <DropdownAction onClick={() => { setShowInviteModal(true); setOpen(false) }}>
                        <UserPlus size={15} />
                        <span>Convidar pessoas</span>
                      </DropdownAction>

                      <DropdownDivider />

                      <ThemeRow>
                        <span>Tema</span>
                        <ThemeSeg role="group" aria-label="Escolher tema">
                          <ThemeSegBtn
                            type="button"
                            $active={themePref === 'LIGHT'}
                            onClick={() => setThemePref('LIGHT')}
                            title="Tema claro"
                            aria-label="Tema claro"
                          >
                            <Sun size={14} />
                          </ThemeSegBtn>
                          <ThemeSegBtn
                            type="button"
                            $active={themePref === 'DARK'}
                            onClick={() => setThemePref('DARK')}
                            title="Tema escuro"
                            aria-label="Tema escuro"
                          >
                            <Moon size={14} />
                          </ThemeSegBtn>
                          <ThemeSegBtn
                            type="button"
                            $active={themePref === 'SYSTEM'}
                            onClick={() => setThemePref('SYSTEM')}
                            title="Tema automático do sistema"
                            aria-label="Tema automático"
                          >
                            <Monitor size={14} />
                          </ThemeSegBtn>
                        </ThemeSeg>
                      </ThemeRow>

                      <DropdownDivider />

                      <DropdownButton onClick={handleLogout}>
                        <SignOut size={15} />
                        <span>Sair</span>
                      </DropdownButton>
                    </Dropdown>
                  )}
                </AvatarWrapper>
              </>
            ) : (
              <>
                <LoginButton
                  variant="ghost"
                  size="sm"
                  as={Link as any}
                  to="/entrar"
                >
                  Entrar
                </LoginButton>
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
          <MobileNavLink to="/buscar" onClick={() => setMobileOpen(false)}>Buscar</MobileNavLink>
          <MobileNavLink to="/mapa" onClick={() => setMobileOpen(false)}>Mapa</MobileNavLink>
          <MobileNavLink to="/entidades" onClick={() => setMobileOpen(false)}>Entidades</MobileNavLink>
          <MobileNavLink to="/politicos" onClick={() => setMobileOpen(false)}>Políticos</MobileNavLink>
          <MobileNavLink to="/debates" onClick={() => setMobileOpen(false)}>Debates</MobileNavLink>
          <MobileNavLink to="/propostas" onClick={() => setMobileOpen(false)}>Propostas</MobileNavLink>
          <MobileNavLink to="/sobre" onClick={() => setMobileOpen(false)}>Sobre o Votz</MobileNavLink>
          {(isPressOrResearch || isStaff) && (
            <MobileNavLink to="/imprensa" onClick={() => setMobileOpen(false)}>Imprensa</MobileNavLink>
          )}
          {hasOrgContext && (
            <MobileNavLink to="/estudio" onClick={() => setMobileOpen(false)}>
              Estúdio
            </MobileNavLink>
          )}
          {user && !activeContext && hasMultipleProfiles && (
            <MobileDrawerAction
              type="button"
              onClick={() => {
                setMobileOpen(false)
                setShowProfileModal(true)
              }}
            >
              Abrir Estúdio
            </MobileDrawerAction>
          )}
          {!user && (
            <MobileNavLink to="/planos" onClick={() => setMobileOpen(false)}>
              Para organizações
            </MobileNavLink>
          )}
          {!user && (
            <MobileNavLink to="/entrar" onClick={() => setMobileOpen(false)}>
              Entrar
            </MobileNavLink>
          )}
          {isStaff && (
            <MobileNavLink to="/admin" $highlight onClick={() => setMobileOpen(false)}>
              Moderação
            </MobileNavLink>
          )}
          {isSuperAdmin && (
            <MobileNavLink to="/superadmin" $highlight onClick={() => setMobileOpen(false)}>
              Superadmin
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
              <MobileNavLink to="/sugestoes" onClick={() => setMobileOpen(false)}>
                Sugestões e melhorias
              </MobileNavLink>
              {contextNotesEnabled && (
                <MobileNavLink to="/contexto" onClick={() => setMobileOpen(false)}>
                  Contexto da Comunidade
                </MobileNavLink>
              )}
              {surveysEnabled && (
                <MobileNavLink to="/pesquisas" onClick={() => setMobileOpen(false)}>
                  Pesquisa Votz
                </MobileNavLink>
              )}
              <MobileDrawerAction
                type="button"
                onClick={() => {
                  setMobileOpen(false)
                  setShowInviteModal(true)
                }}
              >
                Convidar pessoas
              </MobileDrawerAction>
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
      <InviteVotzModal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} />
    </>
  )
}
