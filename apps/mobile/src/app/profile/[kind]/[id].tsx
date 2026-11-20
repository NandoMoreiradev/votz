import { useLocalSearchParams } from 'expo-router'
import ProfileScreen from '../../../screens/profile-screen'
import { Screen, Toolbar } from '../../../components/screen'
import { State } from '../../../components/ui'
import type { ProfileKind } from '../../../lib/types'

export default function Profile() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>()
  if (!['users', 'politicians', 'entities', 'companies'].includes(kind)) return <Screen><Toolbar title="Perfil" back /><State title="Perfil não encontrado" /></Screen>
  return <ProfileScreen kind={kind as ProfileKind} id={id} />
}
