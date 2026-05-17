import { useState } from 'react'
import styled from 'styled-components'
import {
  OrgType,
  OrgMember,
  OrgRole,
  useOrgMembers,
  useOrgRoles,
  useInviteMember,
  useUpdateMemberRole,
  useRemoveMember,
} from '../../hooks/useOrgMemberships'

// ── Styled ──────────────────────────────────────────────────────────────────

const Panel = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 28px;
  margin-top: 24px;
`

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
`

const PanelTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const InviteBtn = styled.button`
  padding: 8px 18px;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  transition: opacity 0.15s;
  &:hover { opacity: 0.85; }
`

const MemberList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const MemberRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.neutral};
`

const Avatar = styled.div<{ $src: string | null }>`
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover` : theme.colors.border};
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.muted};
`

const MemberInfo = styled.div`
  flex: 1;
  min-width: 0;
`

const MemberName = styled.div`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.9375rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const MemberEmail = styled.div`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const RoleSelect = styled.select`
  padding: 5px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.text};
  background: #fff;
  cursor: pointer;
`

const RemoveBtn = styled.button`
  padding: 5px 10px;
  border: 1px solid ${({ theme }) => theme.colors.action};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: transparent;
  color: ${({ theme }) => theme.colors.action};
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.15s;
  &:hover { background: ${({ theme }) => theme.colors.action}; color: #fff; }
`

const PermChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
`

const Chip = styled.span`
  font-size: 0.6875rem;
  padding: 1px 6px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.03em;
`

const Empty = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  padding: 32px 0;
  font-size: 0.9375rem;
`

// ── Invite Modal ─────────────────────────────────────────────────────────────

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
`

const Modal = styled.div`
  background: #fff;
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 28px;
  width: 100%;
  max-width: 420px;
  box-shadow: ${({ theme }) => theme.shadows.lg};
`

const ModalTitle = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  margin-bottom: 20px;
  color: ${({ theme }) => theme.colors.text};
`

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const Input = styled.input`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: #fff;
  outline: none;
  box-sizing: border-box;
  margin-bottom: 16px;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`

const SelectFull = styled.select`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: #fff;
  outline: none;
  box-sizing: border-box;
  margin-bottom: 20px;
  cursor: pointer;
`

const ModalActions = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
`

const CancelBtn = styled.button`
  padding: 9px 18px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: transparent;
  font-size: 0.9rem;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.muted};
`

const ConfirmBtn = styled.button`
  padding: 9px 18px;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.action};
  font-size: 0.8125rem;
  margin-bottom: 12px;
`

const PERM_LABELS: Record<string, string> = {
  RESPOND_REPORTS: 'Responder',
  MANAGE_MEMBERS: 'Membros',
  MANAGE_PROFILE: 'Perfil',
  VIEW_ANALYTICS: 'Analytics',
  EXPORT_DATA: 'Exportar',
  MANAGE_BRANCHES: 'Filiais',
}

// ── Componente ───────────────────────────────────────────────────────────────

interface Props {
  orgType: OrgType
  orgId: string
  currentUserId: string
}

export function TeamPanel({ orgType, orgId, currentUserId }: Props) {
  const { data: members, isLoading, isError } = useOrgMembers(orgType, orgId)
  const { data: roles } = useOrgRoles(orgType, orgId)
  const inviteMember = useInviteMember(orgType, orgId)
  const updateRole = useUpdateMemberRole(orgType, orgId)
  const removeMember = useRemoveMember(orgType, orgId)

  const [showInvite, setShowInvite] = useState(false)
  const [email, setEmail] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [inviteError, setInviteError] = useState('')

  // If 403, user has no MANAGE_MEMBERS — don't render
  if (isError) return null

  function handleInvite() {
    if (!email || !selectedRoleId) return
    setInviteError('')
    inviteMember.mutate(
      { email, roleId: selectedRoleId },
      {
        onSuccess: () => {
          setShowInvite(false)
          setEmail('')
          setSelectedRoleId('')
        },
        onError: (e: any) => {
          setInviteError(e?.response?.data?.message ?? 'Erro ao enviar convite')
        },
      },
    )
  }

  function handleRoleChange(member: OrgMember, roleId: string) {
    updateRole.mutate({ userId: member.user.id, roleId })
  }

  function handleRemove(member: OrgMember) {
    if (!confirm(`Remover ${member.user.name} da equipe?`)) return
    removeMember.mutate(member.user.id)
  }

  return (
    <>
      <Panel>
        <PanelHeader>
          <PanelTitle>Equipe</PanelTitle>
          <InviteBtn onClick={() => setShowInvite(true)}>+ Convidar</InviteBtn>
        </PanelHeader>

        {isLoading ? (
          <Empty>Carregando membros...</Empty>
        ) : members && members.length > 0 ? (
          <MemberList>
            {members.map((m) => {
              const isMe = m.user.id === currentUserId
              const ownerRole = roles?.find((r) => r.name === 'Proprietário')
              const isOwner = m.role.id === ownerRole?.id
              return (
                <MemberRow key={m.id}>
                  <Avatar $src={m.user.avatarUrl}>
                    {!m.user.avatarUrl && m.user.name.charAt(0)}
                  </Avatar>
                  <MemberInfo>
                    <MemberName>
                      {m.user.name}
                      {isMe && <span style={{ color: '#6B7280', fontWeight: 400, fontSize: '0.8rem' }}> (você)</span>}
                    </MemberName>
                    <MemberEmail>{m.user.email}</MemberEmail>
                    <PermChips>
                      {m.role.permissions.map((p) => (
                        <Chip key={p}>{PERM_LABELS[p] ?? p}</Chip>
                      ))}
                    </PermChips>
                  </MemberInfo>

                  {!isOwner && !isMe && roles && (
                    <>
                      <RoleSelect
                        value={m.role.id}
                        onChange={(e) => handleRoleChange(m, e.target.value)}
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </RoleSelect>
                      <RemoveBtn onClick={() => handleRemove(m)}>Remover</RemoveBtn>
                    </>
                  )}

                  {isOwner && (
                    <Chip style={{ flexShrink: 0, fontSize: '0.75rem', padding: '4px 10px' }}>
                      Proprietário
                    </Chip>
                  )}
                </MemberRow>
              )
            })}
          </MemberList>
        ) : (
          <Empty>Nenhum membro ainda. Convide alguém para a equipe.</Empty>
        )}
      </Panel>

      {showInvite && (
        <Overlay onClick={() => setShowInvite(false)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Convidar para a equipe</ModalTitle>

            <Label>E-mail</Label>
            <Input
              type="email"
              placeholder="nome@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />

            <Label>Cargo / Permissões</Label>
            <SelectFull
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
            >
              <option value="">Selecione um cargo</option>
              {roles?.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </SelectFull>

            {inviteError && <ErrorMsg>{inviteError}</ErrorMsg>}

            <ModalActions>
              <CancelBtn onClick={() => setShowInvite(false)}>Cancelar</CancelBtn>
              <ConfirmBtn
                disabled={!email || !selectedRoleId || inviteMember.isPending}
                onClick={handleInvite}
              >
                {inviteMember.isPending ? 'Enviando...' : 'Enviar convite'}
              </ConfirmBtn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}
    </>
  )
}
