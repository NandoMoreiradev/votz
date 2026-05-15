import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AuthenticatedUser } from '@votz/shared-types'

interface AuthState {
  user: AuthenticatedUser | null
  accessToken: string | null
  setAuth: (user: AuthenticatedUser, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setAuth: (user, accessToken) => {
        localStorage.setItem('votz:access_token', accessToken)
        set({ user, accessToken })
      },
      logout: () => {
        localStorage.removeItem('votz:access_token')
        set({ user: null, accessToken: null })
      },
    }),
    {
      name: 'votz:auth',
      partialize: (state) => ({ user: state.user }),
    },
  ),
)
