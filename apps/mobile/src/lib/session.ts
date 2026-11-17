import { create } from 'zustand'
import { api, clearTokens, getRefreshToken, json, refreshSession, saveTokens, setSessionExpiredHandler } from './api'
import { queryClient } from './query-client'
import type { Session, User } from './types'

interface AuthState {
  user: User | null; ready: boolean; restoreError: boolean
  restore: () => Promise<void>; accept: (session: Session) => Promise<void>; logout: () => Promise<void>
}
export const useSession = create<AuthState>((set) => ({
  user: null, ready: false, restoreError: false,
  restore: async () => {
    set({ restoreError: false })
    try {
      if (await getRefreshToken()) {
        await refreshSession()
        const user = await api<User>('/auth/me')
        set({ user })
      }
    } catch { set({ restoreError: true }) } finally { set({ ready: true }) }
  },
  accept: async (session) => {
    await saveTokens(session)
    queryClient.clear()
    set({ user: session.user, restoreError: false, ready: true })
  },
  logout: async () => {
    const refreshToken = await getRefreshToken()
    if (refreshToken) await api('/auth/mobile/logout', json({ refreshToken }))
    await clearTokens()
    queryClient.clear()
    set({ user: null, restoreError: false })
  },
}))
setSessionExpiredHandler(() => {
  queryClient.clear()
  useSession.setState({ user: null, restoreError: false })
})
