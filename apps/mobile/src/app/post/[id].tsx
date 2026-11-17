import { useLocalSearchParams } from 'expo-router'
import { Conversation } from '../../components/conversation'

export default function PostDetail() {
  const { id, reply } = useLocalSearchParams<{ id: string; reply?: string }>()
  return <Conversation id={id} kind="posts" focusReply={reply === '1'} />
}
