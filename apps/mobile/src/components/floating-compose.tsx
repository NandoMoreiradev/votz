import { Pressable } from 'react-native'
import { router } from 'expo-router'
import Feather from 'lucide-react-native/icons/feather'
import { useSession } from '../lib/session'
import { theme } from '../theme'

export function FloatingCompose() {
  const user = useSession((s) => s.user)
  return <Pressable accessibilityRole="button" accessibilityLabel="Criar publicação ou relato" onPress={() => router.push(user ? '/compose' : '/login')} style={({ pressed }) => ({ position: 'absolute', bottom: 18, right: 18, width: 54, height: 54, borderRadius: 27, backgroundColor: theme.colors.action, justifyContent: 'center', alignItems: 'center', elevation: 4, opacity: pressed ? 0.7 : 1 })}><Feather size={24} color={theme.colors.surface} /></Pressable>
}
