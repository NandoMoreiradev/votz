import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AdPreferencesView, UpdateAdPreferencesInput } from '@votz/shared-types'
import { api } from '../lib/api'

const KEY = ['ads', 'preferences', 'me'] as const

/** Preferências de anúncios da própria pessoa (personalização, interesses, faixa de idade e gênero). */
export function useAdPreferences(enabled = true) {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<AdPreferencesView>('/ads/preferences/me').then((response) => response.data),
    enabled,
  })
}

export function useUpdateAdPreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateAdPreferencesInput) => api.patch<AdPreferencesView>('/ads/preferences/me', input).then((response) => response.data),
    onSuccess: (view) => queryClient.setQueryData(KEY, view),
  })
}
