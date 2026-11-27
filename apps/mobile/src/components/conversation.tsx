import { useEffect, useRef, useState } from 'react'
import { FlatList, Keyboard, Pressable, Text, TextInput, View } from 'react-native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Send from 'lucide-react-native/icons/send'
import X from 'lucide-react-native/icons/x'
import type { PostCommentDto } from '@votz/shared-types'
import { Screen, Toolbar } from './screen'
import { PostCard, ReportCard, profileLink } from './content-row'
import { ReportDetailPanel } from './report-timeline'
import { Avatar, Button, ErrorText, IconButton, State, styles } from './ui'
import { useComment, useComments, useDetail } from '../hooks/use-content'
import { patchItem } from '../lib/optimistic'
import { api, errorMessage, json } from '../lib/api'
import { formatCount, relativeTime } from '../lib/format'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'
import type { PostDto, Report, ReportComment } from '../lib/types'
import type { InputHandle } from './keyboard-context'

type Comment = PostCommentDto | ReportComment
type ReplyTarget = { id: string; name: string }
function commentAuthor(comment: Comment) {
  if ('userId' in comment.author) return { name: comment.author.orgName || comment.author.name, avatar: comment.author.orgAvatarUrl || comment.author.avatarUrl, target: profileLink(comment.author) }
  return { name: comment.author.name, avatar: comment.author.avatarUrl, target: { kind: 'users' as const, id: comment.author.id } }
}
function CommentRow({ comment, onReply, nested = false, parentId }: { comment: Comment; onReply: (target: ReplyTarget) => void; nested?: boolean; parentId?: string }) {
  const { colors, theme } = useAppTheme()
  const author = commentAuthor(comment)
  return <View style={{ paddingLeft: nested ? 22 : 16, paddingRight: 16, paddingTop: 12, backgroundColor: colors.surface, borderBottomWidth: nested ? 0 : 0.5, borderBottomColor: colors.border }}>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Ver perfil de ${author.name}`} onPress={() => router.push({ pathname: '/profile/[kind]/[id]', params: author.target })}><Avatar name={author.name} uri={author.avatar} size={nested ? 28 : 34} /></Pressable>
      <View style={{ flex: 1 }}><View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.primary, flexShrink: 1 }}>{author.name}</Text><Text style={{ fontSize: 11, color: colors.muted }}>· {relativeTime(comment.createdAt)}</Text></View>
        {!!comment.content && <Text style={[styles.text, { color: colors.text }]}>{comment.content}</Text>}
        {!!comment.mediaUrl && (comment.mediaType === 'IMAGE' || comment.mediaType === 'GIF') && <Image source={comment.mediaUrl} style={{ width: '100%', height: 180, marginTop: 8, borderRadius: 10 }} contentFit="contain" accessibilityLabel="Imagem da resposta" />}
        {!!comment.mediaUrl && (comment.mediaType === 'AUDIO' || comment.mediaType === 'VIDEO') && <Text style={{ color: colors.muted, fontSize: 12, paddingVertical: 8 }}>Anexo em {comment.mediaType === 'AUDIO' ? 'áudio' : 'vídeo'}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel={`Responder a ${author.name}`} onPress={() => onReply({ id: parentId || comment.id, name: author.name })} style={{ minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' }}><Text style={{ fontSize: 12, color: colors.muted }}>Responder</Text></Pressable>
      </View>
    </View>
    {!nested && comment.replies?.map((reply) => <CommentRow key={reply.id} comment={reply} onReply={onReply} nested parentId={comment.id} />)}
  </View>
}
function Poll({ post }: { post: PostDto }) {
  const { colors, theme } = useAppTheme()
  const client = useQueryClient()
  const user = useSession((s) => s.user)
  const vote = useMutation({
    mutationFn: (optionId: string) => api<NonNullable<PostDto['poll']>>(`/posts/${post.id}/poll/vote`, json({ optionId })),
    // O voto aparece na hora; a apuração do servidor só confirma.
    onMutate: async (optionId) => {
      await client.cancelQueries({ queryKey: ['posts'] })
      return { rollback: patchItem<PostDto>(client, ['posts'], post.id, (current) => current.poll ? { ...current, poll: { ...current.poll, myVoteOptionId: optionId, totalVotes: current.poll.totalVotes + 1, options: current.poll.options.map((option) => option.id === optionId ? { ...option, votesCount: option.votesCount + 1 } : option) } } : current) }
    },
    onError: (_error, _optionId, context) => context?.rollback(),
    onSuccess: (poll) => { patchItem<PostDto>(client, ['posts'], post.id, (current) => ({ ...current, poll })) },
  })
  if (!post.poll) return null
  const poll = post.poll
  const results = poll.expired || !!poll.myVoteOptionId
  return <View style={{ padding: 16, gap: 8, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={[styles.text, { color: colors.text, fontFamily: theme.fonts.medium }]}>{poll.question || 'Enquete da comunidade'}</Text>
    {poll.options.map((option) => { const percent = poll.totalVotes ? Math.round(option.votesCount * 100 / poll.totalVotes) : 0; return <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`${option.text}, ${percent}%${poll.myVoteOptionId === option.id ? ', seu voto' : ''}`} disabled={results || vote.isPending} onPress={() => user ? vote.mutate(option.id) : router.push('/login')} style={{ minHeight: 40, borderRadius: 9, borderWidth: 0.5, borderColor: results ? colors.border : colors.action, overflow: 'hidden', justifyContent: 'center' }}>
      {results && <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${percent}%`, backgroundColor: poll.myVoteOptionId === option.id ? colors.tint : colors.soft }} />}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ fontFamily: theme.fonts.medium, color: results ? colors.primary : colors.action }}>{option.text}{poll.myVoteOptionId === option.id ? ' ✓' : ''}</Text>{results && <Text style={{ color: colors.primary }}>{percent}%</Text>}</View>
    </Pressable> })}
    <Text style={{ color: colors.muted, fontSize: 12 }}>{formatCount(poll.totalVotes, 'voto', 'votos')}{poll.expired ? ' · Encerrada' : ''}</Text><ErrorText message={vote.isError ? errorMessage(vote.error) : undefined} />
  </View>
}
export function Conversation({ id, kind, focusReply }: { id: string; kind: 'posts' | 'reports'; focusReply?: boolean }) {
  const { colors, theme } = useAppTheme()
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
      <FlatList style={{ flex: 1, backgroundColor: colors.background }} data={comments.data || []} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: 18 }}
        ListHeaderComponent={<>{kind === 'posts' ? <><PostCard post={detail.data as PostDto} detail /><Poll post={detail.data as PostDto} /></> : <><ReportCard report={detail.data as Report} detail /><ReportDetailPanel report={detail.data as Report} /></>}<Text style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, fontSize: 14, fontFamily: theme.fonts.medium, color: colors.primary }}>Conversa</Text></>}
        renderItem={({ item }) => <CommentRow comment={item} onReply={reply} />}
        ListEmptyComponent={<State loading={comments.isPending} title={comments.isPending ? 'Carregando respostas…' : comments.isError ? 'Não foi possível carregar' : 'Comece a conversa'} description={comments.isError ? errorMessage(comments.error) : 'Sua participação faz a diferença.'} retry={comments.isError ? () => { void comments.refetch() } : undefined} />}
      />
      <View style={{ borderTopWidth: 0.5, borderTopColor: colors.border, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, backgroundColor: colors.surface }}>
        {target && <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 42 }}><Text numberOfLines={1} style={{ flex: 1, color: colors.muted, fontSize: 12 }}>Respondendo a {target.name}</Text><IconButton label="Cancelar resposta" onPress={() => setTarget(null)}><X size={16} color={colors.muted} /></IconButton></View>}
        <ErrorText message={send.isError ? errorMessage(send.error) : undefined} />
        {user ? <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}><View style={{ paddingBottom: 5 }}><Avatar name={user.name} uri={user.avatarUrl} size={30} /></View><TextInput ref={input} accessibilityLabel="Escrever resposta" placeholder={target ? `Responder a ${target.name}` : 'Escreva uma resposta…'} placeholderTextColor={colors.muted} value={value} onChangeText={setValue} maxLength={2000} multiline underlineColorAndroid="transparent" style={{ flex: 1, minHeight: 40, maxHeight: 110, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.soft, color: colors.text, fontFamily: theme.fonts.body, fontSize: 14 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Enviar resposta" disabled={!value.trim()} onPress={() => { const text = value.trim(), parent = target; setValue(''); setTarget(null); Keyboard.dismiss(); send.mutate({ content: text, ...(parent ? { parentId: parent.id } : {}) }, { onError: () => { setValue((current) => current || text); setTarget(parent) } }) }} style={{ width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.action, opacity: !value.trim() ? 0.4 : 1 }}><Send size={17} color={colors.onAccent} /></Pressable>
        </View> : <Button title="Entre para responder" onPress={() => router.push('/login')} />}
      </View>
    </>}
  </Screen>
}
