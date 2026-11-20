import type { ReactNode } from 'react'
import { Alert, Pressable, Share, Text, View } from 'react-native'
import { router } from 'expo-router'
import Heart from 'lucide-react-native/icons/heart'
import MessageCircle from 'lucide-react-native/icons/message-circle'
import ArrowUp from 'lucide-react-native/icons/arrow-up'
import Repeat2 from 'lucide-react-native/icons/repeat-2'
import Share2 from 'lucide-react-native/icons/share-2'
import BadgeCheck from 'lucide-react-native/icons/badge-check'
import type { PostDto, Report, ProfileKind } from '../lib/types'
import { useAction } from '../hooks/use-content'
import { errorMessage } from '../lib/api'
import { formatCount, relativeTime } from '../lib/format'
import { useSession } from '../lib/session'
import { theme } from '../theme'
import { Avatar, styles } from './ui'
import { MediaCarousel } from './media-carousel'

export const statusLabels: Record<string, string> = { OPEN: 'Aberto', UNDER_REVIEW: 'Em análise', IN_PROGRESS: 'Em andamento', RESOLVED: 'Resolvido', DISPUTED: 'Contestado', ARCHIVED: 'Arquivado' }
export function profileLink(author: PostDto['author']): { kind: ProfileKind; id: string } {
  if (author.orgType === 'POLITICIAN' && author.orgId) return { kind: 'politicians', id: author.orgId }
  if (author.orgType === 'ENTITY' && author.orgId) return { kind: 'entities', id: author.orgId }
  return { kind: 'users', id: author.userId }
}
export function Action({ label, icon, count, onPress, active, disabled }: { label: string; icon: ReactNode; count?: number; onPress: () => void; active?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 40, minWidth: 42, opacity: pressed || disabled ? 0.5 : 1 })}>
    {icon}{count !== undefined && count > 0 && <Text style={{ fontSize: 12, fontFamily: theme.fonts.body, color: active ? theme.colors.action : theme.colors.muted }}>{count.toLocaleString('pt-BR')}</Text>}
  </Pressable>
}
function Author({ name, username, verified, time, onPress }: { name: string; username?: string | null; verified?: boolean; time: string; onPress?: () => void }) {
  return <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`Ver perfil de ${name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24 }}>
    <Text numberOfLines={1} style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: theme.colors.primary, flexShrink: 1 }}>{name}</Text>
    {verified && <BadgeCheck size={14} color={theme.colors.action} />}
    {!!username && <Text numberOfLines={1} style={{ fontSize: 12, color: theme.colors.muted, flexShrink: 2 }}>@{username}</Text>}
    <Text style={{ color: theme.colors.muted, fontSize: 12 }}>· {relativeTime(time)}</Text>
  </Pressable>
}
export function PostCard({ post, detail = false }: { post: PostDto; detail?: boolean }) {
  const user = useSession((s) => s.user)
  const like = useAction(`/posts/${post.id}/like`, ['posts'])
  const repost = useAction(`/posts/${post.id}/repost`, ['posts'])
  const target = profileLink(post.author)
  const name = post.author.orgName || post.author.name
  const open = () => router.push({ pathname: '/post/[id]', params: { id: post.id } })
  const openProfile = () => router.push({ pathname: '/profile/[kind]/[id]', params: target })
  const requireUser = (action: () => void) => user ? action() : router.push('/login')
  const body = <>
    {!!post.content && <Text numberOfLines={detail ? undefined : 7} style={[styles.text, detail && { fontSize: 18, lineHeight: 27 }]}>{post.content}</Text>}
    <MediaCarousel urls={post.media} limit={4} />
    {post.mentionedReport && <Pressable accessibilityRole="button" accessibilityLabel={`Abrir relato mencionado: ${post.mentionedReport.title}`} onPress={(event) => { event.stopPropagation(); router.push({ pathname: '/report/[id]', params: { id: post.mentionedReport!.id } }) }} style={{ borderWidth: 0.5, borderColor: theme.colors.border, borderRadius: 12, padding: 12, marginTop: 10, gap: 4 }}>
      <Text style={{ fontSize: 11, color: theme.colors.action, fontFamily: theme.fonts.medium }}>RELATO · {statusLabels[post.mentionedReport.status]}</Text><Text style={[styles.text, { fontFamily: theme.fonts.medium }]}>{post.mentionedReport.title}</Text>
    </Pressable>}
    {post.quotePost && <Pressable accessibilityRole="button" accessibilityLabel="Abrir publicação citada" onPress={(event) => { event.stopPropagation(); router.push({ pathname: '/post/[id]', params: { id: post.quotePost!.id } }) }} style={{ borderWidth: 0.5, borderColor: theme.colors.border, borderRadius: 12, padding: 12, marginTop: 10 }}><Text style={{ fontFamily: theme.fonts.medium, color: theme.colors.primary, marginBottom: 4 }}>{post.quotePost.author.orgName || post.quotePost.author.name}</Text><Text numberOfLines={3} style={styles.text}>{post.quotePost.content}</Text></Pressable>}
    {post.poll && !detail && <View style={{ borderWidth: 0.5, borderColor: theme.colors.border, borderRadius: 12, padding: 12, marginTop: 10, gap: 5 }}><Text style={[styles.text, { fontFamily: theme.fonts.medium }]}>{post.poll.question || 'Enquete da comunidade'}</Text><Text style={{ fontSize: 12, color: theme.colors.muted }}>{formatCount(post.poll.totalVotes, 'voto', 'votos')} · Ver enquete</Text></View>}
    {detail && <Text style={{ color: theme.colors.muted, fontSize: 12, marginTop: 14 }}>{new Date(post.createdAt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', year: 'numeric' })}</Text>}
  </>
  const actions = <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
    <Action label={formatCount(post.commentsCount, 'resposta', 'respostas')} icon={<MessageCircle size={18} color={theme.colors.muted} />} count={post.commentsCount} onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id, reply: '1' } })} />
    <Action label={post.repostedByMe ? 'Remover republicação' : 'Republicar'} icon={<Repeat2 size={19} color={post.repostedByMe ? theme.colors.positive : theme.colors.muted} />} count={post.repostsCount} disabled={repost.isPending} onPress={() => requireUser(() => repost.mutate(undefined, { onError: (error) => Alert.alert('Não foi possível republicar', errorMessage(error)) }))} />
    <Action label={`${post.likedByMe ? 'Descurtir' : 'Curtir'} · ${formatCount(post.likesCount, 'curtida', 'curtidas')}`} icon={<Heart size={19} color={post.likedByMe ? theme.colors.action : theme.colors.muted} fill={post.likedByMe ? theme.colors.action : 'transparent'} />} count={post.likesCount} active={post.likedByMe} disabled={like.isPending} onPress={() => requireUser(() => like.mutate(undefined, { onError: (error) => Alert.alert('Não foi possível curtir', errorMessage(error)) }))} />
    <Action label="Compartilhar publicação" icon={<Share2 size={18} color={theme.colors.muted} />} onPress={() => { void Share.share({ message: `${name} no Votz\n\n${post.content}` }).catch(() => {}) }} />
  </View>
  return <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }}>
    {!detail && post.repost && <Pressable accessibilityRole="button" accessibilityLabel={`${post.repost.user.name} repostou. Ver perfil`} onPress={() => router.push({ pathname: '/profile/[kind]/[id]', params: { kind: 'users', id: post.repost!.user.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 50, marginBottom: 10 }}><Repeat2 size={14} color={theme.colors.muted} /><Text style={{ color: theme.colors.muted, fontSize: 12, flexShrink: 1 }}>{post.repost.user.name} repostou</Text></Pressable>}
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Ver perfil de ${name}`} onPress={openProfile}><Avatar name={name} uri={post.author.orgAvatarUrl || post.author.avatarUrl} size={40} /></Pressable>
      <View style={{ flex: 1 }}><Author name={name} username={post.author.orgId ? null : post.author.username} verified={post.author.orgVerified || post.author.verified} time={post.createdAt} onPress={openProfile} />
        {!detail && <><Pressable accessibilityRole="button" accessibilityLabel="Abrir publicação" onPress={open}>{body}</Pressable>{actions}</>}
      </View>
    </View>
    {detail && <View style={{ marginTop: 14 }}>{body}{actions}</View>}
  </View>
}
export function ReportCard({ report, detail = false }: { report: Report; detail?: boolean }) {
  const name = report.anonymous ? 'Relato anônimo' : report.author?.name || 'Cidadão'
  const open = () => router.push({ pathname: '/report/[id]', params: { id: report.id } })
  const openProfile = report.author && !report.anonymous ? () => router.push({ pathname: '/profile/[kind]/[id]', params: { kind: 'users', id: report.author!.id } }) : undefined
  const body = <>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 4 }}><Text style={{ fontSize: 10, fontFamily: theme.fonts.medium, color: theme.colors.action }}>RELATO</Text><Text style={{ fontSize: 11, color: report.status === 'RESOLVED' ? theme.colors.positive : theme.colors.muted }}>{statusLabels[report.status]}</Text>{!!report.city && <Text numberOfLines={1} style={{ fontSize: 11, color: theme.colors.muted, flexShrink: 1 }}>· {report.city}</Text>}</View>
    <Text style={{ fontFamily: theme.fonts.heading, fontSize: detail ? 23 : 17, lineHeight: detail ? 29 : 23, color: theme.colors.primary }}>{report.title}</Text>
    <Text numberOfLines={detail ? undefined : 3} style={[styles.text, { marginTop: 5 }]}>{report.description}</Text>
    <MediaCarousel urls={report.media} limit={5} />
  </>
  return <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: detail ? 16 : 4, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }}>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Pressable disabled={!openProfile} onPress={openProfile} accessibilityRole={openProfile ? 'button' : undefined} accessibilityLabel={`Ver perfil de ${name}`}><Avatar name={name} uri={report.anonymous ? null : report.author?.avatarUrl} size={40} /></Pressable>
      <View style={{ flex: 1 }}><Author name={name} time={report.createdAt} onPress={openProfile} />{!detail && <><Pressable accessibilityRole="button" accessibilityLabel={`Abrir relato: ${report.title}`} onPress={open}>{body}</Pressable><View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Action label={formatCount(report._count.votes, 'apoio', 'apoios')} icon={<ArrowUp size={19} color={theme.colors.muted} />} count={report._count.votes} onPress={open} />
        <Action label={formatCount(report._count.comments, 'comentário', 'comentários')} icon={<MessageCircle size={18} color={theme.colors.muted} />} count={report._count.comments} onPress={() => router.push({ pathname: '/report/[id]', params: { id: report.id, reply: '1' } })} />
        <Action label="Compartilhar relato" icon={<Share2 size={18} color={theme.colors.muted} />} onPress={() => { void Share.share({ message: `${report.title}\n\n${report.description}\n\nVotz` }).catch(() => {}) }} />
      </View></> }</View>
    </View>
    {detail && <View style={{ marginTop: 10 }}>{body}</View>}
  </View>
}
