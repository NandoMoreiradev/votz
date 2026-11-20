import { useLocalSearchParams } from 'expo-router'
import DebateScreen from '../../screens/debate-screen'

export default function DebateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <DebateScreen id={id} />
}
