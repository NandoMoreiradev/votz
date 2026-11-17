import { Alert, Pressable, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import Heart from 'lucide-react-native/icons/heart'
import MessageCircle from 'lucide-react-native/icons/message-circle'
import ArrowUpRight from 'lucide-react-native/icons/arrow-up-right'
import type { PostDto, Report, ProfileKind } from '../lib/types'
import { useAction } from '../hooks/use-content'
import { errorMessage } from '../lib/api'
import { formatCount } from '../lib/format'
import { useSession } from '../lib/session'
import { theme } from '../theme'
import { Avatar, Card, Label, styles } from './ui'

export const statusLabels: Record<string, string> = { OPEN: 'Aberto', UNDER_REVIEW: 'Em análise', IN_PROGRESS: 'Em andamento', RESOLVED: 'Resolvido', DISPUTED: 'Contestado', ARCHIVED: 'Arquivado' }
export function profileLink(author: PostDto['author']): { kind: ProfileKind; id: string } {
  if (author.orgType === 'POLITICIAN' && author.orgId) return { kind: 'politicians', id: author.orgId }
  if (author.orgType === 'ENTITY' && author.orgId) return { kind: 'entities', id: author.orgId }
  return { kind: 'users', id: author.userId }
}
export function PostCard({ post, detail = false }: { post: PostDto; detail?: boolean }) {
  const user = useSession((s) => s.user)
  const like = useAction(`/posts/${post.id}/like`, ['posts'])
  const target = profileLink(post.author)
  const name = post.author.orgName || post.author.name
  return <Card>
    <Pressable accessibilityRole="button" accessibilityLabel={`Ver perfil de ${name}`} onPress={() => router.push({ pathname: '/profile/[kind]/[id]', params: target })} style={styles.row}>
      <Avatar name={name} uri={post.author.orgAvatarUrl || post.author.avatarUrl} />
      <View style={{ flex: 1 }}><Label>{name}{(post.author.orgVerified || post.author.verified) ? ' · Verificado' : ''}</Label><Label muted>{post.author.orgSubtitle || 'Comunidade Votz'}</Label></View>
    </Pressable>
    <Pressable disabled={detail} accessibilityRole={detail ? undefined : 'button'} accessibilityLabel="Abrir publicação" onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })} style={{ gap: 12 }}>
      {!!post.content && <Text numberOfLines={detail ? undefined : 7} style={styles.text}>{post.content}</Text>}
      {post.media.filter((url) => !/\.(mp4|mov|webm)(\?|$)/i.test(url)).slice(0, detail ? 4 : 1).map((url) => <Image key={url} source={url} recyclingKey={url} style={{ width: '100%', height: 240, borderRadius: theme.radius.sm }} contentFit="cover" accessibilityLabel="Imagem da publicação" />)}
      {post.mentionedReport && <Card><Label>Relato mencionado</Label><Label>{post.mentionedReport.title}</Label></Card>}
      {post.quotePost && <Card><Label>{post.quotePost.author.orgName || post.quotePost.author.name}</Label><Label>{post.quotePost.content}</Label></Card>}
      {post.poll && <Label muted>Enquete: {post.poll.question || 'Vote na publicação'} · {formatCount(post.poll.totalVotes, 'voto', 'votos')}</Label>}
      <Label muted>{new Date(post.createdAt).toLocaleDateString('pt-BR')}{post.city ? ` · ${post.city}` : ''}</Label>
    </Pressable>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${post.likedByMe ? 'Descurtir' : 'Curtir'} publicação, ${formatCount(post.likesCount, 'curtida', 'curtidas')}`} disabled={like.isPending} onPress={() => {
        if (!user) { router.push('/login'); return }
        like.mutate(undefined, { onError: (error) => Alert.alert('Não foi possível curtir', errorMessage(error)) })
      }} style={[styles.row, { minHeight: 44, paddingHorizontal: 8 }]}><Heart size={20} color={post.likedByMe ? theme.colors.action : theme.colors.muted} fill={post.likedByMe ? theme.colors.action : 'transparent'} /><Label muted>{post.likesCount}</Label></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${formatCount(post.commentsCount, 'comentário', 'comentários')}`} onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })} style={[styles.row, { minHeight: 44, paddingHorizontal: 8 }]}><MessageCircle size={20} color={theme.colors.muted} /><Label muted>{post.commentsCount}</Label></Pressable>
    </View>
  </Card>
}
export function ReportCard({ report, detail = false }: { report: Report; detail?: boolean }) {
  return <Pressable disabled={detail} accessibilityRole={detail ? undefined : 'button'} accessibilityLabel={`Abrir relato: ${report.title}`} onPress={() => router.push({ pathname: '/report/[id]', params: { id: report.id } })}>
    <Card>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><Text style={{ color: theme.colors.action, fontFamily: theme.fonts.medium, fontSize: 12, letterSpacing: 1 }}>RELATO DA COMUNIDADE</Text><ArrowUpRight size={20} color={theme.colors.muted} /></View>
      <Text style={{ fontFamily: theme.fonts.heading, fontSize: 21, color: theme.colors.primary }}>{report.title}</Text>
      <Text numberOfLines={detail ? undefined : 3} style={styles.text}>{report.description}</Text>
      {!!report.media[0] && <Image source={report.media[0]} recyclingKey={report.media[0]} style={{ height: 210, borderRadius: theme.radius.sm }} contentFit="cover" accessibilityLabel="Imagem do relato" />}
      <View style={styles.row}><Text style={{ color: report.status === 'RESOLVED' ? theme.colors.positive : theme.colors.action, fontFamily: theme.fonts.medium }}>{statusLabels[report.status] || report.status}</Text><Label muted>{report.city || 'Local não informado'}</Label></View>
      <Label muted>{formatCount(report._count.votes, 'apoio', 'apoios')} · {formatCount(report._count.comments, 'comentário', 'comentários')}</Label>
      <Label muted>{report.anonymous ? 'Relato anônimo' : report.author?.name || 'Cidadão'} · {new Date(report.createdAt).toLocaleDateString('pt-BR')}</Label>
    </Card>
  </Pressable>
}
