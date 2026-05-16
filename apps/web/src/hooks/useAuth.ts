import { useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'
import { AuthResponse, LoginResponse } from '../types/api'

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

export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: (data: { name: string; email: string; password: string }) =>
      api.post<AuthResponse>('/auth/register', data).then((r) => r.data),
    onSuccess: ({ user, accessToken }) => {
      setAuth(user, accessToken)
    },
  })
}

export function useCreateReport() {
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post('/reports', data).then((r) => r.data),
  })
}
