import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UserGender } from '@votz/shared-types'
import { api } from '../lib/api'
import { clearLastOrgContext, saveLastOrgContext } from '../lib/org-context-storage'
import { useAuthStore } from '../store/auth.store'
import {
  AuthResponse,
  AuthUser,
  LoginResponse,
  MfaEnableForcedResponse,
  MfaEnableResponse,
  MfaRegenerateBackupCodesResponse,
  MfaSetupResponse,
  MyProfilesResponse,
  SwitchContextResponse,
} from '../types/api'

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
  zipCode?: string
  streetNumber: string
  complement?: string
  street?: string
  neighborhood?: string
  city?: string
  state?: string
  latitude?: number
  longitude?: number
  acceptedTermsVersion: string
  acceptedPrivacyVersion: string
  confirmAge18: boolean
  /** Opcionais (AAAA-MM-DD e lista USER_GENDERS); nunca públicos. */
  birthDate?: string
  gender?: UserGender
}

export interface AcceptConsentPayload {
  acceptedTermsVersion: string
  acceptedPrivacyVersion: string
  confirmAge18: boolean
}

export function useAcceptConsent() {
  const setUser = useAuthStore((s) => s.setUser)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: AcceptConsentPayload) =>
      api.post<AuthUser>('/users/me/consent', data).then((r) => r.data),
    onSuccess: (user) => {
      setUser(user)
      queryClient.invalidateQueries({ queryKey: ['auth/me'] })
    },
  })
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

export function useSwitchContext(options?: { returnTo?: string }) {
  const applyContext = useAuthStore((s) => s.applyContext)

  return useMutation({
    mutationFn: (data: { contextType: string; contextId?: string; mfaCode?: string }) =>
      api.post<SwitchContextResponse>('/auth/switch-context', data).then((r) => r.data),
    onSuccess: (data) => {
      if ('accessToken' in data) {
        applyContext(data.accessToken, data.ctx)
        const currentUser = useAuthStore.getState().user
        if (data.ctx && currentUser?.id) {
          const fallbackRoute =
            typeof window !== 'undefined'
              ? `${window.location.pathname}${window.location.search}${window.location.hash}`
              : '/'
          saveLastOrgContext({
            type: data.ctx.type,
            id: data.ctx.id,
            returnTo: options?.returnTo ?? fallbackRoute,
            userId: currentUser.id,
          })
        } else {
          clearLastOrgContext()
        }
      }
    },
  })
}

export function useMe() {
  return useQuery<AuthUser>({
    queryKey: ['auth/me'],
    queryFn: () => api.get<AuthUser>('/auth/me').then((r) => r.data),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

/** Dados privados da própria pessoa (`GET /users/me`): só o que a tela de perfil precisa e a sessão não traz. */
export function useMyPrivateProfile(enabled: boolean) {
  return useQuery<{ birthDate: string | null; gender: UserGender | null }>({
    queryKey: ['users/me/private'],
    queryFn: () => api.get<{ birthDate: string | null; gender: UserGender | null }>('/users/me').then((r) => r.data),
    enabled,
    staleTime: 60_000,
  })
}

export function useMfaSetup() {
  return useMutation({
    mutationFn: () => api.post<MfaSetupResponse>('/auth/mfa/setup').then((r) => r.data),
  })
}

export function useMfaEnable() {
  return useMutation({
    mutationFn: (code: string) =>
      api.post<MfaEnableResponse>('/auth/mfa/enable', { code }).then((r) => r.data),
  })
}

export function useMfaDisable() {
  return useMutation({
    mutationFn: (code: string) =>
      api.post('/auth/mfa/disable', { code }).then((r) => r.data),
  })
}

export function useMfaResetDevice() {
  return useMutation({
    mutationFn: (code: string) =>
      api.post<MfaSetupResponse>('/auth/mfa/reset-device', { code }).then((r) => r.data),
  })
}

export function useMfaRegenerateBackupCodes() {
  return useMutation({
    mutationFn: (code: string) =>
      api.post<MfaRegenerateBackupCodesResponse>('/auth/mfa/backup-codes/regenerate', { code }).then((r) => r.data),
  })
}

export function useCreateReport() {
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post('/reports', data).then((r) => r.data),
  })
}
