import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setToken } from '../lib/token'
import { AuthenticatedUser } from '@votz/shared-types'

interface AuthState {
  user: AuthenticatedUser | null
  setAuth: (user: AuthenticatedUser, accessToken: string) => void
  setUser: (user: AuthenticatedUser) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setAuth: (user, accessToken) => {
        setToken(accessToken)
        set({ user })
      },
      setUser: (user) => set({ user }),
      logout: () => {
        setToken(null)
        set({ user: null })
      },
    }),
    {
      name: 'votz:auth',
      partialize: (state) => ({ user: state.user }),
    },
  ),
)
