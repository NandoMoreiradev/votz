import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'
import { AuthResponse, LoginResponse, MfaEnableForcedResponse, MfaSetupResponse, MyProfilesResponse, SwitchContextResponse } from '../types/api'

export function useLogin() {
  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      api.post<LoginResponse>('/auth/login', data).then((r) => r.data),
  })
}

export function useMfaVerify() {
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: (data: { mfaToken: string; code: string }) =>
      api.post<AuthResponse>('/auth/mfa/verify', data).then((r) => r.data),
    onSuccess: ({ user, accessToken }) => {
      setAuth(user, accessToken)
    },
  })
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
  phone: string
  zipCode: string
  streetNumber: string
  complement?: string
  street?: string
  neighborhood?: string
  city?: string
  state?: string
  latitude?: number
  longitude?: number
}

export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: (data: RegisterPayload) =>
      api.post<AuthResponse>('/auth/register', data).then((r) => r.data),
    onSuccess: ({ user, accessToken }) => {
      setAuth(user, accessToken)
    },
  })
}

export function useMfaSetupForced(mfaSetupToken: string) {
  return useMutation({
    mutationFn: () =>
      api
        .post<MfaSetupResponse>('/auth/mfa/setup/forced', {}, {
          headers: { Authorization: `Bearer ${mfaSetupToken}` },
        })
        .then((r) => r.data),
  })
}

export function useMfaEnableForced(mfaSetupToken: string) {
  return useMutation({
    mutationFn: (code: string) =>
      api
        .post<MfaEnableForcedResponse>('/auth/mfa/enable/forced', { code }, {
          headers: { Authorization: `Bearer ${mfaSetupToken}` },
        })
        .then((r) => r.data),
    // Sem onSuccess aqui — Login.tsx chama enterWithAuth para garantir o fluxo do modal
  })
}

export function useMyProfiles(enabled: boolean) {
  return useQuery<MyProfilesResponse>({
    queryKey: ['my-profiles'],
    queryFn: () => api.get<MyProfilesResponse>('/auth/my-profiles').then((r) => r.data),
    enabled,
    staleTime: 5 * 60_000,        // memberships mudam raramente
    refetchOnWindowFocus: false,   // sem refetch ao voltar à aba
    refetchOnReconnect: false,
  })
}

export function useSwitchContext() {
  const applyContext = useAuthStore((s) => s.applyContext)

  return useMutation({
    mutationFn: (data: { contextType: string; contextId?: string }) =>
      api.post<SwitchContextResponse>('/auth/switch-context', data).then((r) => r.data),
    onSuccess: ({ accessToken, ctx }) => {
      applyContext(accessToken, ctx)
    },
  })
}

export function useCreateReport() {
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post('/reports', data).then((r) => r.data),
  })
}
