import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Entity, EntitiesResponse, UserReportsResponse } from '../types/api'
import { EntityType } from '@votz/shared-types'

interface UseEntitiesParams {
  type?: EntityType
  city?: string
  state?: string
  search?: string
  page?: number
}

export function useEntities(params: UseEntitiesParams = {}) {
  return useQuery({
    queryKey: ['entities', params],
    queryFn: () =>
      api.get<EntitiesResponse>('/entities', { params: { ...params, limit: 20 } }).then((r) => r.data),
    staleTime: 60_000,
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

export function useEntityReports(entityId: string, page = 1) {
  return useQuery({
    queryKey: ['entity-reports', entityId, page],
    queryFn: () =>
      api
        .get<UserReportsResponse>(`/entities/${entityId}/reports`, { params: { page, limit: 10 } })
        .then((r) => r.data),
    enabled: !!entityId,
    staleTime: 30_000,
  })
}
