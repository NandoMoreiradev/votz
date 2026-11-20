import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { YoutubeChannel } from '../types/api'

const KEY = ['youtube-channels']

/** Canais do YouTube da organização ativa (político/equipe ou entidade). */
export function useYoutubeChannels(enabled = true) {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<YoutubeChannel[]>('/youtube/channels').then((r) => r.data),
    enabled,
    staleTime: 30_000,
  })
}

export function useAddYoutubeChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (channel: string) => api.post<YoutubeChannel>('/youtube/channels', { channel }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useVerifyYoutubeChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<YoutubeChannel>(`/youtube/channels/${id}/verify`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useRemoveYoutubeChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/youtube/channels/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
