import { Tabs } from 'expo-router'
import House from 'lucide-react-native/icons/house'
import Compass from 'lucide-react-native/icons/compass'
import UserRound from 'lucide-react-native/icons/user-round'
import Map from 'lucide-react-native/icons/map'
import { theme } from '../../theme'

export default function TabLayout() {
  return <Tabs screenOptions={{
    headerShown: false, tabBarActiveTintColor: theme.colors.action, tabBarInactiveTintColor: theme.colors.muted,
    tabBarHideOnKeyboard: true,
    tabBarLabelStyle: { fontFamily: theme.fonts.medium, fontSize: 11 },
    tabBarStyle: { borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface },
    sceneStyle: { backgroundColor: theme.colors.background },
  }}>
    <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
    <Tabs.Screen name="explore" options={{ title: 'Explorar', tabBarIcon: ({ color, size }) => <Compass color={color} size={size} /> }} />
    <Tabs.Screen name="map" options={{ title: 'Mapa', tabBarIcon: ({ color, size }) => <Map color={color} size={size} /> }} />
    <Tabs.Screen name="account" options={{ title: 'Perfil', tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
  </Tabs>
}
