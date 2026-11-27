import { useLocalSearchParams } from 'expo-router'
import InstituteProfileScreen from '../../../screens/institute-profile-screen'

export default function InstituteProfileRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return <InstituteProfileScreen slug={slug ?? ''} />
}
