import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { chatDevicesApi } from '@votz/chat-core'
import { nativeChatDeviceHttp } from '../lib/chat-runtime'
import { useConversationScope } from './use-conversations'

/** Estado leve deste aparelho em relação às conversas (sem iniciar pedido). */
export function useChatDeviceStatus() {
  const scope = useConversationScope()
  return useQuery({
    queryKey: [...scope.key, 'chat-device-status'],
    queryFn: async () =>
      chatDevicesApi(await nativeChatDeviceHttp(scope.user!.id)).status(),
    enabled: scope.enabled,
    staleTime: 15_000,
    retry: false,
  })
}
/** Aparelhos conectados e pedidos de vínculo da própria conta. */
export function useChatDevices(enabled = true) {
  const scope = useConversationScope()
  return useQuery({
    queryKey: [...scope.key, 'chat-devices'],
    queryFn: async () =>
      chatDevicesApi(await nativeChatDeviceHttp(scope.user!.id)).list(),
    enabled: scope.enabled && enabled,
    retry: false,
    // Pedidos novos aparecem sozinhos; ao falhar, não insiste a cada ciclo.
    refetchInterval: (query) => (query.state.status === 'error' ? false : 5_000),
  })
}
export type ChatDeviceAction =
  | { type: 'approve' | 'deny' | 'revoke'; id: string }
  | { type: 'approve-code'; code: string; linkId?: string }
export function useChatDeviceAction() {
  const scope = useConversationScope()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (action: ChatDeviceAction) => {
      const devices = chatDevicesApi(await nativeChatDeviceHttp(scope.user!.id))
      return action.type === 'revoke'
        ? devices.revoke(action.id)
        : action.type === 'approve-code'
          ? devices.approveByCode(action.code, action.linkId)
          : devices.decide(action.id, action.type === 'approve')
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [...scope.key, 'chat-devices'] })
      void client.invalidateQueries({
        queryKey: [...scope.key, 'chat-device-status'],
      })
    },
  })
}
