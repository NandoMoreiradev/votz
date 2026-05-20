import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setToken } from '../lib/token'
import { AuthenticatedUser } from '@votz/shared-types'
import { ActiveContext } from '../types/api'

interface AuthState {
  user: AuthenticatedUser | null
  activeContext: ActiveContext | null
  sessionReady: boolean
  setAuth: (user: AuthenticatedUser, accessToken: string) => void
  setUser: (user: AuthenticatedUser) => void
  applyContext: (accessToken: string, ctx: ActiveContext | null) => void
  clearContext: () => void
  setSessionReady: () => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      activeContext: null,
      sessionReady: false,
      setAuth: (user, accessToken) => {
        setToken(accessToken)
        set({ user, sessionReady: true, activeContext: null })
      },
      setUser: (user) => set({ user }),
      applyContext: (accessToken, ctx) => {
        setToken(accessToken)
        set({ activeContext: ctx })
      },
      clearContext: () => set({ activeContext: null }),
      setSessionReady: () => set({ sessionReady: true }),
      logout: () => {
        setToken(null)
        set({ user: null, activeContext: null, sessionReady: true })
      },
    }),
    {
      name: 'votz:auth',
      partialize: (state) => ({ user: state.user, activeContext: state.activeContext }),
    },
  ),
)
