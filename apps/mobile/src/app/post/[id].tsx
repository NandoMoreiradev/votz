import { FlatList, View } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useState } from 'react'
import { PostCard } from '../../components/content-card'
import { Button, Card, ErrorText, Field, Heading, Label, State, styles } from '../../components/ui'
import { useComment, useComments, useDetail } from '../../hooks/use-content'
import { api, errorMessage, json } from '../../lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../../lib/session'
import type { PostDto } from '../../lib/types'
import { formatCount } from '../../lib/format'

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const post = useDetail<PostDto>('posts', id)
  const comments = useComments(id)
  const comment = useComment(id)
  const [content, setContent] = useState('')
  const user = useSession((s) => s.user)
  const client = useQueryClient()
  const vote = useMutation({ mutationFn: (optionId: string) => api(`/posts/${id}/poll/vote`, json({ optionId })), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['posts'] }) } })
  if (!post.data) return <State loading={post.isPending} title={post.isPending ? 'Abrindo publicação' : 'Não foi possível abrir'} description={post.isError ? errorMessage(post.error) : undefined} retry={() => { void post.refetch() }} />
  return <FlatList style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" data={comments.data || []} keyExtractor={(item) => item.id} ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
    ListHeaderComponent={<View style={{ gap: 18, marginBottom: 18 }}><PostCard post={post.data} detail />
      {post.data.poll && <Card><Heading>{post.data.poll.question || 'Enquete'}</Heading>{post.data.poll.options.map((option) => <Button key={option.id} title={`${option.text} · ${formatCount(option.votesCount, 'voto', 'votos')}${post.data?.poll?.myVoteOptionId === option.id ? ' · Seu voto' : ''}`} secondary disabled={post.data?.poll?.expired || vote.isPending || !!post.data?.poll?.myVoteOptionId} onPress={() => user ? vote.mutate(option.id) : router.push('/login')} />)}<Label muted>{post.data.poll.expired ? 'Enquete encerrada' : formatCount(post.data.poll.totalVotes, 'voto', 'votos')}</Label><ErrorText message={vote.isError ? errorMessage(vote.error) : undefined} /></Card>}
      <Heading>Conversa da comunidade</Heading>
      {user ? <Card><Field label="Seu comentário" placeholder="Contribua com a conversa" value={content} onChangeText={setContent} multiline maxLength={2000} /><ErrorText message={comment.isError ? errorMessage(comment.error) : undefined} /><Button title="Comentar" loading={comment.isPending} disabled={!content.trim()} onPress={() => comment.mutate(content.trim(), { onSuccess: () => setContent('') })} /></Card> : <Button title="Entre para comentar" onPress={() => router.push('/login')} />}
    </View>}
    renderItem={({ item }) => <Card><Label>{item.author.orgName || item.author.name}</Label><Label>{item.content || 'Comentário com mídia'}</Label><Label muted>{new Date(item.createdAt).toLocaleDateString('pt-BR')}</Label></Card>}
    ListEmptyComponent={<State loading={comments.isPending} title={comments.isError ? 'Não foi possível carregar comentários' : comments.isPending ? 'Carregando conversa' : 'Seja o primeiro a comentar'} retry={comments.isError ? () => { void comments.refetch() } : undefined} />}
  />
}
