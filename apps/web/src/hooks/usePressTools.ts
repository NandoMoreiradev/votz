import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type {
  Category,
  PressPlan,
  PressPlanInfo,
  PressRadarFrequency,
  PressRadarKind,
  PressRadarRuleView,
} from '@votz/shared-types'

const PLAN_KEY = ['press-tools', 'plan'] as const
const RADAR_KEY = ['press-tools', 'radar'] as const

/** Plano de quem está logado e o que ele libera (só para imprensa verificada). */
export function usePressPlan(enabled: boolean) {
  return useQuery<PressPlanInfo>({
    queryKey: PLAN_KEY,
    queryFn: () => api.get<PressPlanInfo>('/imprensa/plano').then((r) => r.data),
    enabled,
    staleTime: 60_000,
  })
}

export function useRadarRules(enabled: boolean) {
  return useQuery<PressRadarRuleView[]>({
    queryKey: RADAR_KEY,
    queryFn: () => api.get<PressRadarRuleView[]>('/imprensa/radar').then((r) => r.data),
    enabled,
    staleTime: 30_000,
  })
}

export interface RadarRuleInput {
  name: string
  kind: PressRadarKind
  states?: string[]
  cities?: string[]
  categories?: Category[]
  minPressure?: number
  stalledDays?: number
  frequency?: PressRadarFrequency
}

export function useCreateRadarRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RadarRuleInput) => api.post<PressRadarRuleView>('/imprensa/radar', input).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RADAR_KEY }),
  })
}

export function useUpdateRadarRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; active?: boolean; name?: string; frequency?: PressRadarFrequency }) =>
      api.patch<PressRadarRuleView>(`/imprensa/radar/${id}`, patch).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RADAR_KEY }),
  })
}

export function useDeleteRadarRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/imprensa/radar/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RADAR_KEY }),
  })
}

/** Abre o pagamento (ou o portal) do Stripe na mesma aba. */
export function usePressBilling(kind: 'checkout' | 'portal') {
  return useMutation({
    mutationFn: () => api.post<{ url: string | null }>(`/imprensa/plano/${kind}`).then((r) => r.data),
    onSuccess: ({ url }) => {
      if (url) window.location.assign(url)
    },
  })
}

export type PressFileKind = 'csv' | 'json' | 'serie'

export interface PressFileParams {
  days: number
  state?: string
  city?: string
  category?: string
  granularity?: 'week' | 'month'
}

/** O servidor responde erro como JSON, mas o pedido é de arquivo (blob): lê o texto do blob para achar a mensagem. */
export async function pressFileErrorMessage(err: unknown, fallback: string): Promise<string> {
  const data = (err as { response?: { data?: unknown } })?.response?.data
  try {
    const text = data instanceof Blob ? await data.text() : typeof data === 'string' ? data : ''
    const message = text ? (JSON.parse(text) as { message?: string | string[] }).message : undefined
    if (Array.isArray(message)) return message[0] ?? fallback
    return message || fallback
  } catch {
    return fallback
  }
}

export async function downloadPressFile(kind: PressFileKind, p: PressFileParams): Promise<void> {
  const params = new URLSearchParams({ days: String(p.days) })
  if (p.state) params.set('state', p.state)
  if (p.city) params.set('city', p.city)
  if (p.category) params.set('category', p.category)
  if (kind === 'serie') params.set('granularity', p.granularity ?? 'week')

  const response = await api.get(`/imprensa/export/${kind}?${params.toString()}`, { responseType: 'blob' })
  const disposition = response.headers['content-disposition'] as string | undefined
  const filename = disposition?.match(/filename="([^"]+)"/)?.[1] ?? `votz-${kind}-${new Date().toISOString().slice(0, 10)}.${kind === 'json' ? 'json' : 'csv'}`

  const url = URL.createObjectURL(response.data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export type { PressPlan }
