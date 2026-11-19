import { useEffect, useState } from 'react'
import type { ConversationTypingEvent } from '@votz/shared-types'

const TYPING_TTL_MS = 5500

type Entry = { name: string; expiresAt: number; timer: ReturnType<typeof setTimeout> }
const byConversation = new Map<string, Map<string, Entry>>()
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function recordTyping(event: ConversationTypingEvent) {
  if (!event?.conversationId || !event?.userId) return
  let map = byConversation.get(event.conversationId)
  const existing = map?.get(event.userId)
  if (existing) clearTimeout(existing.timer)
  if (!event.typing) {
    map?.delete(event.userId)
    if (map && map.size === 0) byConversation.delete(event.conversationId)
    notify()
    return
  }
  if (!map) {
    map = new Map()
    byConversation.set(event.conversationId, map)
  }
  const timer = setTimeout(() => {
    const current = byConversation.get(event.conversationId)
    current?.delete(event.userId)
    if (current && current.size === 0) byConversation.delete(event.conversationId)
    notify()
  }, TYPING_TTL_MS)
  map.set(event.userId, {
    name: event.userName || 'Alguém',
    expiresAt: Date.now() + TYPING_TTL_MS,
    timer,
  })
  notify()
}

export function clearTyping() {
  for (const map of byConversation.values()) {
    for (const entry of map.values()) clearTimeout(entry.timer)
  }
  byConversation.clear()
  notify()
}

function namesFor(conversationId: string): string[] {
  const map = byConversation.get(conversationId)
  if (!map) return []
  const now = Date.now()
  return [...map.values()].filter((e) => e.expiresAt > now).map((e) => e.name)
}

export function useTypingUsers(conversationId: string): string[] {
  const [names, setNames] = useState<string[]>(() => namesFor(conversationId))
  useEffect(() => {
    const sync = () => setNames(namesFor(conversationId))
    sync()
    listeners.add(sync)
    return () => {
      listeners.delete(sync)
    }
  }, [conversationId])
  return names
}
