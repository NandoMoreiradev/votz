import { useSyncExternalStore } from 'react'
import { chatPreviews, type ChatPreview } from '@votz/chat-core'

/** Prévia em memória da última mensagem aberta desta conversa (some em segundo plano e ao sair da conta). */
export function useChatPreview(conversationId: string): ChatPreview | undefined {
  return useSyncExternalStore(
    chatPreviews.subscribe,
    () => chatPreviews.get(conversationId),
    () => undefined,
  )
}
