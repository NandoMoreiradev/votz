import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CHAT_BACKUP_MIN_PASSWORD,
  chatBackupApi,
  chatPreviews,
  type ChatHttp,
} from '@votz/chat-core'
import { api } from '../lib/api'
import { acquireWebChatSession } from '../lib/chat-session'
import { webChatStorage } from '../lib/chat-storage'
import { useConversationScope } from './useConversations'

async function withBackupApi<T>(
  userId: string,
  work: (backup: ReturnType<typeof chatBackupApi>) => Promise<T>,
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
    return await work(chatBackupApi(http))
  } finally {
    store.close()
  }
}

async function withSession(userId: string) {
  const store = await webChatStorage(userId)
  const secret = store.storeSecret
  store.close()
  if (!secret)
    throw new Error(
      'Abra uma conversa primeiro para desbloquear este navegador.',
    )
  const controller = new AbortController()
  return acquireWebChatSession({
    userId,
    secret,
    signal: controller.signal,
    onPending: () => {
      controller.abort()
    },
  })
}

function generateEightDigitCode(): string {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return String(bytes[0] % 100_000_000).padStart(8, '0')
}

export function useChatBackupMeta() {
  const scope = useConversationScope()
  return useQuery({
    queryKey: [...scope.key, 'chat-backup-meta'],
    queryFn: () => withBackupApi(scope.user!.id, (b) => b.meta()),
    enabled: scope.enabled,
    retry: false,
  })
}

export function useChatHistoryTransferMeta() {
  const scope = useConversationScope()
  return useQuery({
    queryKey: [...scope.key, 'chat-history-transfer'],
    queryFn: () => withBackupApi(scope.user!.id, (b) => b.transferMeta()),
    enabled: scope.enabled,
    retry: false,
    refetchInterval: (q) => (q.state.status === 'error' ? false : 10_000),
  })
}

export function useChatBackupActions() {
  const scope = useConversationScope()
  const client = useQueryClient()
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: [...scope.key, 'chat-backup-meta'] })
    void client.invalidateQueries({
      queryKey: [...scope.key, 'chat-history-transfer'],
    })
    void client.invalidateQueries({ queryKey: [...scope.key, 'settings'] })
  }

  const save = useMutation({
    mutationFn: async (passphrase: string) => {
      if (passphrase.length < CHAT_BACKUP_MIN_PASSWORD)
        throw new Error(
          `Use uma senha de pelo menos ${CHAT_BACKUP_MIN_PASSWORD} caracteres.`,
        )
      const session = await withSession(scope.user!.id)
      const vault = await session.engine.exportKeyVault(passphrase)
      return chatBackupApi(session.http).upload(vault)
    },
    onSuccess: invalidate,
  })

  const restore = useMutation({
    mutationFn: async (passphrase: string) => {
      if (!passphrase) throw new Error('Digite a senha do backup.')
      const session = await withSession(scope.user!.id)
      const { vault } = await chatBackupApi(session.http).download()
      const result = await session.engine.importKeyVault(vault, passphrase)
      chatPreviews.clear()
      return result
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: () => withBackupApi(scope.user!.id, (b) => b.remove()),
    onSuccess: invalidate,
  })

  const sendTransfer = useMutation({
    mutationFn: async () => {
      const session = await withSession(scope.user!.id)
      const code = generateEightDigitCode()
      const vault = await session.engine.exportKeyVault(code)
      const created = await chatBackupApi(session.http).createTransfer(vault)
      return { ...created, code }
    },
    onSuccess: invalidate,
  })

  const receiveTransfer = useMutation({
    mutationFn: async ({ id, code }: { id: string; code: string }) => {
      const clean = code.replace(/\D/g, '')
      if (clean.length !== 8)
        throw new Error('Digite os 8 dígitos do código de transferência.')
      const session = await withSession(scope.user!.id)
      const { vault } = await chatBackupApi(session.http).consumeTransfer(id)
      const result = await session.engine.importKeyVault(vault, clean)
      chatPreviews.clear()
      return result
    },
    onSuccess: invalidate,
  })

  return { save, restore, remove, sendTransfer, receiveTransfer }
}
