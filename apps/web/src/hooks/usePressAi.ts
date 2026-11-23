import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { PressBriefing, PressSearchResponse } from '@votz/shared-types'

export interface PressSearchParams {
  q: string
  state?: string
  category?: string
}

/** Busca por significado. É uma mutação (dispara ao enviar o formulário), não uma consulta que roda sozinha. */
export function usePressSearch() {
  return useMutation({
    mutationFn: ({ q, state, category }: PressSearchParams) => {
      const params = new URLSearchParams({ q })
      if (state) params.set('state', state)
      if (category) params.set('category', category)
      return api.get<PressSearchResponse>(`/imprensa/busca?${params.toString()}`).then((r) => r.data)
    },
  })
}

/** Briefing do surto: só carrega quando a pessoa abre (a primeira geração leva até ~30 s e é guardada para todos). */
export function useSurtoBriefing(surtoId: string | null) {
  return useQuery<PressBriefing>({
    queryKey: ['press-ai', 'briefing', surtoId],
    queryFn: () => api.get<PressBriefing>(`/imprensa/surtos/${surtoId}/briefing`, { timeout: 90_000 }).then((r) => r.data),
    enabled: !!surtoId,
    retry: false,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  })
}
