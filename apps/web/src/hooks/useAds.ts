import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AdAccountView,
  AdBillingView,
  AdCampaignView,
  AdDailyStatView,
  AdReviewDecisionInput,
  AdReviewQueueResponse,
  AdTopUpMethod,
  AdTopUpView,
  AdSurface,
  AdView,
  CreateAdCampaignInput,
  SponsoredAdView,
} from '@votz/shared-types'
import { api } from '../lib/api'
import { uploadAdMedia } from '../lib/post-media-upload'

/** Gerenciador de anúncios do Estúdio (só empresas). Rotas em `/ads/COMPANY/:companyId/...`. */
const base = (companyId: string) => `/ads/COMPANY/${companyId}`
const accountsKey = (companyId: string) => ['ads', companyId, 'accounts'] as const
const campaignsKey = (companyId: string, accountId: string) => ['ads', companyId, 'accounts', accountId, 'campaigns'] as const

export function useAdAccounts(companyId: string) {
  return useQuery({
    queryKey: accountsKey(companyId),
    queryFn: () => api.get<AdAccountView[]>(`${base(companyId)}/accounts`).then((r) => r.data),
    enabled: !!companyId,
  })
}

export function useCreateAdAccount(companyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.post<AdAccountView>(`${base(companyId)}/accounts`, { name }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountsKey(companyId) }),
  })
}

export function useAdCampaigns(companyId: string, accountId: string | undefined) {
  return useQuery({
    queryKey: campaignsKey(companyId, accountId ?? ''),
    queryFn: () => api.get<AdCampaignView[]>(`${base(companyId)}/accounts/${accountId}/campaigns`).then((r) => r.data),
    enabled: !!companyId && !!accountId,
    // Vídeo do anúncio ainda sendo preparado: confere de novo a cada 5 s até ficar pronto (ou falhar).
    refetchInterval: (query) =>
      query.state.data?.some((campaign) => campaign.adSets.some((set) => set.ads.some((ad) => ad.creative.media?.status === 'PROCESSING'))) ? 5000 : false,
  })
}

/** Envio da foto ou do vídeo do anúncio (a empresa e a permissão são conferidas pelo servidor). */
export function useUploadAdMedia(companyId: string) {
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress?: (percent: number) => void }) => uploadAdMedia(companyId, file, onProgress),
  })
}

export function useCreateAdCampaign(companyId: string, accountId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAdCampaignInput) =>
      api.post<AdCampaignView>(`${base(companyId)}/accounts/${accountId}/campaigns`, input).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: campaignsKey(companyId, accountId) }),
  })
}

export function useSetAdCampaignStatus(companyId: string, accountId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ campaignId, status }: { campaignId: string; status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' }) =>
      api.patch<AdCampaignView>(`${base(companyId)}/campaigns/${campaignId}/status`, { status }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: campaignsKey(companyId, accountId) }),
  })
}

export function useSubmitAd(companyId: string, accountId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (adId: string) => api.post<AdView>(`${base(companyId)}/ads/${adId}/submit`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: campaignsKey(companyId, accountId) }),
  })
}

/** Mensagem de erro da API em português (as mensagens do servidor já vêm em português simples). */
export function adsErrorMessage(error: unknown, fallback = 'Não foi possível concluir agora. Tente de novo.'): string {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  const first = Array.isArray(message) ? message[0] : message
  // Erros de campos aninhados vêm como "adSet.Mensagem"; a pessoa só precisa da mensagem.
  return first ? first.replace(/^[a-zA-Z]+(\.[a-zA-Z0-9]+)*\.(?=[A-ZÀ-Ú])/, '') : fallback
}

export const formatBRL = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ─── Faturamento (saldo pré-pago) ──────────────────────────────────────────────────────────────

const billingKey = (companyId: string, accountId: string) => ['ads', companyId, 'accounts', accountId, 'billing'] as const

export function useAdBilling(companyId: string, accountId: string | undefined) {
  return useQuery({
    queryKey: billingKey(companyId, accountId ?? ''),
    queryFn: () => api.get<AdBillingView>(`${base(companyId)}/accounts/${accountId}/billing`).then((r) => r.data),
    enabled: !!companyId && !!accountId,
  })
}

/** Depois de qualquer mudança de saldo, atualiza o faturamento e a lista de contas (que mostra o saldo). */
function useRefreshBilling(companyId: string, accountId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: billingKey(companyId, accountId) }),
      queryClient.invalidateQueries({ queryKey: accountsKey(companyId) }),
    ])
}

export function useCreateAdTopUp(companyId: string, accountId: string) {
  const refresh = useRefreshBilling(companyId, accountId)
  return useMutation({
    mutationFn: (input: { amountCents: number; method: AdTopUpMethod }) =>
      api.post<AdTopUpView>(`${base(companyId)}/accounts/${accountId}/topups`, input).then((r) => r.data),
    onSuccess: refresh,
  })
}

export function useConfirmTestTopUp(companyId: string, accountId: string) {
  const refresh = useRefreshBilling(companyId, accountId)
  return useMutation({
    mutationFn: (topUpId: string) => api.post<AdTopUpView>(`${base(companyId)}/topups/${topUpId}/confirm-test`).then((r) => r.data),
    onSuccess: refresh,
  })
}

export function useCancelAdTopUp(companyId: string, accountId: string) {
  const refresh = useRefreshBilling(companyId, accountId)
  return useMutation({
    mutationFn: (topUpId: string) => api.post<AdTopUpView>(`${base(companyId)}/topups/${topUpId}/cancel`).then((r) => r.data),
    onSuccess: refresh,
  })
}

// ─── Fila de revisão (moderação) ───────────────────────────────────────────────────────────────

export function useAdReviewQueue(status: 'PENDING' | 'APPROVED' | 'REJECTED', page: number, enabled = true) {
  return useQuery({
    queryKey: ['admin-ad-reviews', status, page],
    queryFn: () => api.get<AdReviewQueueResponse>('/admin/ad-reviews', { params: { status, page, limit: 20 } }).then((r) => r.data),
    enabled,
  })
}

export function useDecideAd() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ adId, ...input }: { adId: string } & AdReviewDecisionInput) =>
      api.post(`/admin/ad-reviews/${adId}/decision`, input).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-ad-reviews'] }),
  })
}

// ─── Anúncio patrocinado no feed (cidadão) ─────────────────────────────────────────────────────

export interface SponsoredAdParams {
  surface: AdSurface
  position: number
  state?: string
  city?: string
  /** Só busca quando o espaço está perto da tela: não gasta exibição à toa. */
  enabled: boolean
}

/**
 * Pede o anúncio da vez para um espaço do feed. Uma vez entregue, o anúncio fica o mesmo enquanto a pessoa
 * navega (`staleTime` infinito), para não pedir de novo e contar outra exibição.
 */
export function useSponsoredAd({ surface, position, state, city, enabled }: SponsoredAdParams) {
  return useQuery({
    queryKey: ['ads', 'next', surface, position, state ?? '', city ?? ''],
    queryFn: () =>
      api
        .get<{ ad: SponsoredAdView | null }>('/ads/next', { params: { surface, position, state: state || undefined, city: city || undefined } })
        .then((r) => r.data.ad),
    enabled,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

// ─── Relatório ─────────────────────────────────────────────────────────────────────────────────

export function useAdStats(companyId: string, accountId: string | undefined, days: number) {
  return useQuery({
    queryKey: ['ads', companyId, 'accounts', accountId, 'stats', days] as const,
    queryFn: () => api.get<AdDailyStatView[]>(`${base(companyId)}/accounts/${accountId}/stats`, { params: { days } }).then((r) => r.data),
    enabled: !!companyId && !!accountId,
    refetchInterval: 60_000,
  })
}
