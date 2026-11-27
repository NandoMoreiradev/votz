import { create } from 'zustand'
import { api, clearTokens, getRefreshToken, json, refreshSession, saveTokens, setAccessToken, setSessionExpiredHandler } from './api'
import { queryClient } from './query-client'
import type { ActiveContext, Session, User } from './types'

interface AuthState {
  user: User | null
  activeContext: ActiveContext | null
  ready: boolean
  restoreError: boolean
  restore: () => Promise<void>
  accept: (session: Session) => Promise<void>
  applyContext: (accessToken: string, ctx: ActiveContext | null) => void
  clearContext: () => void
  logout: () => Promise<void>
}
export const useSession = create<AuthState>((set) => ({
  user: null,
  activeContext: null,
  ready: false,
  restoreError: false,
  restore: async () => {
    set({ restoreError: false })
    try {
      if (await getRefreshToken()) {
        await refreshSession()
        const user = await api<User>('/auth/me')
        set({ user, activeContext: null })
      }
    } catch { set({ restoreError: true }) } finally { set({ ready: true }) }
  },
  accept: async (session) => {
    await saveTokens(session)
    queryClient.clear()
    set({ user: session.user, activeContext: null, restoreError: false, ready: true })
  },
  applyContext: (accessToken, ctx) => {
    setAccessToken(accessToken)
    set({ activeContext: ctx })
    void queryClient.invalidateQueries()
  },
  clearContext: () => {
    set({ activeContext: null })
  },
  logout: async () => {
    const refreshToken = await getRefreshToken()
    if (refreshToken) await api('/auth/mobile/logout', json({ refreshToken }))
    await clearTokens()
    queryClient.clear()
    set({ user: null, activeContext: null, restoreError: false })
  },
}))
setSessionExpiredHandler(() => {
  queryClient.clear()
  useSession.setState({ user: null, activeContext: null, restoreError: false })
})
