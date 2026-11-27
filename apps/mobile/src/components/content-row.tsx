import { useState, type ReactNode } from 'react'
import { Pressable, Share, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Heart from 'lucide-react-native/icons/heart'
import MessageCircle from 'lucide-react-native/icons/message-circle'
import ArrowUp from 'lucide-react-native/icons/arrow-up'
import Repeat2 from 'lucide-react-native/icons/repeat-2'
import Share2 from 'lucide-react-native/icons/share-2'
import BadgeCheck from 'lucide-react-native/icons/badge-check'
import Flame from 'lucide-react-native/icons/flame'
import type { PostDto, Report, ProfileKind } from '../lib/types'
import { useSupportReport, useTogglePostLike, useTogglePostRepost } from '../hooks/use-content'
import { errorMessage } from '../lib/api'
import { formatCount, relativeTime } from '../lib/format'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'
import { Avatar, styles } from './ui'
import { ConfirmModal } from './confirm-modal'
import { FEED_MEDIA_MAX_HEIGHT } from '../lib/media-kind'
import { MediaCarousel } from './media-carousel'
import { ContentMenu } from './content-menu'
import { ContextNoteCard } from './context-note-card'

export const statusLabels: Record<string, string> = { OPEN: 'Aberto', UNDER_REVIEW: 'Em análise', IN_PROGRESS: 'Em andamento', RESOLVED: 'Resolvido', DISPUTED: 'Contestado', ARCHIVED: 'Arquivado' }
export function profileLink(author: PostDto['author']): { kind: ProfileKind; id: string } {
  if (author.orgType === 'POLITICIAN' && author.orgId) return { kind: 'politicians', id: author.orgId }
  if (author.orgType === 'ENTITY' && author.orgId) return { kind: 'entities', id: author.orgId }
  return { kind: 'users', id: author.userId }
}
export function Action({ label, icon, count, onPress, active, disabled }: { label: string; icon: ReactNode; count?: number; onPress: () => void; active?: boolean; disabled?: boolean }) {
  const { colors, theme } = useAppTheme()
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 40, minWidth: 42, opacity: pressed || disabled ? 0.5 : 1 })}>
    {icon}{count !== undefined && count > 0 && <Text style={{ fontSize: 12, fontFamily: theme.fonts.body, color: active ? colors.action : colors.muted }}>{count.toLocaleString('pt-BR')}</Text>}
  </Pressable>
}
function Author({ name, username, verified, time, onPress }: { name: string; username?: string | null; verified?: boolean; time: string; onPress?: () => void }) {
  const { colors, theme } = useAppTheme()
  return <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`Ver perfil de ${name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24 }}>
    <Text numberOfLines={1} style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: colors.primary, flexShrink: 1 }}>{name}</Text>
    {verified && <BadgeCheck size={14} color={colors.action} />}
    {!!username && <Text numberOfLines={1} style={{ fontSize: 12, color: colors.muted, flexShrink: 2 }}>@{username}</Text>}
    <Text style={{ color: colors.muted, fontSize: 12 }}>· {relativeTime(time)}</Text>
  </Pressable>
}
export function PostCard({ post, detail = false }: { post: PostDto; detail?: boolean }) {
  const { colors, theme } = useAppTheme()
  const user = useSession((s) => s.user)
  const like = useTogglePostLike(post.id)
  const repost = useTogglePostRepost(post.id)
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null)
  const target = profileLink(post.author)
  const name = post.author.orgName || post.author.name
  const open = () => router.push({ pathname: '/post/[id]', params: { id: post.id } })
  const openProfile = () => router.push({ pathname: '/profile/[kind]/[id]', params: target })
  const requireUser = (action: () => void) => user ? action() : router.push('/login')
  const cardShell = { backgroundColor: colors.surface, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: colors.border } as const
  const body = <>
    {!!post.content && <Text numberOfLines={detail ? undefined : 7} style={[styles.text, { color: colors.text }, detail && { fontSize: 18, lineHeight: 27 }]}>{post.content}</Text>}
    <MediaCarousel urls={post.media} items={post.mediaItems} limit={4} maxHeight={FEED_MEDIA_MAX_HEIGHT} />
    <ContextNoteCard type="POST" id={post.id} />
    {post.mentionedReport && <Pressable accessibilityRole="button" accessibilityLabel={`Abrir relato mencionado: ${post.mentionedReport.title}`} onPress={(event) => { event.stopPropagation(); router.push({ pathname: '/report/[id]', params: { id: post.mentionedReport!.id } }) }} style={{ borderWidth: 0.5, borderColor: colors.border, borderRadius: 12, padding: 12, marginTop: 10, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 11, color: colors.action, fontFamily: theme.fonts.medium }}>RELATO · {statusLabels[post.mentionedReport.status]}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Flame size={12} color={post.mentionedReport.pressureScore >= 7 ? '#E63946' : colors.muted} />
          <Text style={{ fontSize: 11, color: post.mentionedReport.pressureScore >= 7 ? '#E63946' : colors.muted, fontFamily: theme.fonts.medium }}>Pressão {Math.round(post.mentionedReport.pressureScore)}</Text>
        </View>
      </View>
      <Text style={[styles.text, { color: colors.text, fontFamily: theme.fonts.medium }]}>{post.mentionedReport.title}</Text>
    </Pressable>}
    {post.quotePost && <Pressable accessibilityRole="button" accessibilityLabel="Abrir publicação citada" onPress={(event) => { event.stopPropagation(); router.push({ pathname: '/post/[id]', params: { id: post.quotePost!.id } }) }} style={{ borderWidth: 0.5, borderColor: colors.border, borderRadius: 12, padding: 12, marginTop: 10 }}><Text style={{ fontFamily: theme.fonts.medium, color: colors.primary, marginBottom: 4 }}>{post.quotePost.author.orgName || post.quotePost.author.name}</Text><Text numberOfLines={3} style={[styles.text, { color: colors.text }]}>{post.quotePost.content}</Text></Pressable>}
    {post.poll && !detail && <View style={{ borderWidth: 0.5, borderColor: colors.border, borderRadius: 12, padding: 12, marginTop: 10, gap: 5 }}><Text style={[styles.text, { color: colors.text, fontFamily: theme.fonts.medium }]}>{post.poll.question || 'Enquete da comunidade'}</Text><Text style={{ fontSize: 12, color: colors.muted }}>{formatCount(post.poll.totalVotes, 'voto', 'votos')} · Ver enquete</Text></View>}
    {detail && <Text style={{ color: colors.muted, fontSize: 12, marginTop: 14 }}>{new Date(post.createdAt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', year: 'numeric' })}</Text>}
  </>
  const actions = <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
    <Action label={formatCount(post.commentsCount, 'resposta', 'respostas')} icon={<MessageCircle size={18} color={colors.muted} />} count={post.commentsCount} onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id, reply: '1' } })} />
    <Action label={post.repostedByMe ? 'Remover republicação' : 'Republicar'} icon={<Repeat2 size={19} color={post.repostedByMe ? colors.positive : colors.muted} />} count={post.repostsCount} onPress={() => requireUser(() => !repost.isPending && repost.mutate(undefined, { onError: (error) => setNotice({ title: 'Não foi possível republicar', message: errorMessage(error) }) }))} />
    <Action label={`${post.likedByMe ? 'Descurtir' : 'Curtir'} · ${formatCount(post.likesCount, 'curtida', 'curtidas')}`} icon={<Heart size={19} color={post.likedByMe ? colors.action : colors.muted} fill={post.likedByMe ? colors.action : 'transparent'} />} count={post.likesCount} active={post.likedByMe} onPress={() => requireUser(() => !like.isPending && like.mutate(undefined, { onError: (error) => setNotice({ title: 'Não foi possível curtir', message: errorMessage(error) }) }))} />
    <Action label="Compartilhar publicação" icon={<Share2 size={18} color={colors.muted} />} onPress={() => { void Share.share({ message: `${name} no Votz\n\n${post.content}` }).catch(() => {}) }} />
  </View>
  return <View style={[{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }, detail ? { backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border } : cardShell]}>
    {!detail && !!post.feedReason && <View accessibilityLabel={post.feedReason} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 50, marginBottom: 8 }}><Flame size={14} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12, fontFamily: theme.fonts.medium }}>{post.feedReason}</Text></View>}
    {!detail && post.repost && <Pressable accessibilityRole="button" accessibilityLabel={`${post.repost.user.name} repostou. Ver perfil`} onPress={() => router.push({ pathname: '/profile/[kind]/[id]', params: { kind: 'users', id: post.repost!.user.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 50, marginBottom: 10 }}><Repeat2 size={14} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12, flexShrink: 1 }}>{post.repost.user.name} repostou</Text></Pressable>}
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Ver perfil de ${name}`} onPress={openProfile}><Avatar name={name} uri={post.author.orgAvatarUrl || post.author.avatarUrl} size={40} /></Pressable>
      <View style={{ flex: 1 }}><View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><Author name={name} username={post.author.orgId ? null : post.author.username} verified={post.author.orgVerified || post.author.verified} time={post.createdAt} onPress={openProfile} /></View><View style={{ marginRight: -8, marginVertical: -8 }}><ContentMenu kind="post" id={post.id} ownerId={post.author.userId} author={{ ...target, name }} text={post.content} /></View></View>
        {!detail && <><Pressable accessibilityRole="button" accessibilityLabel="Abrir publicação" onPress={open}>{body}</Pressable>{actions}</>}
      </View>
    </View>
    {detail && <View style={{ marginTop: 14 }}>{body}{actions}</View>}
    <ConfirmModal visible={!!notice} title={notice?.title ?? ''} message={notice?.message} onClose={() => setNotice(null)} />
  </View>
}
export function ReportCard({ report, detail = false }: { report: Report; detail?: boolean }) {
  const { colors, theme } = useAppTheme()
  const user = useSession((s) => s.user)
  const support = useSupportReport(report.id, user?.id)
  const { data: myVotes } = useQuery<{ SUPPORT: boolean; ME_TOO: boolean }>({
    queryKey: ['report-votes', report.id, user?.id],
    queryFn: () => Promise.resolve({ SUPPORT: false, ME_TOO: false }),
    enabled: false,
  })
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null)
  const supported = !!myVotes?.SUPPORT
  const highPressure = report.pressureScore >= 7
  const name = report.anonymous ? 'Relato anônimo' : report.author?.name || 'Cidadão'
  const open = () => router.push({ pathname: '/report/[id]', params: { id: report.id } })
  const openProfile = report.author && !report.anonymous ? () => router.push({ pathname: '/profile/[kind]/[id]', params: { kind: 'users', id: report.author!.id } }) : undefined
  const handleSupport = () => {
    if (!user) {
      router.push('/login')
      return
    }
    if (!support.isPending) {
      support.mutate(undefined, {
        onError: (error) => setNotice({ title: 'Não foi possível apoiar', message: errorMessage(error) }),
      })
    }
  }
  const cardShell = { backgroundColor: colors.surface, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: colors.border } as const
  const body = <>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 4, flexWrap: 'wrap' }}>
      <Text style={{ fontSize: 10, fontFamily: theme.fonts.medium, color: colors.action }}>RELATO</Text>
      <Text style={{ fontSize: 11, color: report.status === 'RESOLVED' ? colors.positive : colors.muted }}>{statusLabels[report.status]}</Text>
      {!!report.city && <Text numberOfLines={1} style={{ fontSize: 11, color: colors.muted, flexShrink: 1 }}>· {report.city}</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: highPressure ? '#FEE2E2' : colors.soft }}>
        <Flame size={11} color={highPressure ? '#E63946' : colors.muted} />
        <Text style={{ fontSize: 11, fontFamily: theme.fonts.medium, color: highPressure ? '#991B1B' : colors.muted }}>Pressão {Math.round(report.pressureScore)}</Text>
      </View>
    </View>
    <Text style={{ fontFamily: theme.fonts.heading, fontSize: detail ? 23 : 17, lineHeight: detail ? 29 : 23, color: colors.primary }}>{report.title}</Text>
    <Text numberOfLines={detail ? undefined : 3} style={[styles.text, { color: colors.text, marginTop: 5 }]}>{report.description}</Text>
    <MediaCarousel urls={report.media} items={report.mediaItems} limit={5} />
    <ContextNoteCard type="REPORT" id={report.id} />
  </>
  return <View style={[{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: detail ? 16 : 4 }, detail ? { backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border } : cardShell]}>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Pressable disabled={!openProfile} onPress={openProfile} accessibilityRole={openProfile ? 'button' : undefined} accessibilityLabel={`Ver perfil de ${name}`}><Avatar name={name} uri={report.anonymous ? null : report.author?.avatarUrl} size={40} /></Pressable>
      <View style={{ flex: 1 }}><View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><Author name={name} time={report.createdAt} onPress={openProfile} /></View><View style={{ marginRight: -8, marginVertical: -8 }}><ContentMenu kind="report" id={report.id} ownerId={report.anonymous ? null : report.author?.id} text={`${report.title}\n\n${report.description}`} /></View></View>{!detail && <><Pressable accessibilityRole="button" accessibilityLabel={`Abrir relato: ${report.title}`} onPress={open}>{body}</Pressable><View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Action label={`${supported ? 'Retirar apoio' : 'Apoiar relato'} · ${formatCount(report._count.votes, 'apoio', 'apoios')}`} icon={<ArrowUp size={19} color={supported ? colors.action : colors.muted} />} count={report._count.votes} active={supported} disabled={support.isPending} onPress={handleSupport} />
        <Action label={formatCount(report._count.comments, 'comentário', 'comentários')} icon={<MessageCircle size={18} color={colors.muted} />} count={report._count.comments} onPress={() => router.push({ pathname: '/report/[id]', params: { id: report.id, reply: '1' } })} />
        <Action label="Compartilhar relato" icon={<Share2 size={18} color={colors.muted} />} onPress={() => { void Share.share({ message: `${report.title}\n\n${report.description}\n\nVotz` }).catch(() => {}) }} />
      </View></> }</View>
    </View>
    {detail && <View style={{ marginTop: 10 }}>{body}</View>}
    <ConfirmModal visible={!!notice} title={notice?.title ?? ''} message={notice?.message} onClose={() => setNotice(null)} />
  </View>
}
