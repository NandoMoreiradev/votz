import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Entity, EntitiesResponse, UserReportsResponse } from '../types/api'
import { EntityType } from '@votz/shared-types'

export interface UpdateEntityPayload {
  legalName?: string
  city?: string
  state?: string
  website?: string
  logoUrl?: string
  slaHours?: Record<string, number>
}

interface UseEntitiesParams {
  type?: EntityType
  city?: string
  state?: string
  search?: string
  verified?: boolean
  enabled?: boolean
  page?: number
}

export function useEntities(params: UseEntitiesParams = {}) {
  const { enabled = true, ...queryParams } = params
  return useQuery({
    queryKey: ['entities', queryParams],
    queryFn: () =>
      api.get<EntitiesResponse>('/entities', { params: { ...queryParams, limit: 20 } }).then((r) => r.data),
    staleTime: 60_000,
    enabled,
  })
}

export function useEntity(id: string) {
  return useQuery({
    queryKey: ['entity', id],
    queryFn: () => api.get<Entity>(`/entities/${id}`).then((r) => r.data),
    enabled: !!id,
    staleTime: 60_000,
  })
}

export function useUpdateEntity(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateEntityPayload) =>
      api.patch<Entity>(`/entities/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entity', id] })
    },
  })
}

export function useEntityReports(entityId: string, page = 1, status?: string) {
  return useQuery({
    queryKey: ['entity-reports', entityId, page, status],
    queryFn: () =>
      api
        .get<UserReportsResponse>(`/entities/${entityId}/reports`, { params: { page, limit: 10, status } })
        .then((r) => r.data),
    enabled: !!entityId,
    staleTime: 30_000,
  })
}
