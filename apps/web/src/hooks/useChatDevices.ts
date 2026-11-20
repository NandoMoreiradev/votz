import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { chatDevicesApi, type ChatHttp } from '@votz/chat-core'
import { api } from '../lib/api'
import { webChatStorage } from '../lib/chat-storage'
import { useConversationScope } from './useConversations'

/**
 * Chamadas autenticadas com as credenciais DESTE navegador, sem abrir o motor
 * criptográfico (nem pedir a senha das conversas).
 */
async function withDevices<T>(
  userId: string,
  work: (devices: ReturnType<typeof chatDevicesApi>) => Promise<T>,
) {
  const store = await webChatStorage(userId)
  try {
    const headers = {
      'x-votz-chat-device': store.credentials.id,
      'x-votz-chat-secret': store.credentials.secret,
    }
    const http: ChatHttp = async (path, method = 'GET', body) =>
      (
        await api.request({
          url: `/conversations${path}`,
          method,
          data: body,
          headers,
        })
      ).data
    return await work(chatDevicesApi(http))
  } finally {
    store.close()
  }
}
export function useChatDeviceStatus() {
  const scope = useConversationScope()
  return useQuery({
    queryKey: [...scope.key, 'chat-device-status'],
    queryFn: () => withDevices(scope.user!.id, (devices) => devices.status()),
    enabled: scope.enabled,
    staleTime: 15_000,
    retry: false,
  })
}
export function useChatDevices(enabled = true) {
  const scope = useConversationScope()
  return useQuery({
    queryKey: [...scope.key, 'chat-devices'],
    queryFn: () => withDevices(scope.user!.id, (devices) => devices.list()),
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
    mutationFn: (action: ChatDeviceAction) =>
      withDevices(scope.user!.id, (devices) =>
        action.type === 'revoke'
          ? devices.revoke(action.id)
          : action.type === 'approve-code'
            ? devices.approveByCode(action.code, action.linkId)
            : devices.decide(action.id, action.type === 'approve'),
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [...scope.key, 'chat-devices'] })
      void client.invalidateQueries({
        queryKey: [...scope.key, 'chat-device-status'],
      })
    },
  })
}
