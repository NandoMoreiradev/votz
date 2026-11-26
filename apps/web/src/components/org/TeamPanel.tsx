import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import * as Dialog from '@radix-ui/react-dialog'
import {
  ArrowClockwise,
  Check,
  CheckCircle,
  Copy,
  EnvelopeSimple,
  Key,
  PauseCircle,
  PencilSimple,
  PlayCircle,
  Plus,
  ShieldCheck,
  Trash,
  UserPlus,
  UsersThree,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import {
  extractApiError,
  formatRoleName,
  isOwnerRoleName,
  PERM_LABELS,
  permissionsForOrgType,
  useCancelInvite,
  useCreateOrgRole,
  useDeleteOrgRole,
  useInviteMember,
  useOrgMembers,
  useOrgRoles,
  usePendingInvites,
  useRemoveMember,
  useResendInvite,
  useTeamSummary,
  useUpdateMemberRole,
  useUpdateMemberStatus,
  useUpdateOrgRole,
  type OrgMember,
  type OrgPermissionKey,
  type OrgRole,
  type OrgType,
  type PendingInvite,
} from '../../hooks/useOrgMemberships'
import {
  Callout,
  CtaButton,
  DarkButton,
  DataTable,
  Drawer,
  EmptyState,
  FilterChip,
  FilterRow,
  GhostButton,
  IconButton,
  Muted,
  Panel,
  PanelBody,
  PanelHead,
  SearchInput,
  Skeleton,
  Stack,
  StatusPill,
  Tab,
  TabBar,
  TableScroll,
  Toolbar,
} from '../studio/studio-ui'

// ── Styled ──────────────────────────────────────────────────────────────────

const MemberCell = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 200px;
`

const Avatar = styled.span<{ $src: string | null }>`
  width: 34px;
  height: 34px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : theme.colors.primary)};
  color: ${({ theme }) => theme.colors.white};
  display: grid;
  place-items: center;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
`

const MemberName = styled.div`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.875rem;
  line-height: 1.3;
`

const MemberEmail = styled.div`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
`

const RoleSelect = styled.select`
  height: 32px;
  padding: 0 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: inherit;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`

const RoleBadge = styled.span<{ $owner?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  background: ${({ $owner, theme }) => ($owner ? `${theme.colors.primary}14` : theme.colors.neutral)};
  color: ${({ $owner, theme }) => ($owner ? theme.colors.primary : theme.colors.text)};
`

const ActionsRow = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
`

const RoleGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
`

const RoleCard = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 14px 16px;
  background: ${({ theme }) => theme.colors.white};
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const RoleCardHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;

  strong {
    display: block;
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: 0.9375rem;
    color: ${({ theme }) => theme.colors.text};
  }
  small {
    display: block;
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.muted};
    margin-top: 2px;
  }
`

const PermChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`

const PermChip = styled.span`
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.neutral};
  color: ${({ theme }) => theme.colors.text};
  border: 1px solid ${({ theme }) => theme.colors.border};
`

const FormField = styled.div`
  margin-bottom: 16px;

  label {
    display: block;
    font-size: 0.8125rem;
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
    color: ${({ theme }) => theme.colors.text};
    margin-bottom: 6px;
  }
`

const TextInput = styled.input`
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font: inherit;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary}1A;
  }
`

const SelectInput = styled.select`
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font: inherit;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  box-sizing: border-box;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const PermGroupTitle = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${({ theme }) => theme.colors.muted};
  margin: 14px 0 6px;
`

const PermCheckLabel = styled.label<{ $disabled?: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.white};
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  margin-bottom: 6px;

  input {
    margin-top: 2px;
    accent-color: ${({ theme }) => theme.colors.primary};
  }
  strong {
    display: block;
    font-size: 0.8125rem;
    color: ${({ theme }) => theme.colors.text};
  }
  small {
    display: block;
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.muted};
    line-height: 1.4;
  }
`

const DrawerFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const ModalOverlay = styled(Dialog.Overlay)`
  position: fixed;
  inset: 0;
  z-index: 1050;
  background: rgba(13, 13, 13, 0.45);
`

const ModalBox = styled(Dialog.Content)`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1051;
  width: min(440px, calc(100vw - 32px));
  background: ${({ theme }) => theme.colors.white};
  border-radius: ${({ theme }) => theme.radii.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  padding: 20px 22px;

  &:focus { outline: none; }
`

const ModalHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
`

const ModalTitle = styled(Dialog.Title)`
  margin: 0;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.0625rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const ModalDesc = styled(Dialog.Description)`
  margin: 0 0 18px;
  font-size: 0.875rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.muted};
`

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`

const DangerButton = styled(CtaButton)`
  background: ${({ theme }) => theme.colors.action};
`

// ── Helpers ─────────────────────────────────────────────────────────────────

const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

type TeamTab = 'members' | 'invites' | 'roles'
type StatusFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED'

interface ConfirmState {
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}

export interface TeamPanelProps {
  orgType: OrgType
  orgId: string
  currentUserId: string
  currentUserPermissions: string[]
  inviteOpen?: boolean
  onInviteOpenChange?: (open: boolean) => void
  roleDrawerOpen?: boolean
  onRoleDrawerOpenChange?: (open: boolean) => void
}

// ── Component ───────────────────────────────────────────────────────────────

export function TeamPanel({
  orgType,
  orgId,
  currentUserId,
  currentUserPermissions,
  inviteOpen: controlledInviteOpen,
  onInviteOpenChange,
  roleDrawerOpen: controlledRoleOpen,
  onRoleDrawerOpenChange,
}: TeamPanelProps) {
  const canManage = currentUserPermissions.includes('MANAGE_MEMBERS')

  const { data: members, isLoading: loadingMembers, isError: membersError } = useOrgMembers(orgType, orgId, canManage)
  const { data: roles, isLoading: loadingRoles } = useOrgRoles(orgType, orgId, canManage)
  const { data: invites, isLoading: loadingInvites } = usePendingInvites(orgType, orgId, canManage)
  const { data: summary } = useTeamSummary(orgType, orgId, canManage)

  const inviteMember = useInviteMember(orgType, orgId)
  const resendInvite = useResendInvite(orgType, orgId)
  const cancelInvite = useCancelInvite(orgType, orgId)
  const updateRole = useUpdateMemberRole(orgType, orgId)
  const updateStatus = useUpdateMemberStatus(orgType, orgId)
  const removeMember = useRemoveMember(orgType, orgId)
  const createOrgRole = useCreateOrgRole(orgType, orgId)
  const updateOrgRole = useUpdateOrgRole(orgType, orgId)
  const deleteOrgRole = useDeleteOrgRole(orgType, orgId)

  const [tab, setTab] = useState<TeamTab>('members')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [feedback, setFeedback] = useState<{ tone: 'positive' | 'action' | 'info'; message: string } | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  // Invite Drawer state
  const [localInviteOpen, setLocalInviteOpen] = useState(false)
  const inviteOpen = controlledInviteOpen ?? localInviteOpen
  const setInviteOpen = (next: boolean) => {
    setLocalInviteOpen(next)
    onInviteOpenChange?.(next)
  }
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRoleId, setInviteRoleId] = useState('')
  const [inviteError, setInviteError] = useState('')

  // Role Drawer state (create or edit)
  const [localRoleOpen, setLocalRoleOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<OrgRole | null>(null)
  const roleOpen = (controlledRoleOpen ?? localRoleOpen) || !!editingRole
  const setRoleOpen = (next: boolean) => {
    setLocalRoleOpen(next)
    onRoleDrawerOpenChange?.(next)
    if (!next) setEditingRole(null)
  }
  const [roleName, setRoleName] = useState('')
  const [rolePerms, setRolePerms] = useState<OrgPermissionKey[]>([])
  const [roleError, setRoleError] = useState('')

  const myMembership = useMemo(
    () => members?.find((m) => m.user.id === currentUserId),
    [members, currentUserId],
  )
  const amIOwner = isOwnerRoleName(myMembership?.role.name)
  const myPermSet = useMemo(() => new Set(currentUserPermissions), [currentUserPermissions])

  const assignableRoles = useMemo(() => {
    if (!roles) return []
    return roles.filter((r) => {
      if (amIOwner) return true
      if (isOwnerRoleName(r.name)) return false
      return r.permissions.every((p) => myPermSet.has(p))
    })
  }, [roles, amIOwner, myPermSet])

  const filteredMembers = useMemo(() => {
    if (!members) return []
    const q = search.trim().toLowerCase()
    return members.filter((m) => {
      if (statusFilter !== 'ALL' && m.status !== statusFilter) return false
      if (!q) return true
      return (
        m.user.name.toLowerCase().includes(q) ||
        m.user.email.toLowerCase().includes(q) ||
        formatRoleName(m.role.name).toLowerCase().includes(q)
      )
    })
  }, [members, search, statusFilter])

  const memberCountByRole = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of members ?? []) {
      counts.set(m.role.id, (counts.get(m.role.id) ?? 0) + 1)
    }
    return counts
  }, [members])

  const orgPermissions = useMemo(() => permissionsForOrgType(orgType), [orgType])
  const groupedPermissions = useMemo(() => {
    const map = new Map<string, typeof orgPermissions>()
    for (const perm of orgPermissions) {
      const list = map.get(perm.group) ?? []
      list.push(perm)
      map.set(perm.group, list)
    }
    return Array.from(map.entries())
  }, [orgPermissions])

  // Fallback for members without MANAGE_MEMBERS — never render a blank screen
  if (!canManage || membersError) {
    return (
      <Panel>
        <PanelHead
          title="Seu acesso nesta página"
          hint="Você pode ver o que está liberado para o seu perfil."
        />
        <PanelBody>
          <Callout tone="info" icon={ShieldCheck} role="note">
            Apenas <strong>Proprietários</strong> ou <strong>Gestores</strong> com permissão de gerenciar equipe podem convidar ou alterar membros.
          </Callout>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: 8 }}>Suas permissões ativas</div>
            <PermChips>
              {currentUserPermissions.length > 0 ? (
                currentUserPermissions.map((p) => (
                  <PermChip key={p}>{PERM_LABELS[p] ?? p}</PermChip>
                ))
              ) : (
                <Muted style={{ fontSize: '0.8125rem' }}>Nenhuma permissão adicional configurada.</Muted>
              )}
            </PermChips>
          </div>
        </PanelBody>
      </Panel>
    )
  }

  const seatsFull = summary?.availableSlots === 0

  function openNewRole() {
    setEditingRole(null)
    setRoleName('')
    setRolePerms(['VIEW_ANALYTICS'])
    setRoleError('')
    setRoleOpen(true)
  }

  function openEditRole(role: OrgRole) {
    setEditingRole(role)
    setRoleName(role.name)
    setRolePerms([...role.permissions])
    setRoleError('')
    setRoleOpen(true)
  }

  function togglePerm(key: OrgPermissionKey) {
    setRolePerms((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    )
  }

  async function copyInviteLink(invite: PendingInvite) {
    const url = `${window.location.origin}/convite/${invite.token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(invite.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setFeedback({ tone: 'info', message: `Link do convite: ${url}` })
    }
  }

  function handleInviteSubmit(e: FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim() || !inviteRoleId) return
    setInviteError('')
    inviteMember.mutate(
      { email: inviteEmail.trim(), roleId: inviteRoleId },
      {
        onSuccess: () => {
          setInviteOpen(false)
          setInviteEmail('')
          setInviteRoleId('')
          setTab('invites')
          setFeedback({
            tone: 'positive',
            message: `Convite enviado para ${inviteEmail.trim().toLowerCase()}. O link vale por 7 dias.`,
          })
        },
        onError: (err) => {
          setInviteError(extractApiError(err, 'Não foi possível enviar o convite.'))
        },
      },
    )
  }

  function handleRoleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = roleName.trim()
    if (!trimmed) {
      setRoleError('Informe um nome para o cargo.')
      return
    }
    setRoleError('')
    if (editingRole) {
      updateOrgRole.mutate(
        { roleId: editingRole.id, name: trimmed, permissions: rolePerms },
        {
          onSuccess: () => {
            setRoleOpen(false)
            setFeedback({ tone: 'positive', message: `Cargo "${trimmed}" atualizado.` })
          },
          onError: (err) => setRoleError(extractApiError(err, 'Não foi possível atualizar o cargo.')),
        },
      )
    } else {
      createOrgRole.mutate(
        { name: trimmed, permissions: rolePerms },
        {
          onSuccess: () => {
            setRoleOpen(false)
            setTab('roles')
            setFeedback({ tone: 'positive', message: `Cargo "${trimmed}" criado.` })
          },
          onError: (err) => setRoleError(extractApiError(err, 'Não foi possível criar o cargo.')),
        },
      )
    }
  }

  function handleRoleChange(member: OrgMember, roleId: string) {
    setFeedback(null)
    updateRole.mutate(
      { userId: member.user.id, roleId },
      {
        onSuccess: () => {
          const next = roles?.find((r) => r.id === roleId)
          setFeedback({
            tone: 'positive',
            message: `Cargo de ${member.user.name} alterado para ${formatRoleName(next?.name ?? '')}.`,
          })
        },
        onError: (err) => {
          setFeedback({ tone: 'action', message: extractApiError(err, 'Não foi possível alterar o cargo.') })
        },
      },
    )
  }

  function requestToggleStatus(member: OrgMember) {
    const nextStatus = member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    setConfirmState({
      title: nextStatus === 'SUSPENDED' ? `Suspender ${member.user.name}?` : `Reativar ${member.user.name}?`,
      description:
        nextStatus === 'SUSPENDED'
          ? 'O membro perderá acesso ao Estúdio imediatamente, mas seu histórico e cargo serão preservados.'
          : 'O membro voltará a ter acesso ao Estúdio com o cargo atual.',
      confirmLabel: nextStatus === 'SUSPENDED' ? 'Suspender acesso' : 'Reativar acesso',
      danger: nextStatus === 'SUSPENDED',
      onConfirm: () => {
        setConfirmState(null)
        updateStatus.mutate(
          { userId: member.user.id, status: nextStatus },
          {
            onSuccess: () =>
              setFeedback({
                tone: 'positive',
                message:
                  nextStatus === 'SUSPENDED'
                    ? `Acesso de ${member.user.name} suspenso.`
                    : `Acesso de ${member.user.name} reativado.`,
              }),
            onError: (err) =>
              setFeedback({ tone: 'action', message: extractApiError(err, 'Não foi possível alterar o status.') }),
          },
        )
      },
    })
  }

  function requestRemoveMember(member: OrgMember) {
    setConfirmState({
      title: `Remover ${member.user.name} da equipe?`,
      description:
        'Esta pessoa deixará de ter acesso à organização. Você poderá convidá-la novamente no futuro se precisar.',
      confirmLabel: 'Remover membro',
      danger: true,
      onConfirm: () => {
        setConfirmState(null)
        removeMember.mutate(member.user.id, {
          onSuccess: () =>
            setFeedback({ tone: 'positive', message: `${member.user.name} foi removido da equipe.` }),
          onError: (err) =>
            setFeedback({ tone: 'action', message: extractApiError(err, 'Não foi possível remover o membro.') }),
        })
      },
    })
  }

  function requestCancelInvite(invite: PendingInvite) {
    setConfirmState({
      title: 'Cancelar convite pendente?',
      description: `O link enviado para ${invite.email} deixará de funcionar imediatamente e a vaga do plano será liberada.`,
      confirmLabel: 'Cancelar convite',
      danger: true,
      onConfirm: () => {
        setConfirmState(null)
        cancelInvite.mutate(invite.id, {
          onSuccess: () =>
            setFeedback({ tone: 'positive', message: `Convite para ${invite.email} cancelado.` }),
          onError: (err) =>
            setFeedback({ tone: 'action', message: extractApiError(err, 'Não foi possível cancelar o convite.') }),
        })
      },
    })
  }

  function requestDeleteRole(role: OrgRole) {
    setConfirmState({
      title: `Excluir o cargo "${role.name}"?`,
      description: 'Esta ação não pode ser desfeita. Só é possível excluir cargos sem membros ou convites vinculados.',
      confirmLabel: 'Excluir cargo',
      danger: true,
      onConfirm: () => {
        setConfirmState(null)
        deleteOrgRole.mutate(role.id, {
          onSuccess: () => setFeedback({ tone: 'positive', message: `Cargo "${role.name}" excluído.` }),
          onError: (err) =>
            setFeedback({ tone: 'action', message: extractApiError(err, 'Não foi possível excluir o cargo.') }),
        })
      },
    })
  }

  const selectedInviteRole = roles?.find((r) => r.id === inviteRoleId)

  return (
    <Stack>
      {seatsFull && (
        <Callout tone="warning" icon={WarningCircle} role="note">
          <strong>Limite de assentos do plano atingido</strong> ({summary.usedSlots} de {summary.maxMembers}).
          Cancele um convite pendente, remova um membro ou{' '}
          <Link to="/estudio/planos" style={{ fontWeight: 600, textDecoration: 'underline' }}>
            faça upgrade do plano
          </Link>{' '}
          para convidar mais pessoas.
        </Callout>
      )}

      {feedback && (
        <Callout
          tone={feedback.tone}
          icon={feedback.tone === 'positive' ? CheckCircle : WarningCircle}
          role={feedback.tone === 'action' ? 'alert' : 'status'}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span>{feedback.message}</span>
            <IconButton aria-label="Fechar aviso" onClick={() => setFeedback(null)} style={{ width: 24, height: 24 }}>
              <X size={14} aria-hidden="true" />
            </IconButton>
          </div>
        </Callout>
      )}

      <Panel>
        <TabBar role="tablist" aria-label="Seções da equipe">
          <Tab
            active={tab === 'members'}
            onClick={() => setTab('members')}
            icon={UsersThree}
            count={members?.length}
          >
            Membros
          </Tab>
          <Tab
            active={tab === 'invites'}
            onClick={() => setTab('invites')}
            icon={EnvelopeSimple}
            count={invites?.length}
          >
            Convites pendentes
          </Tab>
          <Tab
            active={tab === 'roles'}
            onClick={() => setTab('roles')}
            icon={Key}
            count={roles?.length}
          >
            Cargos e permissões
          </Tab>
        </TabBar>

        {/* ── Aba Membros ── */}
        {tab === 'members' && (
          <>
            <Toolbar>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Buscar por nome, e-mail ou cargo…"
                label="Buscar membro"
              />
              <FilterRow>
                <FilterChip $active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')}>
                  Todos ({members?.length ?? 0})
                </FilterChip>
                <FilterChip $active={statusFilter === 'ACTIVE'} onClick={() => setStatusFilter('ACTIVE')}>
                  Ativos ({members?.filter((m) => m.status === 'ACTIVE').length ?? 0})
                </FilterChip>
                <FilterChip $active={statusFilter === 'SUSPENDED'} onClick={() => setStatusFilter('SUSPENDED')}>
                  Suspensos ({members?.filter((m) => m.status === 'SUSPENDED').length ?? 0})
                </FilterChip>
              </FilterRow>
            </Toolbar>

            {loadingMembers ? (
              <PanelBody>
                <Skeleton $h={160} />
              </PanelBody>
            ) : filteredMembers.length === 0 ? (
              <EmptyState
                icon={UsersThree}
                title={search || statusFilter !== 'ALL' ? 'Nenhum membro encontrado' : 'Nenhum membro ainda'}
                text={
                  search || statusFilter !== 'ALL'
                    ? 'Tente ajustar o termo de busca ou o filtro de status.'
                    : 'Convide alguém da sua equipe para ajudar a gerenciar esta página.'
                }
                action={
                  !search &&
                  statusFilter === 'ALL' && (
                    <CtaButton type="button" disabled={seatsFull} onClick={() => setInviteOpen(true)}>
                      <UserPlus size={16} weight="bold" aria-hidden="true" /> Convidar membro
                    </CtaButton>
                  )
                }
              />
            ) : (
              <TableScroll>
                <DataTable>
                  <thead>
                    <tr>
                      <th className="left">Membro</th>
                      <th className="left">Cargo</th>
                      <th className="left">Status</th>
                      <th className="left">Desde</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.map((m) => {
                      const isMe = m.user.id === currentUserId
                      const targetIsOwner = isOwnerRoleName(m.role.name)
                      const canEditTarget = !isMe && (!targetIsOwner || amIOwner)
                      return (
                        <tr key={m.id}>
                          <td className="left">
                            <MemberCell>
                              <Avatar $src={m.user.avatarUrl}>
                                {!m.user.avatarUrl && m.user.name.charAt(0).toUpperCase()}
                              </Avatar>
                              <div style={{ minWidth: 0 }}>
                                <MemberName>
                                  {m.user.name}
                                  {isMe && <Muted style={{ fontWeight: 400 }}> (você)</Muted>}
                                </MemberName>
                                <MemberEmail>{m.user.email}</MemberEmail>
                              </div>
                            </MemberCell>
                          </td>
                          <td className="left">
                            {canEditTarget && assignableRoles.length > 0 ? (
                              <RoleSelect
                                aria-label={`Cargo de ${m.user.name}`}
                                value={m.role.id}
                                disabled={updateRole.isPending}
                                onChange={(e) => handleRoleChange(m, e.target.value)}
                              >
                                {!assignableRoles.some((r) => r.id === m.role.id) && (
                                  <option value={m.role.id}>{formatRoleName(m.role.name)}</option>
                                )}
                                {assignableRoles.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {formatRoleName(r.name)}
                                  </option>
                                ))}
                              </RoleSelect>
                            ) : (
                              <RoleBadge $owner={targetIsOwner}>
                                {targetIsOwner && <ShieldCheck size={13} weight="fill" aria-hidden="true" />}
                                {formatRoleName(m.role.name)}
                              </RoleBadge>
                            )}
                          </td>
                          <td className="left">
                            <StatusPill $tone={m.status === 'ACTIVE' ? 'positive' : 'warning'}>
                              {m.status === 'ACTIVE' ? 'Ativo' : 'Suspenso'}
                            </StatusPill>
                          </td>
                          <td className="left dim">{formatShortDate(m.createdAt)}</td>
                          <td>
                            {canEditTarget ? (
                              <ActionsRow>
                                <IconButton
                                  type="button"
                                  title={m.status === 'ACTIVE' ? 'Suspender acesso' : 'Reativar acesso'}
                                  aria-label={m.status === 'ACTIVE' ? `Suspender ${m.user.name}` : `Reativar ${m.user.name}`}
                                  disabled={updateStatus.isPending}
                                  onClick={() => requestToggleStatus(m)}
                                >
                                  {m.status === 'ACTIVE' ? (
                                    <PauseCircle size={17} aria-hidden="true" />
                                  ) : (
                                    <PlayCircle size={17} aria-hidden="true" />
                                  )}
                                </IconButton>
                                <IconButton
                                  type="button"
                                  title="Remover da equipe"
                                  aria-label={`Remover ${m.user.name}`}
                                  disabled={removeMember.isPending}
                                  onClick={() => requestRemoveMember(m)}
                                >
                                  <Trash size={17} aria-hidden="true" />
                                </IconButton>
                              </ActionsRow>
                            ) : (
                              <Muted style={{ fontSize: '0.75rem' }}>—</Muted>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </DataTable>
              </TableScroll>
            )}
          </>
        )}

        {/* ── Aba Convites pendentes ── */}
        {tab === 'invites' && (
          loadingInvites ? (
            <PanelBody>
              <Skeleton $h={120} />
            </PanelBody>
          ) : !invites || invites.length === 0 ? (
            <EmptyState
              icon={EnvelopeSimple}
              title="Nenhum convite pendente"
              text="Quando você convidar alguém por e-mail, o convite aparece aqui até ser aceito ou expirar."
              action={
                <CtaButton type="button" disabled={seatsFull} onClick={() => setInviteOpen(true)}>
                  <UserPlus size={16} weight="bold" aria-hidden="true" /> Convidar membro
                </CtaButton>
              }
            />
          ) : (
            <TableScroll>
              <DataTable>
                <thead>
                  <tr>
                    <th className="left">E-mail convidado</th>
                    <th className="left">Cargo</th>
                    <th className="left">Enviado em</th>
                    <th className="left">Expira em</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((inv) => (
                    <tr key={inv.id}>
                      <td className="left" style={{ fontWeight: 600 }}>{inv.email}</td>
                      <td className="left">
                        <RoleBadge>{formatRoleName(inv.role.name)}</RoleBadge>
                      </td>
                      <td className="left dim">{formatShortDate(inv.createdAt)}</td>
                      <td className="left dim">{formatShortDate(inv.expiresAt)}</td>
                      <td>
                        <ActionsRow>
                          <IconButton
                            type="button"
                            title="Copiar link do convite"
                            aria-label={`Copiar link do convite para ${inv.email}`}
                            onClick={() => copyInviteLink(inv)}
                          >
                            {copiedId === inv.id ? (
                              <Check size={16} weight="bold" aria-hidden="true" />
                            ) : (
                              <Copy size={16} aria-hidden="true" />
                            )}
                          </IconButton>
                          <IconButton
                            type="button"
                            title="Reenviar e-mail e renovar prazo por 7 dias"
                            aria-label={`Reenviar convite para ${inv.email}`}
                            disabled={resendInvite.isPending}
                            onClick={() =>
                              resendInvite.mutate(inv.id, {
                                onSuccess: () =>
                                  setFeedback({
                                    tone: 'positive',
                                    message: `Convite reenviado para ${inv.email} (válido por mais 7 dias).`,
                                  }),
                                onError: (err) =>
                                  setFeedback({
                                    tone: 'action',
                                    message: extractApiError(err, 'Não foi possível reenviar o convite.'),
                                  }),
                              })
                            }
                          >
                            <ArrowClockwise size={16} aria-hidden="true" />
                          </IconButton>
                          <IconButton
                            type="button"
                            title="Cancelar convite e liberar vaga"
                            aria-label={`Cancelar convite para ${inv.email}`}
                            disabled={cancelInvite.isPending}
                            onClick={() => requestCancelInvite(inv)}
                          >
                            <Trash size={16} aria-hidden="true" />
                          </IconButton>
                        </ActionsRow>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </TableScroll>
          )
        )}

        {/* ── Aba Cargos e permissões ── */}
        {tab === 'roles' && (
          <PanelBody>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <Muted style={{ fontSize: '0.8125rem' }}>
                Cargos padrão vêm prontos. Crie cargos personalizados para limitar o acesso de cada área.
              </Muted>
              <GhostButton type="button" onClick={openNewRole}>
                <Plus size={15} weight="bold" aria-hidden="true" /> Novo cargo
              </GhostButton>
            </div>

            {loadingRoles ? (
              <Skeleton $h={160} />
            ) : (
              <RoleGrid>
                {(roles ?? []).map((role) => {
                  const count = memberCountByRole.get(role.id) ?? 0
                  return (
                    <RoleCard key={role.id}>
                      <RoleCardHead>
                        <div>
                          <strong>{formatRoleName(role.name)}</strong>
                          <small>
                            {role.isDefault ? 'Cargo padrão' : 'Personalizado'} · {count}{' '}
                            {count === 1 ? 'membro' : 'membros'}
                          </small>
                        </div>
                        {!role.isDefault && (
                          <ActionsRow>
                            <IconButton
                              type="button"
                              title="Editar cargo"
                              aria-label={`Editar cargo ${role.name}`}
                              onClick={() => openEditRole(role)}
                            >
                              <PencilSimple size={15} aria-hidden="true" />
                            </IconButton>
                            <IconButton
                              type="button"
                              title={count > 0 ? 'Remova os membros deste cargo antes de excluir' : 'Excluir cargo'}
                              aria-label={`Excluir cargo ${role.name}`}
                              disabled={count > 0 || deleteOrgRole.isPending}
                              onClick={() => requestDeleteRole(role)}
                            >
                              <Trash size={15} aria-hidden="true" />
                            </IconButton>
                          </ActionsRow>
                        )}
                      </RoleCardHead>
                      <PermChips>
                        {role.permissions.length > 0 ? (
                          role.permissions.map((p) => (
                            <PermChip key={p}>{PERM_LABELS[p] ?? p}</PermChip>
                          ))
                        ) : (
                          <Muted style={{ fontSize: '0.75rem' }}>Sem permissões atribuídas</Muted>
                        )}
                      </PermChips>
                    </RoleCard>
                  )
                })}
              </RoleGrid>
            )}
          </PanelBody>
        )}
      </Panel>

      {/* ── Gaveta: Convidar membro ── */}
      <Drawer
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false)
          setInviteError('')
        }}
        title="Convidar membro"
        subtitle="Enviaremos um link por e-mail válido por 7 dias."
      >
        <form onSubmit={handleInviteSubmit}>
          <FormField>
            <label htmlFor="invite-email">E-mail</label>
            <TextInput
              id="invite-email"
              type="email"
              required
              placeholder="nome@organizacao.com.br"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              autoFocus
            />
          </FormField>

          <FormField>
            <label htmlFor="invite-role">Cargo</label>
            <SelectInput
              id="invite-role"
              required
              value={inviteRoleId}
              onChange={(e) => setInviteRoleId(e.target.value)}
            >
              <option value="">Selecione um cargo…</option>
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatRoleName(r.name)}
                </option>
              ))}
            </SelectInput>
          </FormField>

          {selectedInviteRole && (
            <Panel style={{ marginBottom: 16 }}>
              <PanelHead
                title={`Permissões de ${formatRoleName(selectedInviteRole.name)}`}
                hint="O que esta pessoa poderá fazer assim que aceitar:"
              />
              <PanelBody>
                <PermChips>
                  {selectedInviteRole.permissions.map((p) => (
                    <PermChip key={p}>{PERM_LABELS[p] ?? p}</PermChip>
                  ))}
                </PermChips>
              </PanelBody>
            </Panel>
          )}

          {inviteError && (
            <div style={{ marginBottom: 14 }}>
              <Callout tone="action" icon={WarningCircle} role="alert">{inviteError}</Callout>
            </div>
          )}

          <DrawerFooter>
            <GhostButton type="button" onClick={() => setInviteOpen(false)}>Cancelar</GhostButton>
            <CtaButton
              type="submit"
              disabled={!inviteEmail.trim() || !inviteRoleId || inviteMember.isPending || seatsFull}
            >
              {inviteMember.isPending ? 'Enviando…' : 'Enviar convite'}
            </CtaButton>
          </DrawerFooter>
        </form>
      </Drawer>

      {/* ── Gaveta: Criar / Editar cargo personalizado ── */}
      <Drawer
        open={roleOpen}
        onClose={() => {
          setRoleOpen(false)
          setRoleError('')
        }}
        title={editingRole ? `Editar cargo: ${editingRole.name}` : 'Novo cargo personalizado'}
        subtitle="Escolha exatamente quais ações quem tiver este cargo poderá realizar."
      >
        <form onSubmit={handleRoleSubmit}>
          <FormField>
            <label htmlFor="role-name">Nome do cargo</label>
            <TextInput
              id="role-name"
              required
              maxLength={60}
              placeholder="Ex.: Assessoria de imprensa, Tráfego pago…"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              autoFocus
            />
          </FormField>

          {groupedPermissions.map(([group, items]) => (
            <div key={group}>
              <PermGroupTitle>{group}</PermGroupTitle>
              {items.map((perm) => {
                const allowed = amIOwner || myPermSet.has(perm.key)
                const checked = rolePerms.includes(perm.key)
                return (
                  <PermCheckLabel key={perm.key} $disabled={!allowed}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!allowed}
                      onChange={() => togglePerm(perm.key)}
                    />
                    <div>
                      <strong>{perm.label}</strong>
                      <small>
                        {perm.description}
                        {!allowed && ' (você não possui esta permissão)'}
                      </small>
                    </div>
                  </PermCheckLabel>
                )
              })}
            </div>
          ))}

          {roleError && (
            <div style={{ marginTop: 12 }}>
              <Callout tone="action" icon={WarningCircle} role="alert">{roleError}</Callout>
            </div>
          )}

          <DrawerFooter>
            <GhostButton type="button" onClick={() => setRoleOpen(false)}>Cancelar</GhostButton>
            <DarkButton
              type="submit"
              disabled={!roleName.trim() || createOrgRole.isPending || updateOrgRole.isPending}
            >
              {createOrgRole.isPending || updateOrgRole.isPending
                ? 'Salvando…'
                : editingRole
                  ? 'Salvar alterações'
                  : 'Criar cargo'}
            </DarkButton>
          </DrawerFooter>
        </form>
      </Drawer>

      {/* ── Modal de confirmação (Radix Dialog) ── */}
      <Dialog.Root open={!!confirmState} onOpenChange={(next) => { if (!next) setConfirmState(null) }}>
        <Dialog.Portal>
          <ModalOverlay />
          <ModalBox>
            {confirmState && (
              <>
                <ModalHead>
                  <ModalTitle>{confirmState.title}</ModalTitle>
                  <Dialog.Close asChild>
                    <IconButton aria-label="Fechar"><X size={16} aria-hidden="true" /></IconButton>
                  </Dialog.Close>
                </ModalHead>
                <ModalDesc>{confirmState.description}</ModalDesc>
                <ModalActions>
                  <GhostButton type="button" onClick={() => setConfirmState(null)}>Cancelar</GhostButton>
                  {confirmState.danger ? (
                    <DangerButton type="button" onClick={confirmState.onConfirm}>
                      {confirmState.confirmLabel}
                    </DangerButton>
                  ) : (
                    <DarkButton type="button" onClick={confirmState.onConfirm}>
                      {confirmState.confirmLabel}
                    </DarkButton>
                  )}
                </ModalActions>
              </>
            )}
          </ModalBox>
        </Dialog.Portal>
      </Dialog.Root>
    </Stack>
  )
}
