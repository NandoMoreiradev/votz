import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CHAT_BACKUP_MIN_PASSWORD,
  chatBackupApi,
  chatPreviews,
} from '@votz/chat-core'
import {
  nativeChatDeviceHttp,
  withNativeChatEngine,
} from '../lib/chat-runtime'
import { useConversationScope } from './use-conversations'

function generateEightDigitCode(): string {
  let digits = ''
  for (let i = 0; i < 8; i++) digits += String(Math.floor(Math.random() * 10))
  return digits
}

export function useChatBackupMeta() {
  const scope = useConversationScope()
  return useQuery({
    queryKey: [...scope.key, 'chat-backup-meta'],
    queryFn: async () =>
      chatBackupApi(await nativeChatDeviceHttp(scope.user!.id)).meta(),
    enabled: scope.enabled,
    retry: false,
  })
}

export function useChatHistoryTransferMeta() {
  const scope = useConversationScope()
  return useQuery({
    queryKey: [...scope.key, 'chat-history-transfer'],
    queryFn: async () =>
      chatBackupApi(await nativeChatDeviceHttp(scope.user!.id)).transferMeta(),
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
      return withNativeChatEngine(scope.user!.id, async (engine, http) => {
        const vault = await engine.exportKeyVault(passphrase)
        return chatBackupApi(http).upload(vault)
      })
    },
    onSuccess: invalidate,
  })

  const restore = useMutation({
    mutationFn: async (passphrase: string) => {
      if (!passphrase) throw new Error('Digite a senha do backup.')
      return withNativeChatEngine(scope.user!.id, async (engine, http) => {
        const { vault } = await chatBackupApi(http).download()
        const result = await engine.importKeyVault(vault, passphrase)
        chatPreviews.clear()
        return result
      })
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async () =>
      chatBackupApi(await nativeChatDeviceHttp(scope.user!.id)).remove(),
    onSuccess: invalidate,
  })

  const sendTransfer = useMutation({
    mutationFn: async () => {
      const code = generateEightDigitCode()
      return withNativeChatEngine(scope.user!.id, async (engine, http) => {
        const vault = await engine.exportKeyVault(code)
        const created = await chatBackupApi(http).createTransfer(vault)
        return { ...created, code }
      })
    },
    onSuccess: invalidate,
  })

  const receiveTransfer = useMutation({
    mutationFn: async ({ id, code }: { id: string; code: string }) => {
      const clean = code.replace(/\D/g, '')
      if (clean.length !== 8)
        throw new Error('Digite os 8 dígitos do código de transferência.')
      return withNativeChatEngine(scope.user!.id, async (engine, http) => {
        const { vault } = await chatBackupApi(http).consumeTransfer(id)
        const result = await engine.importKeyVault(vault, clean)
        chatPreviews.clear()
        return result
      })
    },
    onSuccess: invalidate,
  })

  return { save, restore, remove, sendTransfer, receiveTransfer }
}
