import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Company, CompaniesResponse, UserReportsResponse } from '../types/api'

interface UseCompaniesParams {
  sector?: string
  city?: string
  state?: string
  search?: string
  page?: number
}

export function useCompanies(params: UseCompaniesParams = {}) {
  return useQuery({
    queryKey: ['companies', params],
    queryFn: () =>
      api.get<CompaniesResponse>('/companies', { params: { ...params, limit: 20 } }).then((r) => r.data),
    staleTime: 60_000,
  })
}

export function useCompany(id: string) {
  return useQuery({
    queryKey: ['company', id],
    queryFn: () => api.get<Company>(`/companies/${id}`).then((r) => r.data),
    enabled: !!id,
    staleTime: 60_000,
  })
}

export function useCompanyReports(companyId: string, page = 1, status?: string) {
  return useQuery({
    queryKey: ['company-reports', companyId, page, status],
    queryFn: () =>
      api
        .get<UserReportsResponse>(`/companies/${companyId}/reports`, { params: { page, limit: 10, status } })
        .then((r) => r.data),
    enabled: !!companyId,
    staleTime: 30_000,
  })
}
