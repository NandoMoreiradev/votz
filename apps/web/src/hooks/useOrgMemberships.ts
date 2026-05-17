import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export type OrgType = 'ENTITY' | 'POLITICIAN' | 'COMPANY'

export interface OrgRole {
  id: string
  name: string
  permissions: string[]
  isDefault: boolean
  orgType: OrgType
  orgId: string
}

export interface OrgMember {
  id: string
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED'
  createdAt: string
  user: { id: string; name: string; email: string; avatarUrl: string | null }
  role: { id: string; name: string; permissions: string[] }
}

export function useOrgRoles(orgType: OrgType, orgId: string) {
  return useQuery<OrgRole[]>({
    queryKey: ['org-roles', orgType, orgId],
    queryFn: () => api.get(`/org-memberships/${orgType}/${orgId}/roles`).then((r) => r.data),
    retry: false,
  })
}

export function useOrgMembers(orgType: OrgType, orgId: string) {
  return useQuery<OrgMember[]>({
    queryKey: ['org-members', orgType, orgId],
    queryFn: () => api.get(`/org-memberships/${orgType}/${orgId}/members`).then((r) => r.data),
    retry: false,
  })
}

export function useInviteMember(orgType: OrgType, orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { email: string; roleId: string }) =>
      api.post('/org-memberships/invites', { orgType, orgId, ...data }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-members', orgType, orgId] }),
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

export function useRemoveMember(orgType: OrgType, orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/org-memberships/${orgType}/${orgId}/members/${userId}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-members', orgType, orgId] }),
  })
}
