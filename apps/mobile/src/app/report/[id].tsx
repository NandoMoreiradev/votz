import { useLocalSearchParams } from 'expo-router'
import { Conversation } from '../../components/conversation'

export default function ReportDetail() {
  const { id, reply } = useLocalSearchParams<{ id: string; reply?: string }>()
  return <Conversation id={id} kind="reports" focusReply={reply === '1'} />
}
