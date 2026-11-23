import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'
import type {
  PressContactDeclineReason,
  PressContactReceived,
  PressContactReportStatus,
  PressContactSent,
} from '@votz/shared-types'

// O id de quem está logado entra na chave: trocar de conta no mesmo navegador nunca reaproveita o que a outra pessoa viu.
const STATUS_KEY = (reportId: string, uid?: string) => ['press-contact', 'status', reportId, uid] as const
const SENT_KEY = (uid?: string) => ['press-contact', 'sent', uid] as const
const RECEIVED_KEY = (uid?: string) => ['press-contact', 'received', uid] as const
const useUid = () => useAuthStore((s) => s.user?.id)

/** Estado do "aceito falar com a imprensa" do relato (para o autor e para o jornalista credenciado). */
export function usePressContactStatus(reportId: string, enabled: boolean) {
  const uid = useUid()
  return useQuery<PressContactReportStatus>({
    queryKey: STATUS_KEY(reportId, uid),
    queryFn: () => api.get<PressContactReportStatus>(`/imprensa/contatos/relatos/${reportId}`).then((r) => r.data),
    enabled,
    staleTime: 30_000,
  })
}

export function useSetPressContactOptIn(reportId: string) {
  const qc = useQueryClient()
  const uid = useUid()
  return useMutation({
    mutationFn: (pressContactOk: boolean) =>
      api.patch<{ id: string; pressContactOk: boolean }>(`/imprensa/contatos/relatos/${reportId}`, { pressContactOk }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY(reportId, uid) }),
  })
}

export function useRequestPressContact() {
  const qc = useQueryClient()
  const uid = useUid()
  return useMutation({
    mutationFn: (input: { reportId: string; message: string }) =>
      api.post<PressContactSent>('/imprensa/contatos', input).then((r) => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: STATUS_KEY(vars.reportId, uid) })
      qc.invalidateQueries({ queryKey: SENT_KEY(uid) })
    },
  })
}

export function useSentPressContacts(enabled: boolean) {
  const uid = useUid()
  return useQuery<PressContactSent[]>({
    queryKey: SENT_KEY(uid),
    queryFn: () => api.get<PressContactSent[]>('/imprensa/contatos/enviados').then((r) => r.data),
    enabled,
    staleTime: 30_000,
  })
}

export function useCancelPressContact() {
  const qc = useQueryClient()
  const uid = useUid()
  return useMutation({
    mutationFn: (id: string) => api.post(`/imprensa/contatos/${id}/cancelar`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SENT_KEY(uid) }),
  })
}

export function useReceivedPressContacts(enabled: boolean) {
  const uid = useUid()
  return useQuery<PressContactReceived[]>({
    queryKey: RECEIVED_KEY(uid),
    queryFn: () => api.get<PressContactReceived[]>('/imprensa/contatos/recebidos').then((r) => r.data),
    enabled,
    staleTime: 15_000,
  })
}

export function useRespondPressContact() {
  const qc = useQueryClient()
  const uid = useUid()
  return useMutation({
    mutationFn: ({ id, ...body }: {
      id: string
      action: 'accept' | 'decline'
      reply?: string
      viaVotzChat?: boolean
      reason?: PressContactDeclineReason
      block?: boolean
    }) => api.post(`/imprensa/contatos/${id}/responder`, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RECEIVED_KEY(uid) }),
  })
}
