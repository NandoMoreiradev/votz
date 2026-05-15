import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Report } from '../types/api'

export function useReport(id: string) {
  return useQuery({
    queryKey: ['report', id],
    queryFn: () => api.get<Report>(`/reports/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}
