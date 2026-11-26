import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export type OrgType = 'ENTITY' | 'POLITICIAN' | 'COMPANY'

export type OrgPermissionKey =
  | 'RESPOND_REPORTS'
  | 'ASSIGN_REPORTS'
  | 'MANAGE_MEMBERS'
  | 'MANAGE_PROFILE'
  | 'VIEW_ANALYTICS'
  | 'EXPORT_DATA'
  | 'MANAGE_BRANCHES'
  | 'MANAGE_BILLING'
  | 'READ_MESSAGES'
  | 'REPLY_MESSAGES'
  | 'MANAGE_ADS'
  | 'VIEW_ADS'

export interface OrgRole {
  id: string
  name: string
  permissions: OrgPermissionKey[]
  isDefault: boolean
  orgType: OrgType
  orgId: string
}

export interface OrgMember {
  id: string
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED'
  createdAt: string
  user: { id: string; name: string; email: string; avatarUrl: string | null }
  role: { id: string; name: string; permissions: OrgPermissionKey[]; isDefault?: boolean }
}

export interface PendingInvite {
  id: string
  orgType: OrgType
  orgId: string
  email: string
  roleId: string
  token: string
  expiresAt: string
  createdAt: string
  role: { id: string; name: string; permissions: OrgPermissionKey[]; isDefault: boolean }
}

export interface TeamSummary {
  plan: string
  maxMembers: number | null
  activeMembers: number
  suspendedMembers: number
  pendingInvites: number
  usedSlots: number
  availableSlots: number | null
}

// ── Labels e metadados de cargos/permissões ─────────────────────────────────

export const DEFAULT_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Proprietário',
  Proprietário: 'Proprietário',
  MANAGER: 'Gestor',
  Gestor: 'Gestor',
  AGENT: 'Atendente',
  Atendente: 'Atendente',
  VIEWER: 'Visualizador',
  Visualizador: 'Visualizador',
}

export function formatRoleName(name: string): string {
  return DEFAULT_ROLE_LABELS[name] ?? name
}

export function isOwnerRoleName(name?: string | null): boolean {
  return name === 'OWNER' || name === 'Proprietário'
}

export interface PermissionMeta {
  key: OrgPermissionKey
  label: string
  description: string
  group: 'Atendimento' | 'Mensagens' | 'Análise' | 'Anúncios' | 'Administração'
  orgTypes?: OrgType[]
}

export const PERMISSION_CATALOG: PermissionMeta[] = [
  {
    key: 'RESPOND_REPORTS',
    label: 'Responder relatos',
    description: 'Publicar respostas oficiais e atualizar o status de relatos.',
    group: 'Atendimento',
  },
  {
    key: 'ASSIGN_REPORTS',
    label: 'Atribuir relatos',
    description: 'Distribuir relatos e prazos entre membros da equipe.',
    group: 'Atendimento',
  },
  {
    key: 'READ_MESSAGES',
    label: 'Ler mensagens',
    description: 'Visualizar conversas recebidas na caixa da página.',
    group: 'Mensagens',
  },
  {
    key: 'REPLY_MESSAGES',
    label: 'Responder mensagens',
    description: 'Enviar respostas aos cidadãos em nome da página.',
    group: 'Mensagens',
  },
  {
    key: 'VIEW_ANALYTICS',
    label: 'Ver painel de dados',
    description: 'Acessar indicadores, relatórios e métricas da página.',
    group: 'Análise',
  },
  {
    key: 'EXPORT_DATA',
    label: 'Exportar dados',
    description: 'Baixar planilhas e relatórios de desempenho e atendimento.',
    group: 'Análise',
  },
  {
    key: 'VIEW_ADS',
    label: 'Ver anúncios',
    description: 'Acompanhar campanhas, resultados e faturamento de anúncios.',
    group: 'Anúncios',
    orgTypes: ['COMPANY'],
  },
  {
    key: 'MANAGE_ADS',
    label: 'Gerenciar anúncios',
    description: 'Criar, editar, pausar campanhas e recarregar saldo.',
    group: 'Anúncios',
    orgTypes: ['COMPANY'],
  },
  {
    key: 'MANAGE_PROFILE',
    label: 'Editar perfil',
    description: 'Alterar foto, bio, @usuário, contatos e canais ligados.',
    group: 'Administração',
  },
  {
    key: 'MANAGE_MEMBERS',
    label: 'Gerenciar equipe',
    description: 'Convidar, suspender, remover membros e gerenciar cargos.',
    group: 'Administração',
  },
  {
    key: 'MANAGE_BRANCHES',
    label: 'Gerenciar filiais',
    description: 'Adicionar e configurar unidades ou filiais vinculadas.',
    group: 'Administração',
    orgTypes: ['COMPANY', 'ENTITY'],
  },
  {
    key: 'MANAGE_BILLING',
    label: 'Gerenciar assinatura',
    description: 'Alterar plano, forma de pagamento e dados de cobrança.',
    group: 'Administração',
  },
]

export const PERM_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_CATALOG.map((item) => [item.key, item.label]),
)

export function permissionsForOrgType(orgType: OrgType): PermissionMeta[] {
  return PERMISSION_CATALOG.filter((p) => !p.orgTypes || p.orgTypes.includes(orgType))
}

export function extractApiError(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  if (Array.isArray(msg)) return msg[0] ?? fallback
  return msg ?? fallback
}

// ── Queries ─────────────────────────────────────────────────────────────────

export function useTeamSummary(orgType: OrgType, orgId: string, enabled = true) {
  return useQuery<TeamSummary>({
    queryKey: ['org-team-summary', orgType, orgId],
    queryFn: () => api.get(`/org-memberships/${orgType}/${orgId}/summary`).then((r) => r.data),
    enabled: enabled && !!orgId,
    retry: false,
  })
}

export function useOrgRoles(orgType: OrgType, orgId: string, enabled = true) {
  return useQuery<OrgRole[]>({
    queryKey: ['org-roles', orgType, orgId],
    queryFn: () => api.get(`/org-memberships/${orgType}/${orgId}/roles`).then((r) => r.data),
    enabled: enabled && !!orgId,
    retry: false,
  })
}

export function useOrgMembers(orgType: OrgType, orgId: string, enabled = true) {
  return useQuery<OrgMember[]>({
    queryKey: ['org-members', orgType, orgId],
    queryFn: () => api.get(`/org-memberships/${orgType}/${orgId}/members`).then((r) => r.data),
    enabled: enabled && !!orgId,
    retry: false,
  })
}

export function usePendingInvites(orgType: OrgType, orgId: string, enabled = true) {
  return useQuery<PendingInvite[]>({
    queryKey: ['org-invites', orgType, orgId],
    queryFn: () => api.get(`/org-memberships/${orgType}/${orgId}/invites`).then((r) => r.data),
    enabled: enabled && !!orgId,
    retry: false,
  })
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useInviteMember(orgType: OrgType, orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { email: string; roleId: string }) =>
      api.post('/org-memberships/invites', { orgType, orgId, ...data }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', orgType, orgId] })
      qc.invalidateQueries({ queryKey: ['org-invites', orgType, orgId] })
      qc.invalidateQueries({ queryKey: ['org-team-summary', orgType, orgId] })
    },
  })
}

export function useResendInvite(orgType: OrgType, orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (inviteId: string) =>
      api.post(`/org-memberships/${orgType}/${orgId}/invites/${inviteId}/resend`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-invites', orgType, orgId] })
    },
  })
}

export function useCancelInvite(orgType: OrgType, orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (inviteId: string) =>
      api.delete(`/org-memberships/${orgType}/${orgId}/invites/${inviteId}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-invites', orgType, orgId] })
      qc.invalidateQueries({ queryKey: ['org-team-summary', orgType, orgId] })
    },
  })
}

export function useUpdateMemberRole(orgType: OrgType, orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      api.patch(`/org-memberships/${orgType}/${orgId}/members/${userId}/role`, { roleId }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-members', orgType, orgId] }),
  })
}

export function useUpdateMemberStatus(orgType: OrgType, orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'ACTIVE' | 'SUSPENDED' }) =>
      api.patch(`/org-memberships/${orgType}/${orgId}/members/${userId}/status`, { status }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', orgType, orgId] })
      qc.invalidateQueries({ queryKey: ['org-team-summary', orgType, orgId] })
    },
  })
}

export function useRemoveMember(orgType: OrgType, orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/org-memberships/${orgType}/${orgId}/members/${userId}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', orgType, orgId] })
      qc.invalidateQueries({ queryKey: ['org-team-summary', orgType, orgId] })
    },
  })
}

export function useCreateOrgRole(orgType: OrgType, orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; permissions: OrgPermissionKey[] }) =>
      api.post('/org-memberships/roles', { orgType, orgId, ...data }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-roles', orgType, orgId] }),
  })
}

export function useUpdateOrgRole(orgType: OrgType, orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ roleId, ...data }: { roleId: string; name?: string; permissions?: OrgPermissionKey[] }) =>
      api.patch(`/org-memberships/${orgType}/${orgId}/roles/${roleId}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-roles', orgType, orgId] })
      qc.invalidateQueries({ queryKey: ['org-members', orgType, orgId] })
    },
  })
}

export function useDeleteOrgRole(orgType: OrgType, orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (roleId: string) =>
      api.delete(`/org-memberships/${orgType}/${orgId}/roles/${roleId}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-roles', orgType, orgId] }),
  })
}
