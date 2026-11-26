import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ThemeProvider } from 'styled-components'
import { THEME_PREFERENCES, type ThemePreference } from '@votz/shared-types'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'
import { darkTheme, lightTheme } from './index'

const STORAGE_KEY = 'votz:theme'

function readCachedPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && (THEME_PREFERENCES as readonly string[]).includes(raw)) {
      return raw as ThemePreference
    }
  } catch {
    // ignore storage errors
  }
  return 'SYSTEM'
}

function getSystemDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

interface ThemeContextValue {
  preference: ThemePreference
  resolvedMode: 'light' | 'dark'
  saving: boolean
  setPreference: (next: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'SYSTEM',
  resolvedMode: 'light',
  saving: false,
  setPreference: () => undefined,
})

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  const [preference, setPreferenceState] = useState<ThemePreference>(readCachedPreference)
  const [systemDark, setSystemDark] = useState<boolean>(getSystemDark)
  const [saving, setSaving] = useState(false)

  // Sincroniza com a preferência salva no perfil do usuário assim que /auth/me carrega
  useEffect(() => {
    if (user?.themePreference && (THEME_PREFERENCES as readonly string[]).includes(user.themePreference)) {
      setPreferenceState(user.themePreference)
      try {
        localStorage.setItem(STORAGE_KEY, user.themePreference)
      } catch {
        // ignore
      }
    }
  }, [user?.id, user?.themePreference])

  // Escuta mudanças no tema do sistema operacional em tempo real
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolvedMode: 'light' | 'dark' =
    preference === 'DARK' || (preference === 'SYSTEM' && systemDark) ? 'dark' : 'light'

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedMode
    document.documentElement.style.colorScheme = resolvedMode
  }, [resolvedMode])

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next)
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // ignore
      }

      if (!user) return
      setUser({ ...user, themePreference: next })
      setSaving(true)
      api
        .patch(`/users/${user.id}`, { themePreference: next })
        .catch(() => {
          // Mantém preferência local mesmo se offline; próxima sessão sincroniza
        })
        .finally(() => setSaving(false))
    },
    [user, setUser],
  )

  const activeTheme = resolvedMode === 'dark' ? darkTheme : lightTheme
  const value = useMemo(
    () => ({ preference, resolvedMode, saving, setPreference }),
    [preference, resolvedMode, saving, setPreference],
  )

  return (
    <ThemeContext.Provider value={value}>
      <ThemeProvider theme={activeTheme}>{children}</ThemeProvider>
    </ThemeContext.Provider>
  )
}

export function useAppTheme() {
  return useContext(ThemeContext)
}
