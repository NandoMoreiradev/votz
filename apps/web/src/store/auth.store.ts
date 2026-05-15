import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { UsuarioAutenticado } from '@votz/shared-types'

interface AuthState {
  usuario: UsuarioAutenticado | null
  accessToken: string | null
  setAuth: (usuario: UsuarioAutenticado, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      usuario: null,
      accessToken: null,
      setAuth: (usuario, accessToken) => {
        localStorage.setItem('votz:access_token', accessToken)
        set({ usuario, accessToken })
      },
      logout: () => {
        localStorage.removeItem('votz:access_token')
        set({ usuario: null, accessToken: null })
      },
    }),
    {
      name: 'votz:auth',
      partialize: (state) => ({ usuario: state.usuario }),
    },
  ),
)
