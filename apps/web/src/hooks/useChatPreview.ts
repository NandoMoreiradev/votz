import { useSyncExternalStore } from 'react'
import { chatPreviews, type ChatPreview } from '@votz/chat-core'
import { useAuthStore } from '../store/auth.store'

// A prévia é texto aberto na memória: ao sair da conta ou trocar de usuário, some.
useAuthStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id) chatPreviews.clear()
})

/** Prévia em memória da última mensagem aberta desta conversa neste navegador. */
export function useChatPreview(conversationId: string): ChatPreview | undefined {
  return useSyncExternalStore(
    chatPreviews.subscribe,
    () => chatPreviews.get(conversationId),
    () => undefined,
  )
}
