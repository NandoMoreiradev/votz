import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { MyPressCredential, PressCredentialStatus, PressOutletType } from '@votz/shared-types'

export interface PressCredentialInput {
  outletName: string
  outletType: PressOutletType
  jobTitle?: string
  website: string
  newsroomEmail: string
  coverageArea?: string
  portfolioUrls: string[]
  note?: string
}

/** Sinais que ajudam o moderador (pistas, nunca decisão automática). */
export interface PressCredentialSignals {
  emailDomain: string
  emailIsFreeProvider: boolean
  websiteHost: string
  emailMatchesWebsite: boolean
  emailConfirmed: boolean
  accountAgeDays: number
}

export interface PressCredentialReview {
  id: string
  status: PressCredentialStatus
  plan: 'GRATUITA' | 'PRO'
  outletName: string
  outletType: PressOutletType
  jobTitle: string | null
  website: string
  newsroomEmail: string
  coverageArea: string | null
  portfolioUrls: string[]
  note: string | null
  reviewNote: string | null
  reviewedAt: string | null
  reviewer: { id: string; name: string } | null
  createdAt: string
  user: { id: string; name: string; email: string; type: string; createdAt: string }
  signals: PressCredentialSignals
  /** Pedidos de contato recusados como abusivos (3 suspendem os pedidos do jornalista). */
  contactAbuseCount: number
}

/** Mensagem do servidor (já em português) ou a de reserva. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  if (Array.isArray(message)) return message[0] ?? fallback
  return message || fallback
}

const MINE_KEY = ['press-credential', 'mine'] as const
const QUEUE_KEY = ['press-credential', 'queue'] as const

export function useMyPressCredential(enabled: boolean) {
  return useQuery<MyPressCredential | null>({
    queryKey: MINE_KEY,
    queryFn: () => api.get<MyPressCredential | null>('/imprensa/credenciamento/minha').then((r) => r.data || null),
    enabled,
    staleTime: 30_000,
  })
}

export function useCreatePressCredential() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PressCredentialInput) =>
      api.post<MyPressCredential>('/imprensa/credenciamento', input).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: MINE_KEY }),
  })
}

export function useResendPressEmail() {
  return useMutation({
    mutationFn: () =>
      api.post<{ sent: boolean; alreadyConfirmed?: boolean }>('/imprensa/credenciamento/reenviar-email').then((r) => r.data),
  })
}

/**
 * Confirma o e-mail da redação com o código do link. O código é de uso único, então isto é uma consulta
 * (e não uma mutação): o cache do TanStack é compartilhado entre remontagens da página e do modo estrito
 * do React, e garante um único POST por código, com o resultado visível para quem remontar.
 */
export function useConfirmPressEmail(token: string | null, enabled: boolean) {
  const qc = useQueryClient()
  return useQuery<{ confirmed: true }>({
    queryKey: ['press-credential', 'confirm', token],
    enabled: enabled && !!token,
    retry: false,
    retryOnMount: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await api.post<{ confirmed: true }>('/imprensa/credenciamento/confirmar-email', { token })
      void qc.invalidateQueries({ queryKey: MINE_KEY })
      return data
    },
  })
}

// ── Moderação ────────────────────────────────────────────────────────────────

export function usePressCredentialQueue(status: PressCredentialStatus) {
  return useQuery<{ data: PressCredentialReview[]; total: number }>({
    queryKey: [...QUEUE_KEY, status],
    queryFn: () => api.get(`/imprensa/credenciamentos?status=${status}&limit=50`).then((r) => r.data),
  })
}

/** Troca de plano pela equipe (só admin), com motivo. */
export function usePressPlanChange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, plan, reason }: { id: string; plan: 'GRATUITA' | 'PRO'; reason: string }) =>
      api.post(`/imprensa/credenciamentos/${id}/plano`, { plan, reason }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUEUE_KEY }),
  })
}

export type PressDecision = 'aprovar' | 'recusar' | 'cancelar'

export function usePressCredentialDecision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action, reviewNote }: { id: string; action: PressDecision; reviewNote?: string }) =>
      api.post(`/imprensa/credenciamentos/${id}/${action}`, { reviewNote }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUEUE_KEY }),
  })
}
