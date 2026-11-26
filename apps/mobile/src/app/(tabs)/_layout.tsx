import { Tabs } from 'expo-router'
import House from 'lucide-react-native/icons/house'
import Compass from 'lucide-react-native/icons/compass'
import UserRound from 'lucide-react-native/icons/user-round'
import Map from 'lucide-react-native/icons/map'
import MessageCircle from 'lucide-react-native/icons/message-circle'
import { useConversationCapabilities } from '../../hooks/use-conversations'
import { useSession } from '../../lib/session'
import { useAppTheme } from '../../theme-context'

export default function TabLayout() {
  const user = useSession((s) => s.user)
  const conversations = useConversationCapabilities()
  const { colors, theme } = useAppTheme()
  return <Tabs screenOptions={{
    headerShown: false, tabBarActiveTintColor: colors.action, tabBarInactiveTintColor: colors.muted,
    tabBarHideOnKeyboard: true,
    tabBarLabelStyle: { fontFamily: theme.fonts.medium, fontSize: 11 },
    tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.surface },
    sceneStyle: { backgroundColor: colors.background },
  }}>
    <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
    <Tabs.Screen name="explore" options={{ title: 'Explorar', tabBarIcon: ({ color, size }) => <Compass color={color} size={size} /> }} />
    <Tabs.Screen name="map" options={{ title: 'Mapa', tabBarIcon: ({ color, size }) => <Map color={color} size={size} /> }} />
    <Tabs.Screen name="conversations" options={{ title: 'Conversas', href: conversations.data?.enabled || user ? undefined : null, tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} /> }} />
    <Tabs.Screen name="account" options={{ title: 'Perfil', tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
  </Tabs>
}
