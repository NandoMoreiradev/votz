import { useEffect, useRef, useState, type FormEvent, type PropsWithChildren } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Bell,
  BellSlash,
  ChatCircle,
  DeviceMobile,
  Flag,
  GearSix,
  MagnifyingGlass,
  Monitor,
  Plus,
  Prohibit,
  PushPin,
  ShieldCheck,
  SignOut,
  UserPlus,
  Users,
  XCircle,
} from '@phosphor-icons/react'
import styled from 'styled-components'
import {
  CONVERSATION_REPORT_REASONS,
  conversationIsMuted,
  conversationTitle,
  conversationMemberLabel,
  conversationTime,
  conversationUnreadLabel,
  mergeInboxLists,
  type ActiveContext,
  type ConversationMuteDuration,
  type ConversationPerson,
  type ConversationReportReason,
  type ConversationSummary,
} from '@votz/shared-types'
import { useChatPreview } from '../hooks/useChatPreview'
import { Navbar } from '../components/layout/Navbar'
import {
  useConversation,
  useConversationAction,
  useConversationBlocks,
  useConversationCapabilities,
  useConversationContacts,
  useConversationStartOptions,
  useConversationList,
  useConversationScope,
  useCreateConversationGroup,
} from '../hooks/useConversations'
import type { OrgType } from '../hooks/useOrgMemberships'
import {
  useMyPageConversationList,
  useStaffConversations,
  type MyPageConversationRow,
  type PageConversationStatus,
  type StaffConversationRow,
} from '../hooks/usePageInbox'
import { CitizenPagePane, StaffPagePane, StaffStartPane } from '../components/page-inbox/PageConversationViews'
import { pageConversationPath } from '../components/page-inbox/PageMessageButton'
import { useAuthStore } from '../store/auth.store'
import { ChatPane } from '../components/conversations/ChatPane'
import { ConversationSettingsView } from '../components/conversations/ConversationSettings'
import { isAxiosError } from 'axios'
import {
  chatStorageDeleteConfirm,
  chatStorageView,
  deviceRequestText,
  ENROLL_WAITING,
  formatStorageSize,
  parseDeviceLinkQr,
  STORAGE_KIND_LABEL,
  type ChatDeviceInfo,
} from '@votz/chat-core'
import {
  useChatDeviceAction,
  useChatDevices,
  useChatDeviceStatus,
} from '../hooks/useChatDevices'
import { useChatStorage, useDeleteChatStorage } from '../hooks/useChatStorage'
import { closeWebChatSession } from '../lib/chat-session'
import { Page, Panel } from '../components/conversations/layout'
import { ConnectDeviceCard } from '../components/conversations/ConnectDeviceCard'
import { ChatBackupPanel } from '../components/conversations/ChatBackupPanel'

const PLATFORM: Record<string, string> = {
  android: 'Android',
  ios: 'iPhone',
  web: 'Navegador',
  test: 'Teste',
}
const deviceName = (device: { label: string | null; platform: string }) =>
  device.label || PLATFORM[device.platform] || device.platform

/** Fundo da página: o mesmo cinza das outras telas, para a caixa de conversas ficar "dentro" da página. */
const Backdrop = styled.div`
  background: ${({ theme }) => theme.colors.neutral};
  @media (min-width: 960px) {
    padding: 24px 32px;
  }
`
/** Largura da página inicial: até 1480 px com 32 px de margem. Abaixo de 960 px ocupa a tela toda. */
const Shell = styled.main`
  display: flex;
  flex-direction: column;
  min-height: calc(100dvh - 56px);
  background: ${({ theme }) => theme.colors.white};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
  @media (min-width: 960px) {
    flex-direction: row;
    box-sizing: border-box;
    max-width: 1416px;
    margin: 0 auto;
    height: calc(100dvh - 56px - 48px);
    min-height: 0;
    overflow: hidden;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 12px;
  }
  h1 {
    font-size: 18px;
    margin: 0;
    font-family: ${({ theme }) => theme.fonts.heading};
    letter-spacing: -0.01em;
  }
  h2 {
    font-size: 16px;
    margin: 0 0 8px;
  }
  p {
    line-height: 1.5;
  }
  button,
  input {
    font: inherit;
  }
  button,
  a {
    -webkit-tap-highlight-color: transparent;
  }
  button:focus-visible,
  a:focus-visible,
  input:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.action};
    outline-offset: 2px;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
`
const Sidebar = styled.aside<{ $hiddenOnMobile?: boolean }>`
  display: ${({ $hiddenOnMobile }) => ($hiddenOnMobile ? 'none' : 'flex')};
  flex-direction: column;
  width: 100%;
  min-width: 0;
  background: ${({ theme }) => theme.colors.white};
  @media (min-width: 960px) {
    display: flex;
    width: clamp(320px, 28vw, 440px);
    flex-shrink: 0;
    height: 100%;
    overflow-y: auto;
    border-right: 1px solid ${({ theme }) => theme.colors.border};
  }
`
const Stage = styled.div<{ $hiddenOnMobile?: boolean }>`
  display: ${({ $hiddenOnMobile }) => ($hiddenOnMobile ? 'none' : 'flex')};
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  background: ${({ theme }) => theme.colors.neutral};
  &:has([data-chat-pane]) > header {
    display: none;
  }
  @media (min-width: 960px) {
    display: flex;
    height: 100%;
    overflow-y: auto;
    &:has([data-chat-pane]) {
      overflow: hidden;
    }
  }
`
const EmptyStage = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 48px 32px;
  gap: 12px;
  color: ${({ theme }) => theme.colors.muted};
  h2 {
    margin: 8px 0 0;
    font-size: 20px;
    font-family: ${({ theme }) => theme.fonts.heading};
    color: ${({ theme }) => theme.colors.text};
  }
  p {
    margin: 0;
    max-width: 380px;
    font-size: 14px;
    line-height: 1.6;
  }
`
const EmptyIcon = styled.div`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.primary};
`
const Header = styled.header`
  position: sticky;
  top: 0;
  z-index: 2;
  flex-shrink: 0;
  height: 64px;
  padding: 0 12px 0 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: ${({ theme }) => theme.colors.white};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  h1 {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  a {
    color: ${({ theme }) => theme.colors.primary};
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    text-decoration: none;
    flex-shrink: 0;
  }
  a:hover {
    background: ${({ theme }) => theme.colors.neutral};
  }
`
const Section = styled.section`
  padding: 20px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`
const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
`
const Muted = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  margin: 4px 0;
  font-size: 13.5px;
`
const LineTop = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  strong {
    flex: 1;
    min-width: 0;
    font-size: 15px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`
const LineBottom = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  p {
    flex: 1;
    min-width: 0;
    margin: 2px 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`
const Time = styled.small<{ $unread: boolean }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  white-space: nowrap;
  color: ${({ theme, $unread }) => ($unread ? theme.colors.action : theme.colors.muted)};
  font-weight: ${({ $unread }) => ($unread ? 600 : 400)};
`
const Badge = styled.span`
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.white};
  background: ${({ theme }) => theme.colors.action};
`
/** Uma conversa da lista: nome, última mensagem (prévia só se este navegador a abriu), horário e não lidas. */
function InboxLine({ item, userId }: { item: ConversationSummary; userId: string }) {
  const preview = useChatPreview(item.id)
  const last = item.lastMessage
  const unread = item.unreadCount
  const subtitle = item.archivedAt
    ? 'Grupo encerrado'
    : item.kind === 'GROUP'
      ? conversationMemberLabel(item.memberCount)
      : item.members.some((m) => m.state === 'INVITED')
        ? 'Aguardando aceite'
        : last
          ? `${last.fromMe ? 'Você: ' : ''}${
              preview?.eventId === last.eventId ? preview.text : 'Mensagem protegida'
            }`
          : 'Conversa aceita'
  return (
    <Link
      to={`/conversas/${item.id}`}
      aria-label={
        unread > 0
          ? `${conversationTitle(item, userId)}, ${unread} ${unread === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`
          : undefined
      }
    >
      <LineTop>
        <strong>{conversationTitle(item, userId)}</strong>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {item.pinnedAt && (
            <PushPin size={14} weight="fill" aria-label="Conversa fixada" />
          )}
          {conversationIsMuted(item.mutedUntil) && (
            <BellSlash size={15} aria-label="Notificações silenciadas" />
          )}
          {last && <Time $unread={unread > 0}>{conversationTime(last.at)}</Time>}
        </span>
      </LineTop>
      <LineBottom>
        <Muted style={unread > 0 ? { color: 'inherit', fontWeight: 600 } : undefined}>
          {subtitle}
        </Muted>
        {unread > 0 && <Badge aria-hidden="true">{conversationUnreadLabel(unread)}</Badge>}
      </LineBottom>
    </Link>
  )
}
const Action = styled.button<{ $secondary?: boolean }>`
  border: 1px solid
    ${({ theme, $secondary }) => ($secondary ? theme.colors.border : theme.colors.action)};
  border-radius: 20px;
  background: ${({ theme, $secondary }) => ($secondary ? theme.colors.white : theme.colors.action)};
  color: ${({ theme, $secondary }) => ($secondary ? theme.colors.text : theme.colors.white)};
  min-height: 40px;
  padding: 8px 20px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  &:hover:not(:disabled) {
    background: ${({ theme, $secondary }) => ($secondary ? theme.colors.neutral : '#d6303d')};
  }
`
const Field = styled.input`
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  font-size: 15px;
  margin: 8px 0;
  background: ${({ theme }) => theme.colors.white};
  color: inherit;
`
const ListItem = styled.div`
  position: relative;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  a {
    color: inherit;
    text-decoration: none;
    display: block;
  }
  /* A linha inteira é clicável, não só o texto. */
  a::after {
    content: '';
    position: absolute;
    inset: 0;
  }
  &:last-child {
    border-bottom: 0;
  }
  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
  &[data-active='true'] {
    background: ${({ theme }) => theme.colors.neutral};
  }
`
const Face = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.colors.action}14;
  color: ${({ theme }) => theme.colors.action};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  font-size: 18px;
  overflow: hidden;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`
const TabRow = styled.div`
  display: flex;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  button {
    flex: 1;
    min-height: 48px;
    background: transparent;
    border: 0;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
    color: ${({ theme }) => theme.colors.muted};
  }
  button:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
  button[aria-selected='true'] {
    color: ${({ theme }) => theme.colors.text};
    border-bottom-color: ${({ theme }) => theme.colors.action};
  }
`
const Notice = styled.div`
  padding: 14px 16px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.muted};
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 13.5px;
  line-height: 1.5;
  svg {
    flex-shrink: 0;
    margin-top: 1px;
  }
`
const Buttons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
`
// Atalhos da lateral: pílulas pequenas, com o nome completo para leitores de tela.
// Topo da tela de detalhes: avatar grande, nome e uma linha de apoio.
const Hero = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 32px 24px 24px;
  text-align: center;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  h2 {
    margin: 12px 0 0;
    font-size: 20px;
    font-family: ${({ theme }) => theme.fonts.heading};
  }
  p {
    margin: 0;
  }
`
const HeroFace = styled.div`
  width: 88px;
  height: 88px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.action}14;
  color: ${({ theme }) => theme.colors.action};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 34px;
  font-weight: 700;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`
// Ações em linhas com ícone, como nos aplicativos de mensagem: os botões continuam sendo botões.
const ActionList = styled.div`
  display: flex;
  flex-direction: column;
  button {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 16px;
    width: 100%;
    min-height: 52px;
    padding: 0 24px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.text};
    font-weight: 400;
    font-size: 15px;
    text-align: left;
  }
  button + button {
    border-top: 1px solid ${({ theme }) => theme.colors.border};
  }
  button:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral};
  }
  button[data-danger] {
    color: ${({ theme }) => theme.colors.action};
  }
  button svg {
    flex-shrink: 0;
    margin: 0 !important;
  }
`
const SearchPill = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 8px 0 16px;
  padding: 0 16px;
  border-radius: 24px;
  background: ${({ theme }) => theme.colors.neutral};
  color: ${({ theme }) => theme.colors.muted};
  &:focus-within {
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.action};
  }
  input {
    flex: 1;
    min-width: 0;
    min-height: 46px;
    border: 0;
    outline: 0;
    background: transparent;
    font: inherit;
    font-size: 15px;
    color: ${({ theme }) => theme.colors.text};
  }
  /* O anel de foco é o da pílula inteira, não o do campo de dentro. */
  input:focus-visible {
    outline: 0;
  }
`
const VisuallyHidden = styled.label`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`
const RowButton = styled.div`
  cursor: pointer;
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.action};
    outline-offset: -2px;
  }
`
const TextAction = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.action};
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 20px;
  cursor: pointer;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral};
  }
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`

function message(error: unknown) {
  const value = error as { response?: { data?: { message?: string | string[] } } }
  const text = value?.response?.data?.message
  return Array.isArray(text)
    ? text.join('. ')
    : text || 'Não foi possível concluir. Verifique sua conexão e tente novamente.'
}
function Failure({ error, retry, card = false }: { error: unknown; retry?: () => void; card?: boolean }) {
  const Box = card ? Panel : Section
  return (
    <Box role="alert">
      <p>{message(error)}</p>
      {retry && (
        <Action $secondary onClick={retry}>
          Tentar novamente
        </Action>
      )}
    </Box>
  )
}
function Portrait({ person, group }: { person?: ConversationPerson; group?: boolean }) {
  return (
    <Face>
      {person?.avatarUrl ? (
        <img src={person.avatarUrl} alt="" />
      ) : group ? (
        <Users size={23} />
      ) : (
        person?.name.charAt(0).toUpperCase() || <ChatCircle size={23} />
      )}
    </Face>
  )
}
export function ConversationGate({ children, allowWithoutChat = false }: PropsWithChildren<{ allowWithoutChat?: boolean }>) {
  const scope = useConversationScope()
  const capability = useConversationCapabilities()
  if (!scope.user)
    return (
      <Section>
        <h2>Suas conversas começam aqui</h2>
        <p>Entre na sua conta para continuar.</p>
        <Link to="/entrar">Entrar no Votz</Link>
      </Section>
    )
  if (scope.activeContext)
    return (
      <Section>
        <h2>Use sua identidade pessoal</h2>
        <p>Selecione seu perfil pessoal no menu de contas para acessar suas conversas.</p>
      </Section>
    )
  if (!scope.user.emailVerified)
    return (
      <Section>
        <h2>Confirme seu e-mail</h2>
        <p>A confirmação protege você e as pessoas com quem conversa.</p>
      </Section>
    )
  if (capability.isPending) return <Section role="status">Carregando conversas…</Section>
  // Conversas com páginas não dependem do chat cifrado: seguem abertas mesmo se ele estiver desligado.
  if (allowWithoutChat && (capability.isError || !capability.data?.enabled)) return <>{children}</>
  if (capability.isError)
    return (
      <Failure
        error={capability.error}
        retry={() => {
          void capability.refetch()
        }}
      />
    )
  if (!capability.data?.enabled)
    return (
      <Section>
        <h2>Conversas estão chegando</h2>
        <p>Este recurso ainda não foi liberado para sua conta.</p>
      </Section>
    )
  return <>{children}</>
}
/** Tipos de página aceitos no endereço `/conversas/pagina/:orgType/:orgId`. */
const PAGE_TYPES: readonly OrgType[] = ['POLITICIAN', 'ENTITY', 'COMPANY']

/**
 * Caixa de mensagens unificada. O acesso decide o que aparece, sem misturar:
 * perfil pessoal vê as conversas da pessoa (com pessoas, grupos e páginas);
 * acessando como página, vê só as conversas da página.
 */
export function Conversations() {
  const activeContext = useAuthStore((s) => s.activeContext)
  return activeContext ? <PageContextInbox context={activeContext} /> : <PersonalConversations />
}

/** Caixa da página (político, entidade ou empresa), para quem está acessando como ela. */
function PageContextInbox({ context }: { context: ActiveContext }) {
  const location = useLocation()
  const subpath = location.pathname.replace(/^\/conversas\/?/, '').replace(/\/+$/, '')
  const orgType = context.type as OrgType
  const canRead = context.permissions.includes('READ_MESSAGES')
  const canReply = context.permissions.includes('REPLY_MESSAGES')
  const create = subpath === 'nova' && canReply
  const id = /^pagina\/[0-9a-f-]{36}$/i.test(subpath) ? subpath.slice('pagina/'.length) : undefined
  const sub = create || !!id
  return (
    <>
      <Navbar />
      <Backdrop>
        <Shell data-split-layout>
          <Sidebar $hiddenOnMobile={sub}>
            <Header>
              <Link to="/" aria-label="Voltar">
                <ArrowLeft size={20} />
              </Link>
              <h1 title={context.name}>Mensagens de {context.name}</h1>
              {canReply && (
                <Link to="/conversas/nova" aria-label="Nova conversa">
                  <Plus size={20} weight="bold" />
                </Link>
              )}
            </Header>
            {canRead ? (
              <StaffInbox orgType={orgType} orgId={context.id} activeId={id} />
            ) : (
              <Section>
                <h2>Sem acesso às mensagens</h2>
                <Muted>Peça a quem administra a página a permissão de ler mensagens.</Muted>
              </Section>
            )}
          </Sidebar>
          <Stage $hiddenOnMobile={!sub}>
            {canRead && create ? (
              <StaffStartPane orgType={orgType} orgId={context.id} />
            ) : canRead && id ? (
              <StaffPagePane key={id} orgType={orgType} orgId={context.id} id={id} canReply={canReply} />
            ) : (
              <EmptyStage>
                <EmptyIcon>
                  <ChatCircle size={36} />
                </EmptyIcon>
                <h2>Mensagens da página</h2>
                <p>
                  Aqui ficam só as conversas de {context.name}. Suas conversas pessoais aparecem quando você volta para o seu
                  perfil no menu de contas.
                </p>
              </EmptyStage>
            )}
          </Stage>
        </Shell>
      </Backdrop>
    </>
  )
}

const STAFF_FILTERS: { label: string; value: PageConversationStatus | undefined }[] = [
  { label: 'Abertas', value: 'OPEN' },
  { label: 'Resolvidas', value: 'RESOLVED' },
  { label: 'Bloqueadas', value: 'BLOCKED' },
  { label: 'Todas', value: undefined },
]

/** Lista da caixa da página: filtro por situação, quem escreveu, última mensagem e não lidas. */
function StaffInbox({ orgType, orgId, activeId }: { orgType: OrgType; orgId: string; activeId?: string }) {
  const [filter, setFilter] = useState<PageConversationStatus | undefined>('OPEN')
  const list = useStaffConversations(orgType, orgId, filter)
  const items = list.data?.items ?? []
  return (
    <>
      <TabRow role="tablist" aria-label="Situação das conversas">
        {STAFF_FILTERS.map((f) => (
          <button key={f.label} type="button" role="tab" aria-selected={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </TabRow>
      {list.isError && <Failure error={list.error} retry={() => void list.refetch()} />}
      {list.isPending ? (
        <Section role="status">Carregando…</Section>
      ) : (
        !items.length &&
        !list.isError && (
          <Section>
            <Muted>Nenhuma conversa aqui.</Muted>
          </Section>
        )
      )}
      {items.map((c) => (
        <StaffInboxLine key={c.id} row={c} active={activeId === c.id} />
      ))}
    </>
  )
}

function StaffInboxLine({ row, active }: { row: StaffConversationRow; active: boolean }) {
  const unread = row.unread
  const subtitle =
    row.startedBy === 'STAFF' && !row.accepted
      ? row.status === 'BLOCKED'
        ? 'Recusou a conversa'
        : 'Aguardando aceite'
      : `${row.lastFrom === 'STAFF' ? 'Equipe: ' : ''}${row.lastText}`
  return (
    <ListItem data-active={active}>
      <Row>
        <Portrait person={{ id: row.citizen.id, name: row.citizen.name, username: row.citizen.username, avatarUrl: row.citizen.avatarUrl, verified: false }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link
            to={`/conversas/pagina/${row.id}`}
            aria-label={unread > 0 ? `${row.citizen.name}, ${unread} ${unread === 1 ? 'mensagem não lida' : 'mensagens não lidas'}` : undefined}
          >
            <LineTop>
              <strong>{row.citizen.name}</strong>
              <Time $unread={unread > 0}>{conversationTime(row.lastMessageAt)}</Time>
            </LineTop>
            <LineBottom>
              <Muted style={unread > 0 ? { color: 'inherit', fontWeight: 600 } : undefined}>{subtitle}</Muted>
              {unread > 0 && <Badge aria-hidden="true">{conversationUnreadLabel(unread)}</Badge>}
            </LineBottom>
          </Link>
        </div>
      </Row>
    </ListItem>
  )
}

function PersonalConversations() {
  const scope = useConversationScope()
  const location = useLocation()
  const subpath = location.pathname.replace(/^\/conversas\/?/, '').replace(/\/+$/, '')
  const pageParts = subpath.split('/')
  const pageRoute =
    pageParts.length === 3 && pageParts[0] === 'pagina' && PAGE_TYPES.includes(pageParts[1] as OrgType)
      ? { orgType: pageParts[1] as OrgType, orgId: pageParts[2] }
      : undefined
  const create = subpath === 'nova'
  const blocked = subpath === 'bloqueios'
  const devices = subpath === 'aparelhos'
  const settings = subpath === 'configuracoes'
  const storage = subpath === 'armazenamento'
  const backup = subpath === 'backup'
  const id =
    subpath && !create && !blocked && !devices && !settings && !storage && !backup && !subpath.includes('/')
      ? subpath
      : undefined
  const sub = id || create || blocked || devices || settings || storage || backup || !!pageRoute
  const [params] = useSearchParams()
  const requests = params.get('solicitacoes') === '1' && !sub
  const capability = useConversationCapabilities()
  const pendingRequests = usePendingRequests(!!capability.data?.enabled)
  const deviceStatus = useChatDeviceStatus()
  const needsApproval = deviceStatus.data?.status === 'needs_approval'
  // Mantém a sessão cifrada aberta enquanto a pessoa navega em /conversas/* e
  // fecha tudo ao sair da área de conversas, trocar de conta ou entrar em contexto.
  useEffect(() => {
    if (!scope.user?.id || scope.activeContext) void closeWebChatSession()
    return () => {
      void closeWebChatSession()
    }
  }, [scope.user?.id, scope.activeContext])
  return (
    <>
      <Navbar />
      <Backdrop>
      <Shell data-split-layout>
        <Sidebar $hiddenOnMobile={!!sub}>
          <Header>
            <Link to={requests ? '/conversas' : '/'} aria-label={requests ? 'Voltar às conversas' : 'Voltar'}>
              <ArrowLeft size={20} />
            </Link>
            <h1>{requests ? 'Solicitações' : 'Conversas'}</h1>
            {!requests && <RequestsLink pending={pendingRequests} />}
            {capability.data?.enabled && (
              <Link to="/conversas/configuracoes" aria-label="Configurações de conversas">
                <GearSix size={20} />
              </Link>
            )}
            <Link to="/conversas/nova" aria-label="Nova conversa">
              <Plus size={20} weight="bold" />
            </Link>
          </Header>
          <ConversationGate allowWithoutChat>
            <ConversationInbox activeId={id} activePage={pageRoute} folder={requests ? 'requests' : 'active'} />
          </ConversationGate>
        </Sidebar>
        <Stage $hiddenOnMobile={!sub}>
          {sub && !pageRoute && (
            <Header>
              <Link to="/conversas" aria-label="Voltar às conversas">
                <ArrowLeft size={20} />
              </Link>
              <h1>
                {create
                  ? 'Nova conversa'
                  : id
                    ? 'Detalhes da conversa'
                    : devices
                      ? 'Aparelhos conectados'
                      : storage
                        ? 'Gerenciar armazenamento'
                        : backup
                          ? 'Backup e histórico'
                          : settings
                            ? 'Configurações de conversas'
                            : 'Pessoas bloqueadas'}
              </h1>
            </Header>
          )}
          <ConversationGate allowWithoutChat={!!pageRoute || !sub}>
            {pageRoute ? (
              <CitizenPagePane key={`${pageRoute.orgType}:${pageRoute.orgId}`} orgType={pageRoute.orgType} orgId={pageRoute.orgId} />
            ) : settings ? (
              <ConversationSettingsView />
            ) : devices ? (
              <ChatDevices />
            ) : storage ? (
              <ChatStorageManager />
            ) : backup ? (
              <ChatBackupPanel />
            ) : blocked ? (
              <BlockedPeople />
            ) : create ? (
              <CreateConversation />
            ) : id ? (
              <ConversationDetail key={id} id={id} />
            ) : needsApproval ? (
              <EmptyStage>
                <ConnectDeviceCard />
              </EmptyStage>
            ) : (
              <EmptyStage>
                <EmptyIcon>
                  <ChatCircle size={36} />
                </EmptyIcon>
                <h2>Suas conversas no Votz</h2>
                <p>Escolha uma conversa na lista ao lado ou comece uma nova com alguém da sua comunidade.</p>
                <Action as={Link} to="/conversas/nova" style={{ marginTop: 8 }}>
                  <Plus size={16} weight="bold" aria-hidden="true" />
                  Nova conversa
                </Action>
              </EmptyStage>
            )}
          </ConversationGate>
        </Stage>
      </Shell>
      </Backdrop>
    </>
  )
}
/** Quantidade de pedidos esperando resposta, para o aviso no ícone de Solicitações. */
function usePendingRequests(enabled: boolean): number {
  const scope = useConversationScope()
  const list = useConversationList('requests', enabled)
  return scope.enabled && enabled ? (list.data?.pages[0]?.total ?? 0) : 0
}
const PendingDot = styled.span`
  position: absolute;
  top: 2px;
  right: 0;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.white};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
`
/** Ícone de Solicitações no topo da lista (antes era uma aba). */
function RequestsLink({ pending }: { pending: number }) {
  return (
    <Link
      to="/conversas?solicitacoes=1"
      aria-label={pending ? `Solicitações de conversa, ${pending} ${pending === 1 ? 'pendente' : 'pendentes'}` : 'Solicitações de conversa'}
      title="Solicitações"
      style={{ position: 'relative' }}
    >
      <UserPlus size={20} />
      {pending > 0 && <PendingDot aria-hidden="true">{pending > 9 ? '9+' : pending}</PendingDot>}
    </Link>
  )
}
/** Uma conversa com página na lista unificada do cidadão. */
function PageInboxLine({ item }: { item: MyPageConversationRow }) {
  const unread = item.unread
  const pending = item.startedBy === 'STAFF' && !item.accepted
  const subtitle = pending
    ? 'Quer conversar com você'
    : `${item.lastFrom === 'CITIZEN' ? 'Você: ' : ''}${item.lastText}`
  return (
    <Link
      to={pageConversationPath(item.page.orgType, item.page.orgId)}
      aria-label={
        unread > 0
          ? `${item.page.name}, ${unread} ${unread === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`
          : undefined
      }
    >
      <LineTop>
        <strong>{item.page.name}</strong>
        <Time $unread={unread > 0}>{conversationTime(item.lastMessageAt)}</Time>
      </LineTop>
      <LineBottom>
        <Muted style={unread > 0 ? { color: 'inherit', fontWeight: 600 } : undefined}>{subtitle}</Muted>
        {unread > 0 && <Badge aria-hidden="true">{conversationUnreadLabel(unread)}</Badge>}
      </LineBottom>
    </Link>
  )
}

type UnifiedInboxItem =
  | { kind: 'chat'; sortAt: string; pinned: boolean; chat: ConversationSummary }
  | { kind: 'page'; sortAt: string; pinned: false; page: MyPageConversationRow }

function ConversationInbox({
  activeId,
  activePage,
  folder,
}: {
  activeId?: string
  activePage?: { orgType: OrgType; orgId: string }
  folder: 'active' | 'requests'
}) {
  const capability = useConversationCapabilities()
  const chatEnabled = !!capability.data?.enabled
  const list = useConversationList(folder, chatEnabled)
  const pageList = useMyPageConversationList(folder === 'active')
  const action = useConversationAction()
  const resetAction = action.reset
  useEffect(() => {
    resetAction()
  }, [folder, resetAction])
  const { user } = useConversationScope()
  const chatItems: UnifiedInboxItem[] = (list.data?.pages.flatMap((page) => page.items) ?? []).map((chat) => ({
    kind: 'chat',
    sortAt: chat.lastMessage?.at ?? chat.updatedAt,
    pinned: !!chat.pinnedAt,
    chat,
  }))
  const pageItems: UnifiedInboxItem[] =
    folder === 'active'
      ? (pageList.data?.pages.flatMap((page) => page.items) ?? [])
          .filter((p) => !(p.startedBy === 'STAFF' && !p.accepted && p.status === 'BLOCKED'))
          .map((page) => ({
            kind: 'page',
            sortAt: page.lastMessageAt,
            pinned: false,
            page,
          }))
      : []
  const items =
    folder === 'active'
      ? mergeInboxLists(
          [
            { items: chatItems, hasMore: chatEnabled && !!list.hasNextPage },
            { items: pageItems, hasMore: !!pageList.hasNextPage },
          ],
          (i) => i.sortAt,
          (i) => i.pinned,
        )
      : chatItems
  const loading = (chatEnabled && list.isPending) || (folder === 'active' && pageList.isPending)
  const hasMore = (chatEnabled && list.hasNextPage) || (folder === 'active' && pageList.hasNextPage)
  const fetchingMore = list.isFetchingNextPage || pageList.isFetchingNextPage
  return (
    <>
      {chatEnabled && list.isError && (
        <Failure
          error={list.error}
          retry={() => {
            void list.refetch()
          }}
        />
      )}
      {folder === 'active' && pageList.isError && (
        <Failure
          error={pageList.error}
          retry={() => {
            void pageList.refetch()
          }}
        />
      )}
      {action.isError && <Failure error={action.error} />}
      {loading && !items.length ? (
        <Section role="status">Carregando…</Section>
      ) : !items.length && !(chatEnabled && list.isError) && !(folder === 'active' && pageList.isError) ? (
        <Section>
          <h2>{folder === 'requests' ? 'Você está em dia' : 'Uma conversa pode aproximar'}</h2>
          <Muted>
            {folder === 'requests'
              ? 'Seus convites e solicitações aparecerão aqui.'
              : 'Encontre uma pessoa, um grupo ou uma página da sua comunidade.'}
          </Muted>
          {folder === 'active' && <Link to="/conversas/nova">Começar uma conversa</Link>}
        </Section>
      ) : null}
      {items.map((entry) => {
        if (entry.kind === 'page') {
          const p = entry.page
          const active = activePage?.orgType === p.page.orgType && activePage?.orgId === p.page.orgId
          return (
            <ListItem key={`page:${p.id}`} data-active={active}>
              <Row>
                <Portrait
                  person={{ id: p.page.orgId, name: p.page.name, username: p.page.username, avatarUrl: p.page.avatarUrl, verified: false }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <PageInboxLine item={p} />
                </div>
              </Row>
            </ListItem>
          )
        }
        const item = entry.chat
        return (
          <ListItem key={item.id} data-active={activeId === item.id}>
            <Row>
              <Portrait
                group={item.kind === 'GROUP'}
                person={item.members.find((m) => m.user.id !== user!.id)?.user}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                {folder === 'active' ? (
                  <InboxLine item={item} userId={user!.id} />
                ) : (
                  <>
                    <strong>{conversationTitle(item, user!.id)}</strong>
                    <Muted>
                      {item.invitedBy?.name || 'Uma pessoa'}{' '}
                      {item.kind === 'GROUP'
                        ? 'convidou você para um grupo'
                        : 'quer conversar com você'}
                      .
                    </Muted>
                  </>
                )}
              </div>
            </Row>
            {folder === 'requests' && (
              <Buttons>
                <Action
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({ path: `/${item.id}/respond`, body: { accept: true } })
                  }
                >
                  Aceitar
                </Action>
                <Action
                  $secondary
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({ path: `/${item.id}/respond`, body: { accept: false } })
                  }
                >
                  Recusar
                </Action>
              </Buttons>
            )}
          </ListItem>
        )
      })}
      {hasMore && (
        <Section>
          <Action
            $secondary
            disabled={fetchingMore}
            onClick={() => {
              if (chatEnabled && list.hasNextPage) void list.fetchNextPage()
              if (folder === 'active' && pageList.hasNextPage) void pageList.fetchNextPage()
            }}
          >
            Carregar mais
          </Action>
        </Section>
      )}
    </>
  )
}
function ChatDevices() {
  const list = useChatDevices()
  const action = useChatDeviceAction()
  const [codeInput, setCodeInput] = useState('')
  const [codeMessage, setCodeMessage] = useState('')
  const devices = list.data?.devices || []
  const links = list.data?.links || []
  // 401 aqui significa que ESTE navegador ainda não ativou as conversas.
  const notActivated = isAxiosError(list.error) && list.error.response?.status === 401
  function approveByCode(event: FormEvent) {
    event.preventDefault()
    const parsed = parseDeviceLinkQr(codeInput)
    if (!parsed) {
      setCodeMessage('Digite os 6 dígitos mostrados no outro aparelho.')
      return
    }
    setCodeMessage('')
    action.mutate(
      { type: 'approve-code', code: parsed.code, linkId: parsed.linkId },
      {
        onSuccess: () => {
          setCodeInput('')
          setCodeMessage('Aparelho permitido com sucesso.')
        },
      },
    )
  }
  function revoke(device: ChatDeviceInfo) {
    const message = device.current
      ? 'Sair das conversas neste navegador? Ele deixa de receber mensagens e você perde o acesso ao histórico dele. Para voltar, abra uma conversa de novo; se você usa outros aparelhos, será preciso permitir este acesso.'
      : `Desconectar ${deviceName(device)}? Esse aparelho deixa de receber mensagens novas. Mensagens que ele já recebeu continuam nele.`
    if (window.confirm(message))
      action.mutate(
        { type: 'revoke', id: device.id },
        {
          onSuccess: () => {
            if (device.current) void closeWebChatSession()
          },
        },
      )
  }
  return (
    <Page>
      <Panel>
        <h2>Aparelhos conectados</h2>
        <Muted>
          Você pode usar suas conversas em até 5 aparelhos, como celular e
          navegador. Desconecte os que não usa mais.
        </Muted>
      </Panel>
      {notActivated && (
        <Panel role="status">
          <strong>Abra uma conversa primeiro</strong>
          <Muted>
            Seus aparelhos aparecem aqui depois que você abrir qualquer
            conversa neste navegador.
          </Muted>
          <div style={{ marginTop: 12 }}>
            <Action as={Link} to="/conversas">
              {ENROLL_WAITING.bannerAction}
            </Action>
          </div>
        </Panel>
      )}
      {list.isSuccess && (
        <Panel>
          <strong>{ENROLL_WAITING.enterCodeTitle}</strong>
          <Muted>{ENROLL_WAITING.enterCodeHint}</Muted>
          <form
            onSubmit={approveByCode}
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginTop: 10,
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Código de 6 dígitos"
              placeholder="000 000"
              maxLength={7}
              value={codeInput}
              onChange={(event) => {
                setCodeInput(event.target.value)
                if (codeMessage) setCodeMessage('')
              }}
              style={{
                width: 150,
                height: 40,
                padding: '0 12px',
                borderRadius: 10,
                border: '1px solid #d1d5db',
                fontSize: 16,
                letterSpacing: 3,
                fontFamily: 'monospace',
              }}
            />
            <Action
              type="submit"
              disabled={action.isPending || !parseDeviceLinkQr(codeInput)}
            >
              {ENROLL_WAITING.enterCodeAction}
            </Action>
          </form>
          {codeMessage && (
            <Muted role="status" style={{ marginTop: 8 }}>
              {codeMessage}
            </Muted>
          )}
        </Panel>
      )}
      {list.isError && !notActivated && (
        <Failure card
          error={list.error}
          retry={() => {
            void list.refetch()
          }}
        />
      )}
      {action.isError && <Failure card error={action.error} />}
      {list.isPending && <Panel role="status">Carregando…</Panel>}
      {(links.length > 0 || devices.length > 0) && (
        <Panel $flush>
      {links.map((link) => {
        const request = deviceRequestText(link)
        return (
          <ListItem key={link.id} role="alert">
            <strong>{request.title}</strong>
            <Muted>{request.text}</Muted>
            <Row>
              <Action
                disabled={action.isPending}
                onClick={() => action.mutate({ type: 'approve', id: link.id })}
              >
                {request.allow}
              </Action>
              <Action
                $secondary
                disabled={action.isPending}
                onClick={() => action.mutate({ type: 'deny', id: link.id })}
              >
                {request.deny}
              </Action>
            </Row>
          </ListItem>
        )
      })}
      {devices.map((device) => (
        <ListItem key={device.id}>
          <Row>
            <Face aria-hidden="true">
              {device.platform === 'web' ? <Monitor size={22} /> : <DeviceMobile size={22} />}
            </Face>
            <span style={{ flex: 1 }}>
              <strong>
                {deviceName(device)}
                {device.current ? ' · Este aparelho' : ''}
              </strong>
              <Muted>
                Conectado em {new Date(device.createdAt).toLocaleDateString('pt-BR')}
              </Muted>
            </span>
            <TextAction
              disabled={action.isPending}
              onClick={() => revoke(device)}
            >
              {device.current ? 'Sair' : 'Desconectar'}
            </TextAction>
          </Row>
        </ListItem>
      ))}
        </Panel>
      )}
      {list.isSuccess && !devices.length && (
        <Panel>Nenhum aparelho conectado.</Panel>
      )}
    </Page>
  )
}
/** Barra de uso do espaço: verde enquanto sobra, vermelho quando acaba. */
const UsageBar = styled.div<{ $percent: number; $level: 'ok' | 'near' | 'full' }>`
  height: 10px;
  margin: 12px 0 8px;
  border-radius: 5px;
  background: ${({ theme }) => theme.colors.neutral};
  overflow: hidden;
  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${({ $percent }) => $percent}%;
    border-radius: 5px;
    background: ${({ theme, $level }) =>
      $level === 'ok' ? theme.colors.positive : theme.colors.action};
  }
`
function ChatStorageManager() {
  const user = useAuthStore((state) => state.user)
  const [sort, setSort] = useState<'size' | 'date'>('size')
  const [picked, setPicked] = useState<string[]>([])
  const list = useChatStorage(sort)
  const remove = useDeleteChatStorage()
  const conversations = useConversationList('active')
  const titles = new Map(
    (conversations.data?.pages.flatMap((page) => page.items) || []).map((item) => [
      item.id,
      user ? conversationTitle(item, user.id) : 'Conversa',
    ]),
  )
  const usage = list.data?.pages[0]?.usage
  const view = usage ? chatStorageView(usage) : null
  const items = list.data?.pages.flatMap((page) => page.items) || []
  // 401 aqui significa que ESTE navegador ainda não ativou as conversas.
  const notActivated = isAxiosError(list.error) && list.error.response?.status === 401
  const chosenBytes = items
    .filter((item) => picked.includes(item.id))
    .reduce((total, item) => total + item.sizeBytes, 0)
  function toggle(id: string) {
    setPicked((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }
  function eraseChosen() {
    if (!picked.length || !window.confirm(chatStorageDeleteConfirm(picked.length))) return
    remove.mutate(picked, { onSuccess: () => setPicked([]) })
  }
  return (
    <Page>
      <Panel>
        <h2>Gerenciar armazenamento</h2>
        <Muted>{chatStorageView({ usedBytes: 0, limitBytes: 1, nearLimit: false }).help}</Muted>
        {view && usage && (
          <div role="status">
            <UsageBar
              $percent={view.percent}
              $level={view.level}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={view.percent}
              aria-label="Espaço usado"
            />
            <strong>{view.summary}</strong>
            {view.hint && <Muted>{view.hint}</Muted>}
          </div>
        )}
        <Row style={{ marginTop: 8 }}>
          <Action $secondary disabled title={view?.upgrade.soon}>
            {view?.upgrade.label ?? 'Aumentar espaço'} · {view?.upgrade.soon ?? 'Em breve'}
          </Action>
        </Row>
      </Panel>
      {notActivated && (
        <Panel role="status">
          <strong>Abra uma conversa primeiro</strong>
          <Muted>Seus arquivos aparecem aqui depois que você abrir qualquer conversa neste navegador.</Muted>
        </Panel>
      )}
      {list.isError && !notActivated && (
        <Failure card error={list.error} retry={() => void list.refetch()} />
      )}
      {remove.isError && <Failure card error={remove.error} />}
      {list.isPending && <Panel role="status">Carregando…</Panel>}
      {list.isSuccess && (
        <Panel $flush>
          <ListItem>
            <Row>
              <span style={{ flex: 1 }}>
                <strong>{picked.length ? `${picked.length} selecionado(s) · ${formatStorageSize(chosenBytes)}` : 'Seus arquivos'}</strong>
              </span>
              <TextAction
                onClick={() => {
                  setSort(sort === 'size' ? 'date' : 'size')
                  setPicked([])
                }}
              >
                {sort === 'size' ? 'Maiores primeiro' : 'Mais novos primeiro'}
              </TextAction>
              <TextAction disabled={!picked.length || remove.isPending} onClick={eraseChosen}>
                Apagar
              </TextAction>
            </Row>
          </ListItem>
          {items.map((item) => (
            <ListItem key={item.id}>
              <Row as="label">
                <input
                  type="checkbox"
                  checked={picked.includes(item.id)}
                  onChange={() => toggle(item.id)}
                  aria-label={`Selecionar ${STORAGE_KIND_LABEL[item.kind]} de ${new Date(item.createdAt).toLocaleDateString('pt-BR')}`}
                />
                <span style={{ flex: 1 }}>
                  <strong>
                    {STORAGE_KIND_LABEL[item.kind]} · {formatStorageSize(item.sizeBytes)}
                  </strong>
                  <Muted>
                    {titles.get(item.conversationId) || 'Conversa'} ·{' '}
                    {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                  </Muted>
                </span>
              </Row>
            </ListItem>
          ))}
          {!items.length && <ListItem>{view?.empty ?? 'Você ainda não enviou nenhum arquivo.'}</ListItem>}
          {list.hasNextPage && (
            <ListItem>
              <Action $secondary disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                {list.isFetchingNextPage ? 'Carregando…' : 'Mostrar mais'}
              </Action>
            </ListItem>
          )}
        </Panel>
      )}
    </Page>
  )
}
function BlockedPeople() {
  const list = useConversationBlocks()
  const action = useConversationAction()
  const items = list.data?.pages.flatMap((page) => page.items) || []
  return (
    <Page>
      <Panel>
        <h2>Pessoas bloqueadas</h2>
        <Muted>Você pode permitir novas interações ao desbloquear uma pessoa.</Muted>
      </Panel>
      {list.isError && (
        <Failure card
          error={list.error}
          retry={() => {
            void list.refetch()
          }}
        />
      )}
      {action.isError && <Failure card error={action.error} />}
      {list.isPending && <Panel role="status">Carregando…</Panel>}
      {list.isSuccess && !items.length && <Panel>Nenhuma pessoa bloqueada.</Panel>}
      {items.length > 0 && (
        <Panel $flush>
      {items.map((item) => (
        <ListItem key={item.blockedId}>
          <Row>
            <Portrait person={item.blocked} />
            <div style={{ flex: 1 }}>
              <strong>{item.blocked.name}</strong>
              {item.blocked.username && <Muted>@{item.blocked.username}</Muted>}
            </div>
            <TextAction
              disabled={action.isPending}
              onClick={() => {
                if (window.confirm(`Desbloquear ${item.blocked.name}?`))
                  action.mutate({ path: `/blocks/${item.blockedId}`, method: 'DELETE' })
              }}
            >
              Desbloquear
            </TextAction>
          </Row>
        </ListItem>
      ))}
        </Panel>
      )}
      {list.hasNextPage && (
        <Panel>
          <Action
            $secondary
            disabled={list.isFetchingNextPage}
            onClick={() => {
              void list.fetchNextPage()
            }}
          >
            Carregar mais
          </Action>
        </Panel>
      )}
    </Page>
  )
}
function PersonPicker({
  selected,
  onChange,
  onPick,
  exclude = [],
}: {
  selected: ConversationPerson[]
  onChange: (people: ConversationPerson[]) => void
  /** Conversa individual: escolher a pessoa já abre a conversa, sem botão. */
  onPick?: (person: ConversationPerson) => void
  exclude?: string[]
}) {
  const [search, setSearch] = useState('')
  const contacts = useConversationContacts(search)
  const navigate = useNavigate()
  // Conversa individual: a tela começa por quem a pessoa segue (pessoas, seguidores e páginas).
  const start = useConversationStartOptions(!!onPick)
  const term = search.trim()
  const typing = term.length >= 2
  const match = (name: string, username: string | null) =>
    !typing || name.toLowerCase().includes(term.toLowerCase()) || (username ?? '').toLowerCase().includes(term.replace(/^@/, '').toLowerCase())
  const following = (start.data?.following ?? []).filter((p) => !exclude.includes(p.id) && match(p.name, p.username))
  const followers = (start.data?.followers ?? []).filter((p) => !exclude.includes(p.id) && match(p.name, p.username))
  const pages = (start.data?.pages ?? []).filter((p) => match(p.name, p.username))
  const personRow = (person: ConversationPerson) => (
    <ListItem key={person.id}>
      <RowButton
        role="button"
        tabIndex={0}
        aria-label={`Conversar com ${person.name}`}
        onClick={() => onPick?.(person)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onPick?.(person)
          }
        }}
      >
        <Row>
          <Portrait person={person} />
          <div style={{ flex: 1 }}>
            <strong>{person.name}</strong>
            {person.username && <Muted>@{person.username}</Muted>}
          </div>
        </Row>
      </RowButton>
    </ListItem>
  )
  return (
    <div>
      <VisuallyHidden htmlFor="conversation-person-search">Buscar pessoas</VisuallyHidden>
      <SearchPill>
        <MagnifyingGlass size={20} aria-hidden="true" />
        <input
          id="conversation-person-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxLength={60}
          placeholder="Nome ou @usuário"
          autoComplete="off"
        />
      </SearchPill>
      {selected.length > 0 && (
        <Buttons>
          {selected.map((person) => (
            <Action
              key={person.id}
              $secondary
              type="button"
              aria-label={`Remover ${person.name}`}
              onClick={() => onChange(selected.filter((p) => p.id !== person.id))}
            >
              {person.name} ×
            </Action>
          ))}
        </Buttons>
      )}
      {contacts.isFetching && <Muted role="status">Buscando…</Muted>}
      {contacts.isError && (
        <Failure
          error={contacts.error}
          retry={() => {
            void contacts.refetch()
          }}
        />
      )}
      {onPick && following.length > 0 && (
        <section aria-label="Quem você segue">
          <Muted>Quem você segue</Muted>
          {following.map(personRow)}
        </section>
      )}
      {onPick && followers.length > 0 && (
        <section aria-label="Seguidores">
          <Muted>Seguidores</Muted>
          {followers.map(personRow)}
        </section>
      )}
      {onPick && pages.length > 0 && (
        <section aria-label="Páginas que você segue">
          <Muted>Páginas que você segue</Muted>
          {pages.map((page) => (
            <ListItem key={`${page.orgType}:${page.orgId}`}>
              <RowButton
                role="button"
                tabIndex={0}
                aria-label={`Enviar mensagem para a página ${page.name}`}
                onClick={() => navigate(pageConversationPath(page.orgType, page.orgId))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    navigate(pageConversationPath(page.orgType, page.orgId))
                  }
                }}
              >
                <Row>
                  <Portrait person={{ id: page.orgId, name: page.name, username: page.username, avatarUrl: page.avatarUrl, verified: false }} />
                  <div style={{ flex: 1 }}>
                    <strong>{page.name}</strong>
                    {page.username && <Muted>@{page.username}</Muted>}
                  </div>
                </Row>
              </RowButton>
            </ListItem>
          ))}
        </section>
      )}
      {!typing && !onPick && <Muted>Digite pelo menos 2 letras do nome ou do @usuário.</Muted>}
      {!typing && onPick && start.isSuccess && !following.length && !followers.length && !pages.length && (
        <Muted>Você ainda não segue ninguém. Digite pelo menos 2 letras do nome ou do @usuário para buscar.</Muted>
      )}
      {typing && !!onPick && <Muted>Mais pessoas do Votz</Muted>}
      {contacts.data
        ?.filter((person) => !exclude.includes(person.id))
        .map((person) => {
          const row = (
            <Row>
              <Portrait person={person} />
              <div style={{ flex: 1 }}>
                <strong>{person.name}</strong>
                {person.username && <Muted>@{person.username}</Muted>}
              </div>
              {!onPick && (
                <Action
                  type="button"
                  $secondary
                  disabled={selected.some((p) => p.id === person.id) || selected.length >= 99}
                  onClick={() => onChange([...selected, person])}
                >
                  {selected.some((p) => p.id === person.id) ? 'Selecionado' : 'Selecionar'}
                </Action>
              )}
            </Row>
          )
          return onPick ? (
            <ListItem key={person.id}>
              <RowButton
                role="button"
                tabIndex={0}
                aria-label={`Conversar com ${person.name}`}
                onClick={() => onPick(person)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onPick(person)
                  }
                }}
              >
                {row}
              </RowButton>
            </ListItem>
          ) : (
            <ListItem key={person.id}>{row}</ListItem>
          )
        })}
      {contacts.isSuccess && !contacts.data.length && <Muted>Nenhuma pessoa encontrada.</Muted>}
    </div>
  )
}
function CreateConversation() {
  const [group, setGroup] = useState(false)
  const [title, setTitle] = useState('')
  const [people, setPeople] = useState<ConversationPerson[]>([])
  const submission = useRef<{ signature: string; id: string } | null>(null)
  const action = useCreateConversationGroup()
  const navigate = useNavigate()
  const actorId = useConversationScope().user!.id
  async function submit(event?: FormEvent, chosen: ConversationPerson[] = people) {
    event?.preventDefault()
    if (action.isPending || !chosen.length || (group && !title.trim())) return
    const signature = JSON.stringify([title.trim(), chosen.map((p) => p.id).sort()])
    if (!submission.current || submission.current.signature !== signature)
      submission.current = { signature, id: crypto.randomUUID() }
    try {
      const result = group
        ? await action.create({
            clientRequestId: submission.current.id,
            title: title.trim(),
            memberIds: chosen.map((p) => p.id),
          })
        : await action.mutateAsync({ path: '/direct', body: { targetUserId: chosen[0].id } })
      if (currentConversationActorId() === actorId)
        navigate(`/conversas/${result.id}`, { replace: true })
    } catch {
      /* Mutation renders its error without clearing the draft or retry key. */
    }
  }
  return (
    <Page>
    <Panel>
      <TabRow role="tablist" aria-label="Tipo de conversa">
        <button
          role="tab"
          aria-selected={!group}
          onClick={() => {
            setGroup(false)
            setPeople([])
            action.reset()
          }}
        >
          Uma pessoa
        </button>
        <button
          role="tab"
          aria-selected={group}
          onClick={() => {
            setGroup(true)
            setPeople([])
            action.reset()
          }}
        >
          Criar grupo
        </button>
      </TabRow>
      <form onSubmit={submit}>
        <fieldset disabled={action.isPending} style={{ border: 0, padding: '20px 0', minWidth: 0 }}>
          {group && (
            <>
              <label htmlFor="conversation-title">Nome do grupo</label>
              <Field
                id="conversation-title"
                value={title}
                maxLength={100}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex.: Comunidade do Centro"
                required
              />
            </>
          )}
          <PersonPicker
            selected={people}
            onChange={(value) => setPeople(group ? value : value.slice(-1))}
            onPick={
              group
                ? undefined
                : (person) => {
                    setPeople([person])
                    void submit(undefined, [person])
                  }
            }
          />
          <Muted>
            {group
              ? 'As pessoas recebem um convite e escolhem se querem participar.'
              : 'Clique em uma pessoa para conversar. Ela receberá uma solicitação de conversa.'}
          </Muted>
          {group && (
            <Buttons>
              <Action
                type="submit"
                disabled={!people.length || !title.trim() || action.isPending}
              >
                {action.isPending ? 'Preparando…' : 'Criar grupo'}
              </Action>
            </Buttons>
          )}
        </fieldset>
      </form>
      {action.isError && <Failure error={action.error} />}
    </Panel>
    </Page>
  )
}
// Check the current identity after async mutations, never navigate into a prior user's result.
function currentConversationActorId() {
  const state = useAuthStore.getState()
  return state.activeContext ? undefined : state.user?.id
}

function ConversationDetail({ id }: { id: string }) {
  const capabilities = useConversationCapabilities()
  const showDetails = new URLSearchParams(useLocation().search).get('detalhes') === '1'
  const detail = useConversation(id)
  const action = useConversationAction()
  const navigate = useNavigate()
  const [inviting, setInviting] = useState(false)
  const [people, setPeople] = useState<ConversationPerson[]>([])
  const [showMute, setShowMute] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [reportReason, setReportReason] = useState<ConversationReportReason>('OFFENSIVE')
  const [reportDetails, setReportDetails] = useState('')
  const [reportSent, setReportSent] = useState(false)
  const { user } = useConversationScope()
  if (detail.isPending) return <Panel role="status">Carregando conversa…</Panel>
  if (detail.isError)
    return (
      <Failure
        error={detail.error}
        retry={() => {
          void detail.refetch()
        }}
      />
    )
  const conversation = detail.data
  const canOpenChat =
    !conversation.archivedAt &&
    capabilities.data?.messagingEnabled &&
    !showDetails &&
    (conversation.kind === 'GROUP'
      ? conversation.members.some((member) => member.user.id === user!.id && member.state === 'ACTIVE')
      : conversation.members.every((member) => member.state === 'ACTIVE'))
  if (canOpenChat) return <ChatPane key={`${user!.id}:${id}`} conversation={conversation} />
  const owner = conversation.myRole === 'OWNER'
  const admin = owner || conversation.myRole === 'ADMIN'
  const closed = !!conversation.archivedAt
  async function run(
    path: string,
    body?: unknown,
    method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
    leave = false,
  ) {
    try {
      await action.mutateAsync({ path, body, method })
      if (currentConversationActorId() !== user!.id) return
      if (leave) navigate('/conversas', { replace: true })
      setInviting(false)
      setPeople([])
    } catch {
      /* Keep context and show API authorization failures. */
    }
  }
  const other = conversation.members.find((member) => member.user.id !== user!.id)?.user
  return (
    <Page>
      <Hero>
        <HeroFace aria-hidden="true">
          {conversation.kind === 'GROUP' ? (
            <Users size={44} />
          ) : other?.avatarUrl ? (
            <img src={other.avatarUrl} alt="" />
          ) : (
            other?.name.charAt(0).toUpperCase()
          )}
        </HeroFace>
        <h2>{conversationTitle(conversation, user!.id)}</h2>
        <Muted>
          {closed
            ? 'Grupo encerrado'
            : conversation.kind === 'GROUP'
              ? conversationMemberLabel(conversation.memberCount)
              : 'Conversa pessoal'}
        </Muted>
      </Hero>
      <Notice>
        <ShieldCheck size={23} />
        <span>
          {closed
            ? 'Este grupo foi encerrado. Não é possível convidar ou alterar participantes.'
            : 'Mensagens nesta conversa são protegidas de ponta a ponta.'}
        </span>
      </Notice>
      {action.isError && <Failure card error={action.error} />}
      {conversation.kind === 'GROUP' && (
      <Panel>
        <h2>Participantes</h2>
        {conversation.members.map((member) => (
          <ListItem key={member.user.id}>
            <Row>
              <Portrait person={member.user} />
              <div style={{ flex: 1 }}>
                <strong>
                  {member.user.name}
                  {member.user.id === user!.id ? ' (você)' : ''}
                </strong>
                <Muted>
                  {member.state === 'INVITED'
                    ? 'Convite pendente'
                    : member.role === 'OWNER'
                      ? 'Responsável pelo grupo'
                      : member.role === 'ADMIN'
                        ? 'Administrador'
                        : 'Participante'}
                </Muted>
              </div>
            </Row>
            {!closed && conversation.kind === 'GROUP' && member.user.id !== user!.id && (
              <Buttons>
                {owner && member.state === 'ACTIVE' && (
                  <>
                    <Action
                      $secondary
                      disabled={action.isPending}
                      onClick={() => {
                        void run(
                          `/${id}/members/${member.user.id}/role`,
                          { role: member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN' },
                          'PATCH',
                        )
                      }}
                    >
                      {member.role === 'ADMIN' ? 'Retirar administração' : 'Tornar administrador'}
                    </Action>
                    <Action
                      $secondary
                      disabled={action.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Transferir a responsabilidade do grupo para ${member.user.name}?`,
                          )
                        )
                          void run(`/${id}/owner/${member.user.id}`)
                      }}
                    >
                      Transferir grupo
                    </Action>
                  </>
                )}
                {admin && member.role !== 'OWNER' && (owner || member.role !== 'ADMIN') && (
                  <Action
                    $secondary
                    disabled={action.isPending}
                    onClick={() => {
                      if (window.confirm(`Remover ${member.user.name} do grupo?`))
                        void run(`/${id}/members/${member.user.id}`, undefined, 'DELETE')
                    }}
                  >
                    Remover
                  </Action>
                )}
              </Buttons>
            )}
          </ListItem>
        ))}
      </Panel>
      )}
      {!closed && (
        <Panel style={{ padding: '8px 0' }}>
          <ActionList>
            {conversation.kind === 'GROUP' && admin && (
              <Action $secondary onClick={() => setInviting(!inviting)}>
                <UserPlus size={22} aria-hidden="true" />
                Convidar pessoas
              </Action>
            )}
            {conversation.kind === 'GROUP' && !owner && (
              <Action
                $secondary
                data-danger
                disabled={action.isPending}
                onClick={() => {
                  if (window.confirm('Sair deste grupo?'))
                    void run(`/${id}/leave`, undefined, 'POST', true)
                }}
              >
                <SignOut size={22} aria-hidden="true" />
                Sair do grupo
              </Action>
            )}
            {conversation.kind === 'GROUP' && owner && (
              <Action
                $secondary
                data-danger
                disabled={action.isPending}
                onClick={() => {
                  if (window.confirm('Encerrar este grupo? Esta ação não pode ser desfeita.'))
                    void run(`/${id}/archive`)
                }}
              >
                <XCircle size={22} aria-hidden="true" />
                Encerrar grupo
              </Action>
            )}
            {conversation.kind === 'DIRECT' && other && (
              <Action
                $secondary
                data-danger
                disabled={action.isPending}
                onClick={() => {
                  if (window.confirm(`Bloquear novas interações com ${other.name}?`))
                    void run(`/blocks/${other.id}`, undefined, 'POST', true)
                }}
              >
                <Prohibit size={22} aria-hidden="true" />
                Bloquear pessoa
              </Action>
            )}
            <Action
              $secondary
              disabled={action.isPending}
              onClick={() => {
                void run(`/${id}/pin`, { pinned: !conversation.pinnedAt }, 'PATCH')
              }}
            >
              <PushPin size={22} aria-hidden="true" />
              {conversation.pinnedAt ? 'Desafixar conversa' : 'Fixar no topo'}
            </Action>
            {conversationIsMuted(conversation.mutedUntil) ? (
              <Action
                $secondary
                disabled={action.isPending}
                onClick={() => {
                  void run(`/${id}/mute`, { duration: 'off' as ConversationMuteDuration }, 'PATCH')
                }}
              >
                <Bell size={22} aria-hidden="true" />
                Ativar notificações
              </Action>
            ) : (
              <Action
                $secondary
                disabled={action.isPending}
                onClick={() => {
                  setShowMute((value) => !value)
                  setShowReport(false)
                }}
              >
                <BellSlash size={22} aria-hidden="true" />
                Silenciar notificações
              </Action>
            )}
            <Action
              $secondary
              data-danger
              disabled={action.isPending}
              onClick={() => {
                setShowReport((value) => !value)
                setShowMute(false)
                setReportSent(false)
              }}
            >
              <Flag size={22} aria-hidden="true" />
              Denunciar conversa
            </Action>
          </ActionList>
          {showMute && (
            <div style={{ marginTop: 16 }}>
              <Muted>Por quanto tempo silenciar as notificações desta conversa?</Muted>
              <Buttons style={{ marginTop: 10 }}>
                {(
                  [
                    ['8h', '8 horas'],
                    ['1w', '1 semana'],
                    ['forever', 'Sempre'],
                  ] as [ConversationMuteDuration, string][]
                ).map(([duration, label]) => (
                  <Action
                    key={duration}
                    $secondary
                    disabled={action.isPending}
                    onClick={() => {
                      setShowMute(false)
                      void run(`/${id}/mute`, { duration }, 'PATCH')
                    }}
                  >
                    {label}
                  </Action>
                ))}
              </Buttons>
            </div>
          )}
          {showReport && (
            <form
              style={{ marginTop: 16, display: 'grid', gap: 10 }}
              onSubmit={(event) => {
                event.preventDefault()
                void action
                  .mutateAsync({
                    path: `/${id}/report`,
                    method: 'POST',
                    body: {
                      reason: reportReason,
                      details: reportDetails.trim() || undefined,
                    },
                  })
                  .then(() => {
                    setReportSent(true)
                    setShowReport(false)
                    setReportDetails('')
                  })
                  .catch(() => {})
              }}
            >
              <label htmlFor="conversation-report-reason">Motivo da denúncia</label>
              <select
                id="conversation-report-reason"
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value as ConversationReportReason)}
                style={{ minHeight: 42, padding: '8px 12px', borderRadius: 12 }}
              >
                {CONVERSATION_REPORT_REASONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Field
                aria-label="Detalhes da denúncia (opcional)"
                placeholder="Descreva o que aconteceu (opcional)"
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value)}
                maxLength={500}
              />
              <Buttons>
                <Action type="submit" disabled={action.isPending}>
                  Enviar denúncia
                </Action>
                <Action $secondary type="button" onClick={() => setShowReport(false)}>
                  Cancelar
                </Action>
              </Buttons>
            </form>
          )}
          {reportSent && (
            <Notice role="status" style={{ marginTop: 14 }}>
              Denúncia enviada para análise.
            </Notice>
          )}
          {inviting && (
            <div style={{ marginTop: 24 }}>
              <PersonPicker
                selected={people}
                onChange={(value) => setPeople(value.slice(0, 20))}
                exclude={conversation.members.map((m) => m.user.id)}
              />
              <Buttons>
                <Action
                  disabled={!people.length || action.isPending}
                  onClick={() => {
                    void run(`/${id}/invitations`, { memberIds: people.map((p) => p.id) })
                  }}
                >
                  Enviar convites
                </Action>
              </Buttons>
            </div>
          )}
        </Panel>
      )}
    </Page>
  )
}
