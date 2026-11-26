import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { useColorScheme } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { THEME_PREFERENCES, type ThemePreference } from '@votz/shared-types'
import { api, json } from './lib/api'
import { useSession } from './lib/session'
import { darkTheme, lightTheme, type MobileTheme } from './theme'

interface MobileThemeContextValue {
  preference: ThemePreference
  resolvedMode: 'light' | 'dark'
  colors: MobileTheme['colors']
  theme: MobileTheme
  setPreference: (next: ThemePreference) => void
}

const MobileThemeContext = createContext<MobileThemeContextValue>({
  preference: 'SYSTEM',
  resolvedMode: 'light',
  colors: lightTheme.colors,
  theme: lightTheme,
  setPreference: () => undefined,
})

export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme()
  const user = useSession((s) => s.user)
  const [preference, setPreferenceState] = useState<ThemePreference>('SYSTEM')

  useEffect(() => {
    const saved = (user as { themePreference?: ThemePreference } | null)?.themePreference
    if (saved && (THEME_PREFERENCES as readonly string[]).includes(saved)) {
      setPreferenceState(saved)
    }
  }, [user])

  const resolvedMode: 'light' | 'dark' =
    preference === 'DARK' || (preference === 'SYSTEM' && systemScheme === 'dark') ? 'dark' : 'light'

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next)
      if (!user) return
      void api(`/users/${user.id}`, { ...json({ themePreference: next }), method: 'PATCH' }).catch(() => {
        // Silencioso se offline; sincroniza na próxima sessão
      })
    },
    [user],
  )

  const active = resolvedMode === 'dark' ? darkTheme : lightTheme
  const value = useMemo(
    () => ({ preference, resolvedMode, colors: active.colors, theme: active, setPreference }),
    [preference, resolvedMode, active, setPreference],
  )

  return (
    <MobileThemeContext.Provider value={value}>
      <StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} />
      {children}
    </MobileThemeContext.Provider>
  )
}

export function useAppTheme() {
  return useContext(MobileThemeContext)
}
