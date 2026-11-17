import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Keyboard, Pressable, Text, TextInput, View } from 'react-native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ArrowUp from 'lucide-react-native/icons/arrow-up'
import Send from 'lucide-react-native/icons/send'
import X from 'lucide-react-native/icons/x'
import type { PostCommentDto } from '@votz/shared-types'
import { Screen, Toolbar } from './screen'
import { PostCard, ReportCard, profileLink } from './content-row'
import { Avatar, Button, ErrorText, IconButton, State, styles } from './ui'
import { useComment, useComments, useDetail } from '../hooks/use-content'
import { api, errorMessage, json } from '../lib/api'
import { formatCount, relativeTime } from '../lib/format'
import { useSession } from '../lib/session'
import type { PostDto, Report, ReportComment } from '../lib/types'
import { theme } from '../theme'
import type { InputHandle } from './keyboard-context'

type Comment = PostCommentDto | ReportComment
type ReplyTarget = { id: string; name: string }
function commentAuthor(comment: Comment) {
  if ('userId' in comment.author) return { name: comment.author.orgName || comment.author.name, avatar: comment.author.orgAvatarUrl || comment.author.avatarUrl, target: profileLink(comment.author) }
  return { name: comment.author.name, avatar: comment.author.avatarUrl, target: { kind: 'users' as const, id: comment.author.id } }
}
function CommentRow({ comment, onReply, nested = false, parentId }: { comment: Comment; onReply: (target: ReplyTarget) => void; nested?: boolean; parentId?: string }) {
  const author = commentAuthor(comment)
  return <View style={{ paddingLeft: nested ? 22 : 16, paddingRight: 16, paddingTop: 12, borderBottomWidth: nested ? 0 : 0.5, borderBottomColor: theme.colors.border }}>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Ver perfil de ${author.name}`} onPress={() => router.push({ pathname: '/profile/[kind]/[id]', params: author.target })}><Avatar name={author.name} uri={author.avatar} size={nested ? 28 : 34} /></Pressable>
      <View style={{ flex: 1 }}><View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: theme.colors.primary, flexShrink: 1 }}>{author.name}</Text><Text style={{ fontSize: 11, color: theme.colors.muted }}>· {relativeTime(comment.createdAt)}</Text></View>
        {!!comment.content && <Text style={styles.text}>{comment.content}</Text>}
        {!!comment.mediaUrl && (comment.mediaType === 'IMAGE' || comment.mediaType === 'GIF') && <Image source={comment.mediaUrl} style={{ width: '100%', height: 180, marginTop: 8, borderRadius: 10 }} contentFit="contain" accessibilityLabel="Imagem da resposta" />}
        {!!comment.mediaUrl && (comment.mediaType === 'AUDIO' || comment.mediaType === 'VIDEO') && <Text style={{ color: theme.colors.muted, fontSize: 12, paddingVertical: 8 }}>Anexo em {comment.mediaType === 'AUDIO' ? 'áudio' : 'vídeo'}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel={`Responder a ${author.name}`} onPress={() => onReply({ id: parentId || comment.id, name: author.name })} style={{ minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' }}><Text style={{ fontSize: 12, color: theme.colors.muted }}>Responder</Text></Pressable>
      </View>
    </View>
    {!nested && comment.replies?.map((reply) => <CommentRow key={reply.id} comment={reply} onReply={onReply} nested parentId={comment.id} />)}
  </View>
}
function Poll({ post }: { post: PostDto }) {
  const client = useQueryClient()
  const user = useSession((s) => s.user)
  const vote = useMutation({ mutationFn: (optionId: string) => api(`/posts/${post.id}/poll/vote`, json({ optionId })), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['posts'] }) } })
  if (!post.poll) return null
  const poll = post.poll
  const results = poll.expired || !!poll.myVoteOptionId
  return <View style={{ padding: 16, gap: 8, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }}><Text style={[styles.text, { fontFamily: theme.fonts.medium }]}>{poll.question || 'Enquete da comunidade'}</Text>
    {poll.options.map((option) => { const percent = poll.totalVotes ? Math.round(option.votesCount * 100 / poll.totalVotes) : 0; return <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`${option.text}, ${percent}%${poll.myVoteOptionId === option.id ? ', seu voto' : ''}`} disabled={results || vote.isPending} onPress={() => user ? vote.mutate(option.id) : router.push('/login')} style={{ minHeight: 40, borderRadius: 9, borderWidth: 0.5, borderColor: results ? theme.colors.border : theme.colors.action, overflow: 'hidden', justifyContent: 'center' }}>
      {results && <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${percent}%`, backgroundColor: poll.myVoteOptionId === option.id ? theme.colors.tint : theme.colors.soft }} />}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ fontFamily: theme.fonts.medium, color: results ? theme.colors.primary : theme.colors.action }}>{option.text}{poll.myVoteOptionId === option.id ? ' ✓' : ''}</Text>{results && <Text style={{ color: theme.colors.primary }}>{percent}%</Text>}</View>
    </Pressable> })}
    <Text style={{ color: theme.colors.muted, fontSize: 12 }}>{formatCount(poll.totalVotes, 'voto', 'votos')}{poll.expired ? ' · Encerrada' : ''}</Text><ErrorText message={vote.isError ? errorMessage(vote.error) : undefined} />
  </View>
}
function ReportActions({ report }: { report: Report }) {
  const user = useSession((s) => s.user)
  const client = useQueryClient()
  const votes = useQuery({ queryKey: ['report-votes', report.id, user?.id], queryFn: () => api<{ SUPPORT: boolean; ME_TOO: boolean }>(`/reports/${report.id}/votes/me`), enabled: !!user })
  const support = useMutation({ mutationFn: () => api<{ voted: boolean }>(`/reports/${report.id}/votes`, json({ type: 'SUPPORT' })), onSuccess: async (result) => {
    client.setQueryData(['report-votes', report.id, user?.id], { ...votes.data, SUPPORT: result.voted })
    await Promise.all([client.invalidateQueries({ queryKey: ['reports'] }), client.invalidateQueries({ queryKey: ['profile-reports'] })])
  } })
  const [memory, setMemory] = useState(false)
  return <View style={{ padding: 16, gap: 12, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Pressable accessibilityRole="button" accessibilityLabel={votes.data?.SUPPORT ? 'Retirar meu apoio' : 'Apoiar relato'} disabled={support.isPending || (!!user && (votes.isPending || votes.isError))} onPress={() => user ? support.mutate() : router.push('/login')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, borderRadius: 20, paddingHorizontal: 14, backgroundColor: votes.data?.SUPPORT ? theme.colors.tint : theme.colors.soft }}><ArrowUp size={18} color={theme.colors.action} /><Text style={{ fontFamily: theme.fonts.medium, color: theme.colors.action }}>{support.isPending ? 'Atualizando…' : votes.data?.SUPPORT ? 'Apoiado' : 'Apoiar'}</Text></Pressable><Text style={{ color: theme.colors.muted, fontSize: 12 }}>{formatCount(report._count.votes, 'apoio', 'apoios')} · {formatCount(report._count.comments, 'comentário', 'comentários')}</Text></View>
    <ErrorText message={support.isError ? errorMessage(support.error) : undefined} />
    {votes.isError && <Button secondary title="Consultar meu apoio" onPress={() => { void votes.refetch() }} />}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: memory }} onPress={() => setMemory(!memory)} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: theme.colors.primary }}>{memory ? 'Ocultar memória do relato −' : 'Ver memória do relato +'}</Text></Pressable>
    {memory && report.timeline?.map((event) => <View key={event.id} style={{ borderLeftWidth: 2, borderLeftColor: theme.colors.border, paddingLeft: 12, paddingVertical: 6, gap: 3 }}><Text style={styles.text}>{event.content}</Text><Text style={{ fontSize: 11, color: theme.colors.muted }}>{new Date(event.createdAt).toLocaleString('pt-BR')}</Text></View>)}
  </View>
}
export function Conversation({ id, kind, focusReply }: { id: string; kind: 'posts' | 'reports'; focusReply?: boolean }) {
  const detail = useDetail<PostDto | Report>(kind, id)
  const comments = useComments(id, kind)
  const send = useComment(id, kind)
  const user = useSession((s) => s.user)
  const [value, setValue] = useState('')
  const [target, setTarget] = useState<ReplyTarget | null>(null)
  const input = useRef<InputHandle>(null)
  const focusedId = useRef('')
  useEffect(() => { if (focusReply && user && detail.data && focusedId.current !== id) { focusedId.current = id; const timer = setTimeout(() => input.current?.focus(), 350); return () => clearTimeout(timer) } }, [focusReply, user, detail.data, id])
  const reply = (next: ReplyTarget) => { if (!user) { router.push('/login'); return }; setTarget(next); input.current?.focus() }
  return <Screen><Toolbar title={kind === 'posts' ? 'Publicação' : 'Relato'} back />
    {!detail.data ? <State loading={detail.isPending} title={detail.isPending ? 'Carregando…' : 'Não foi possível abrir'} description={detail.isError ? errorMessage(detail.error) : undefined} retry={() => { void detail.refetch() }} /> : <>
      <FlatList style={{ flex: 1 }} data={comments.data || []} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: 18 }}
        ListHeaderComponent={<>{kind === 'posts' ? <><PostCard post={detail.data as PostDto} detail /><Poll post={detail.data as PostDto} /></> : <><ReportCard report={detail.data as Report} detail /><ReportActions report={detail.data as Report} /></>}<Text style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, fontSize: 14, fontFamily: theme.fonts.medium, color: theme.colors.primary }}>Conversa</Text></>}
        renderItem={({ item }) => <CommentRow comment={item} onReply={reply} />}
        ListEmptyComponent={<State loading={comments.isPending} title={comments.isPending ? 'Carregando respostas…' : comments.isError ? 'Não foi possível carregar' : 'Comece a conversa'} description={comments.isError ? errorMessage(comments.error) : 'Sua participação faz a diferença.'} retry={comments.isError ? () => { void comments.refetch() } : undefined} />}
      />
      <View style={{ borderTopWidth: 0.5, borderTopColor: theme.colors.border, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, backgroundColor: theme.colors.surface }}>
        {target && <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 42 }}><Text numberOfLines={1} style={{ flex: 1, color: theme.colors.muted, fontSize: 12 }}>Respondendo a {target.name}</Text><IconButton label="Cancelar resposta" onPress={() => setTarget(null)}><X size={16} color={theme.colors.muted} /></IconButton></View>}
        <ErrorText message={send.isError ? errorMessage(send.error) : undefined} />
        {user ? <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}><View style={{ paddingBottom: 5 }}><Avatar name={user.name} uri={user.avatarUrl} size={30} /></View><TextInput ref={input} accessibilityLabel="Escrever resposta" placeholder={target ? `Responder a ${target.name}` : 'Escreva uma resposta…'} placeholderTextColor={theme.colors.muted} value={value} onChangeText={setValue} maxLength={2000} multiline editable={!send.isPending} underlineColorAndroid="transparent" style={{ flex: 1, minHeight: 40, maxHeight: 110, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20, backgroundColor: theme.colors.soft, color: theme.colors.text, fontFamily: theme.fonts.body, fontSize: 14 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Enviar resposta" disabled={!value.trim() || send.isPending} onPress={() => send.mutate({ content: value.trim(), ...(target ? { parentId: target.id } : {}) }, { onSuccess: () => { setValue(''); setTarget(null); Keyboard.dismiss() } })} style={{ width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.action, opacity: !value.trim() || send.isPending ? 0.4 : 1 }}>{send.isPending ? <ActivityIndicator color={theme.colors.surface} size="small" /> : <Send size={17} color={theme.colors.surface} />}</Pressable>
        </View> : <Button title="Entre para responder" onPress={() => router.push('/login')} />}
      </View>
    </>}
  </Screen>
}
