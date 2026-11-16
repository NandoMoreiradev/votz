import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Category } from '@votz/shared-types'
import { extractPlanRequired } from './useAnalytics'
import { api } from '../lib/api'

export type SlaUrgencyFilter =
  | 'ALL'
  | 'BREACHED'
  | 'DUE_TODAY'
  | 'AT_RISK'
  | 'ON_TIME'
  | 'RESPONDED'
  | 'RESPONDED_ON_TIME'
  | 'RESPONDED_LATE'
  | 'NO_SLA'
export type SlaQueueSortBy = 'due_asc' | 'pressure_desc' | 'newest'
export type SlaStateValue = 'ON_TIME' | 'AT_RISK' | 'BREACHED' | 'MET' | 'MET_LATE'

export interface SlaMemberItem {
  userId: string
  name: string | null
  avatarUrl: string | null
  roleName: string
  canRespond: boolean
  canAssign: boolean
}

export interface SlaQueueItem {
  id: string
  title: string
  category: Category
  status: string
  neighborhood: string | null
  city: string | null
  state: string | null
  pressureScore: number
  createdAt: string
  firstResponseAt: string | null
  slaStartedAt: string | null
  slaDueAt: string | null
  slaState: SlaStateValue | null
  slaMetAt: string | null
  resolutionSlaDueAt: string | null
  resolutionSlaState: SlaStateValue | null
  isDueToday: boolean
  hoursRemaining: number | null
  hoursOverdue?: number | null
  hoursLate?: number | null
  assignment: {
    id: string
    assignedAt: string
    note: string | null
    assignee: {
      id: string
      name: string | null
      avatarUrl: string | null
    } | null
  } | null
}

export interface SlaQueueResponse {
  summary: {
    totalOpen: number
    breached: number
    dueToday: number
    atRisk: number
    onTime: number
    responded: number
    respondedOnTime: number
    respondedLate: number
    noSla: number
    unassigned: number
    mine: number
  }
  items: SlaQueueItem[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface SlaWorkloadResponse {
  unassignedCount: number
  members: Array<{
    userId: string
    name: string | null
    avatarUrl: string | null
    roleName: string
    totalAssigned: number
    breached: number
    atRisk: number
    dueToday: number
    onTime: number
  }>
}

export interface SlaPolicyResponse {
  entityId: string
  legalName: string
  hasOwnSla: boolean
  slaHours: Record<string, number>
  resolutionSlaHours: Record<string, number>
  defaultSlaHoursByCategory: Record<string, number>
  slaEscalationHours: number
  autoMonthlyReportEnabled: boolean
}

export interface SlaPerformanceResponse {
  definitionVersion: string
  timezone: string
  hasOwnSla: boolean
  period: { from: string; to: string }
  summary: {
    slaMet: number
    slaBreached: number
    evaluated: number
    complianceRate: { value: number | null; numerator: number; denominator: number }
    firstResponseMedianH: number | null
  }
  byCategory: Array<{
    category: string
    declaredHours: number
    isDefaultPolicy: boolean
    medianResponseHours: number | null
    slaMet: number
    slaBreached: number
    complianceRate: { value: number | null; numerator: number; denominator: number }
  }>
  monthlyEvolution: Array<{
    month: string
    createdCount: number
    slaMet: number
    slaBreached: number
    complianceRate: { value: number | null; numerator: number; denominator: number }
  }>
}

export interface SlaQueueQueryParams {
  urgency?: SlaUrgencyFilter
  category?: Category | ''
  assignee?: string
  neighborhood?: string
  sortBy?: SlaQueueSortBy
  page?: number
  limit?: number
}

export function useSlaQueue(params: SlaQueueQueryParams, enabled = true) {
  return useQuery<SlaQueueResponse>({
    queryKey: ['sla', 'queue', params],
    queryFn: async () => {
      const clean: Record<string, string | number> = {}
      if (params.urgency) clean.urgency = params.urgency
      if (params.category) clean.category = params.category
      if (params.assignee) clean.assignee = params.assignee
      if (params.neighborhood) clean.neighborhood = params.neighborhood
      if (params.sortBy) clean.sortBy = params.sortBy
      if (params.page) clean.page = params.page
      if (params.limit) clean.limit = params.limit
      const { data } = await api.get<SlaQueueResponse>('/sla/queue', { params: clean })
      return data
    },
    enabled,
    retry: (count, err) => (extractPlanRequired(err) ? false : count < 1),
  })
}

export function useSlaMembers(enabled = true) {
  return useQuery<SlaMemberItem[]>({
    queryKey: ['sla', 'members'],
    queryFn: async () => {
      const { data } = await api.get<SlaMemberItem[]>('/sla/members')
      return data
    },
    enabled,
    retry: false,
  })
}

export function useSlaWorkload(enabled = true) {
  return useQuery<SlaWorkloadResponse>({
    queryKey: ['sla', 'workload'],
    queryFn: async () => {
      const { data } = await api.get<SlaWorkloadResponse>('/sla/workload')
      return data
    },
    enabled,
    retry: false,
  })
}

export function useSlaPolicy(enabled = true) {
  return useQuery<SlaPolicyResponse>({
    queryKey: ['sla', 'policy'],
    queryFn: async () => {
      const { data } = await api.get<SlaPolicyResponse>('/sla/policy')
      return data
    },
    enabled,
    retry: (count, err) => (extractPlanRequired(err) ? false : count < 1),
  })
}

export function useSlaPerformance(params: { from?: string; to?: string; category?: Category | '' }, enabled = true) {
  return useQuery<SlaPerformanceResponse>({
    queryKey: ['sla', 'performance', params],
    queryFn: async () => {
      const clean: Record<string, string> = {}
      if (params.from) clean.from = params.from
      if (params.to) clean.to = params.to
      if (params.category) clean.category = params.category
      const { data } = await api.get<SlaPerformanceResponse>('/sla/performance', { params: clean })
      return data
    },
    enabled,
    retry: false,
  })
}

export function useAssignReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { reportId: string; assigneeUserId: string | null; note?: string }) => {
      const { data } = await api.post(`/sla/reports/${vars.reportId}/assign`, {
        assigneeUserId: vars.assigneeUserId,
        ...(vars.note ? { note: vars.note } : {}),
      })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sla'] })
    },
  })
}

export function useUpdateSlaPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      slaHours?: Record<string, number>
      resolutionSlaHours?: Record<string, number>
      slaEscalationHours?: number
      autoMonthlyReportEnabled?: boolean
      recalculateOpen?: boolean
    }) => {
      const { data } = await api.patch('/sla/policy', vars)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sla'] })
    },
  })
}
