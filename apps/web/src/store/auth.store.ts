import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setToken } from '../lib/token'
import { AuthenticatedUser } from '@votz/shared-types'

interface AuthState {
  user: AuthenticatedUser | null
  sessionReady: boolean
  setAuth: (user: AuthenticatedUser, accessToken: string) => void
  setUser: (user: AuthenticatedUser) => void
  setSessionReady: () => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      sessionReady: false,
      setAuth: (user, accessToken) => {
        setToken(accessToken)
        set({ user, sessionReady: true })
      },
      setUser: (user) => set({ user }),
      setSessionReady: () => set({ sessionReady: true }),
      logout: () => {
        setToken(null)
        set({ user: null, sessionReady: true })
      },
    }),
    {
      name: 'votz:auth',
      partialize: (state) => ({ user: state.user }),
    },
  ),
)
