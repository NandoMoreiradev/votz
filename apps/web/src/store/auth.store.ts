import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setToken } from '../lib/token'
import { clearLastOrgContext, readLastOrgContext } from '../lib/org-context-storage'
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
        const savedHint = readLastOrgContext()
        if (savedHint && savedHint.userId !== user.id) {
          clearLastOrgContext()
        }
        set({ user, sessionReady: true, activeContext: null })
      },
      setUser: (user) => set({ user }),
      applyContext: (accessToken, ctx) => {
        setToken(accessToken)
        if (!ctx) {
          clearLastOrgContext()
        }
        set({ activeContext: ctx })
      },
      clearContext: () => {
        clearLastOrgContext()
        set({ activeContext: null })
      },
      setSessionReady: () => set({ sessionReady: true }),
      logout: () => {
        setToken(null)
        clearLastOrgContext()
        set({ user: null, activeContext: null, sessionReady: true })
      },
    }),
    {
      name: 'votz:auth',
      partialize: (state) => ({ user: state.user }),
    },
  ),
)

/** Identidade das respostas que carregam estado individual ou permissões do contexto ativo. */
export function useViewerCacheScope() {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const contextType = useAuthStore((s) => s.activeContext?.type ?? null)
  const contextId = useAuthStore((s) => s.activeContext?.id ?? null)
  return [userId, contextType, contextId] as const
}
