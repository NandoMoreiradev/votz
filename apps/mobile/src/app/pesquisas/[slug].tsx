import { useLocalSearchParams } from 'expo-router'
import SurveyDetailScreen from '../../screens/survey-detail-screen'

export default function SurveyDetailRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return <SurveyDetailScreen slug={slug ?? ''} />
}
