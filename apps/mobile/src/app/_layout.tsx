import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import { router, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular'
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold'
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold'
import { QueryClientProvider, focusManager } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { queryClient } from '../lib/query-client'
import { useSession } from '../lib/session'
import { theme } from '../theme'
import { ConversationsLive } from '../hooks/use-conversations'
import { DeviceLinkPrompt } from '../components/device-link-prompt'
import { subscribeChatPushOpen } from '../lib/chat-push'

void SplashScreen.preventAutoHideAsync()
export { ErrorBoundary } from 'expo-router'

export default function RootLayout() {
  const [loaded, fontError] = useFonts({ Inter_400Regular, Inter_600SemiBold, SpaceGrotesk_700Bold })
  const ready = useSession((s) => s.ready)
  useEffect(() => { void useSession.getState().restore() }, [])
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (Platform.OS !== 'web') focusManager.setFocused(state === 'active')
    })
    return () => listener.remove()
  }, [])
  useEffect(() => {
    return subscribeChatPushOpen((conversationId) => {
      if (useSession.getState().user)
        router.push({ pathname: '/conversation/[id]', params: { id: conversationId } })
    })
  }, [])
  useEffect(() => { if ((loaded || fontError) && ready) void SplashScreen.hideAsync() }, [loaded, fontError, ready])
  if ((!loaded && !fontError) || !ready) return null
  return <SafeAreaProvider><QueryClientProvider client={queryClient}>
    <ConversationsLive />
    <DeviceLinkPrompt />
    <StatusBar style="dark" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: 'Sua conta Votz', presentation: 'modal' }} />
      <Stack.Screen name="compose" options={{ title: 'Sua voz importa', presentation: 'modal' }} />
      <Stack.Screen name="post/[id]" options={{ title: 'Publicação' }} />
      <Stack.Screen name="report/[id]" options={{ title: 'Relato' }} />
      <Stack.Screen name="profile/[kind]/[id]" options={{ title: 'Perfil público' }} />
      <Stack.Screen name="debates" options={{ title: 'Debates' }} />
      <Stack.Screen name="debate/[id]" options={{ title: 'Debate' }} />
    </Stack>
  </QueryClientProvider></SafeAreaProvider>
}
