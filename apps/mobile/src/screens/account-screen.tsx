import { useMutation } from '@tanstack/react-query'
import { router } from 'expo-router'
import { View } from 'react-native'
import { Button, ErrorText, Heading, Label } from '../components/ui'
import { Brand, Screen, Toolbar } from '../components/screen'
import { useSession } from '../lib/session'
import ProfileScreen from './profile-screen'

export default function AccountScreen() {
  const { user, restoreError, restore } = useSession()
  const retry = useMutation({ mutationFn: restore })
  if (user) return <ProfileScreen kind="users" id={user.id} tabs />
  return <Screen tabs><Toolbar title="Perfil" /><View style={{ flex: 1, padding: 28, justifyContent: 'center', gap: 18 }}><Brand /><Heading>Sua comunidade começa com você.</Heading><Label muted>Entre para compartilhar ideias, acompanhar pessoas e participar das mudanças da sua cidade.</Label><Button title="Entrar no Votz" onPress={() => router.push('/login')} />{restoreError && <><ErrorText message="Não foi possível recuperar sua sessão." /><Button title="Tentar recuperar sessão" secondary loading={retry.isPending} onPress={() => retry.mutate()} /></>}</View></Screen>
}
