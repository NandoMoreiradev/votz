import { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router, type Href } from 'expo-router'
import { useMutation } from '@tanstack/react-query'
import MoreHorizontal from 'lucide-react-native/icons/more-horizontal'
import BadgeCheck from 'lucide-react-native/icons/badge-check'
import MapPin from 'lucide-react-native/icons/map-pin'
import CalendarDays from 'lucide-react-native/icons/calendar-days'
import UserPen from 'lucide-react-native/icons/user-pen'
import Palette from 'lucide-react-native/icons/palette'
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import ClipboardCheck from 'lucide-react-native/icons/clipboard-check'
import LogOut from 'lucide-react-native/icons/log-out'
import { THEME_PREFERENCE_LABELS, type ThemePreference } from '@votz/shared-types'
import { Avatar, Button, ErrorText, IconButton, State, TabStrip, styles } from '../components/ui'
import { Screen, Toolbar } from '../components/screen'
import { ActionSheet, type SheetItem } from '../components/action-sheet'
import { ChoiceSheet } from '../components/choice-sheet'
import { ConfirmModal } from '../components/confirm-modal'
import { PostCard, statusLabels } from '../components/content-row'
import { FloatingCompose } from '../components/floating-compose'
import { useDetail, useFollowing, useProfilePosts, useProfileReports, useToggleFollow } from '../hooks/use-content'
import { useConversationAction, useConversationCapabilities } from '../hooks/use-conversations'
import { ORG_BY_KIND } from '../hooks/use-page-inbox'
import { errorMessage } from '../lib/api'
import { SECTOR_LABELS, formatCount, relativeTime } from '../lib/format'
import { useSession } from '../lib/session'
import { useContextNotesEnabled } from '../hooks/use-context-notes'
import { useSurveysEnabled } from '../hooks/use-surveys'
import { useAppTheme } from '../theme-context'
import type { PostDto, ProfileKind, PublicProfile, ReportSummary } from '../lib/types'

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'SYSTEM', label: 'Automático (sistema)' },
  { value: 'LIGHT', label: 'Claro' },
  { value: 'DARK', label: 'Escuro' },
]

export default function ProfileScreen({ kind, id, tabs = false }: { kind: ProfileKind; id: string; tabs?: boolean }) {
  const user = useSession((s) => s.user)
  const contextEnabled = useContextNotesEnabled()
  const surveysEnabled = useSurveysEnabled()
  const { preference: themePref, setPreference: setThemePref, colors, theme } = useAppTheme()
  const [accountSheetOpen, setAccountSheetOpen] = useState(false)
  const [themeSheetOpen, setThemeSheetOpen] = useState(false)
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null)
  const own = kind === 'users' && user?.id === id
  const company = kind === 'companies'
  const profile = useDetail<PublicProfile>(kind, id)
  const posts = useProfilePosts(kind, id)
  const reports = useProfileReports(kind, id)
  const following = useFollowing(kind, id, !!user && !own)
  const toggle = useToggleFollow(kind, id)
  // Mensagem só para cidadãos com conta: político, entidade e empresa ainda não recebem conversa.
  const capabilities = useConversationCapabilities()
  const startChat = useConversationAction()
  const canMessage = kind === 'users' && !own && !!user && !!capabilities.data?.messagingEnabled
  const pageOrgType = ORG_BY_KIND[kind]
  const canMessagePage = !!pageOrgType && !!user
  const logout = useMutation({ mutationFn: () => useSession.getState().logout() })
  const [tab, setTab] = useState<'posts' | 'reports'>(company ? 'reports' : 'posts')
  const name = profile.data?.name || profile.data?.tradeName || profile.data?.legalName || user?.name || 'Perfil'
  const current = tab === 'posts' ? posts : reports
  const data: (PostDto | ReportSummary)[] = tab === 'posts' ? posts.data?.pages.flatMap((page) => page.data) || [] : reports.data?.pages.flatMap((page) => page.data) || []
  const profileData = profile.data

  const accountItems: SheetItem[] = [
    { key: 'edit', label: 'Editar perfil', icon: <UserPen size={20} color={colors.primary} />, onPress: () => router.push('/edit-profile') },
    {
      key: 'theme',
      label: 'Aparência',
      subtitle: THEME_PREFERENCE_LABELS[themePref],
      icon: <Palette size={20} color={colors.primary} />,
      onPress: () => setThemeSheetOpen(true),
    },
    { key: 'ads', label: 'Preferências de anúncios', icon: <SlidersHorizontal size={20} color={colors.primary} />, onPress: () => router.push('/ad-preferences') },
    ...(contextEnabled
      ? [{ key: 'context', label: 'Contexto da Comunidade', icon: <ShieldCheck size={20} color={colors.primary} />, onPress: () => router.push('/contexto' as Href) }]
      : []),
    ...(surveysEnabled
      ? [{ key: 'surveys', label: 'Pesquisa Votz', icon: <ClipboardCheck size={20} color={colors.primary} />, onPress: () => router.push('/pesquisas' as Href) }]
      : []),
    { key: 'logout', label: 'Sair da conta', danger: true, icon: <LogOut size={20} color={colors.action} />, onPress: () => logout.mutate() },
  ]

  const header = profileData && <>
    {profileData.coverUrl
      ? <Image source={profileData.coverUrl} recyclingKey={profileData.coverUrl} accessibilityLabel="Capa do perfil" style={{ width: '100%', aspectRatio: 3, backgroundColor: colors.badgeBg }} contentFit="cover" />
      : <View style={{ height: 92, backgroundColor: colors.badgeBg, overflow: 'hidden' }}><View style={{ width: '35%', height: 3, backgroundColor: colors.action, position: 'absolute', bottom: 0 }} /><Image source={require('../../assets/votz-foreground.png')} style={{ position: 'absolute', right: 6, top: -30, width: 180, height: 180, opacity: 0.22 }} contentFit="contain" /></View>}
    <View style={{ paddingHorizontal: 16, paddingBottom: 18, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}><View style={{ marginTop: -36, borderWidth: 4, borderColor: colors.surface, borderRadius: 44, backgroundColor: colors.surface }}><Avatar name={name} uri={profileData.avatarUrl || profileData.logoUrl} size={72} /></View><View style={{ paddingTop: 12, flexDirection: 'row', gap: 8 }}>{canMessagePage && pageOrgType && <Button title="Mensagem" secondary onPress={() => router.push({ pathname: '/conversation/page', params: { orgType: pageOrgType, orgId: id, name } })} />}{kind !== 'users' && <Button title="Relatar" secondary onPress={() => user ? router.push({ pathname: '/compose', params: { kind: 'reports', recipientType: kind === 'politicians' ? 'POLITICIAN' : kind === 'companies' ? 'COMPANY' : 'ENTITY', recipientId: id, recipientName: name } }) : router.push('/login')} />}{canMessage && <Button title="Mensagem" secondary loading={startChat.isPending} onPress={() => startChat.mutate({ path: '/direct', body: { targetUserId: id } }, { onSuccess: (conversation) => router.push({ pathname: '/conversation/[id]', params: { id: conversation.id } }), onError: (error) => setNotice({ title: 'Não foi possível enviar o pedido', message: errorMessage(error) }) })} />}{own ? <Button title="Editar perfil" secondary onPress={() => router.push('/edit-profile')} /> : <Button title={following.data?.following ? 'Seguindo' : 'Seguir'} secondary={!!following.data?.following} loading={toggle.isPending || following.isLoading} disabled={!!user && following.isError} onPress={() => user ? toggle.mutate() : router.push('/login')} />}</View></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}><Text style={{ fontFamily: theme.fonts.heading, fontSize: 22, lineHeight: 28, color: colors.primary, flexShrink: 1 }}>{name}</Text>{profileData.verified && <BadgeCheck size={18} color={colors.action} />}</View>
      {!!profileData.username && <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>@{profileData.username}</Text>}
      {company && !!profileData.sector && <Text style={{ color: colors.action, fontFamily: theme.fonts.medium, fontSize: 13, marginTop: 6 }}>{SECTOR_LABELS[profileData.sector] ?? profileData.sector}</Text>}
      {!!profileData.office && <Text style={{ color: colors.action, fontFamily: theme.fonts.medium, fontSize: 13, marginTop: 6 }}>{profileData.office}</Text>}
      {!!(profileData.bio || profileData.description) && <Text style={[styles.text, { color: colors.text, marginTop: 10 }]}>{profileData.bio || profileData.description}</Text>}
      {own && !profileData.bio && <Pressable accessibilityRole="button" onPress={() => router.push('/edit-profile')} style={{ paddingVertical: 8 }}><Text style={{ color: colors.muted, fontSize: 13 }}>Conte à comunidade um pouco sobre você.</Text></Pressable>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, marginTop: 10 }}>{!!profileData.city && <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><MapPin size={13} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12 }}>{[profileData.city, profileData.state].filter(Boolean).join(', ')}</Text></View>}{!!profileData.createdAt && <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><CalendarDays size={13} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12 }}>Desde {new Date(profileData.createdAt).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}</Text></View>}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 14 }}>{[{ count: profileData.followersCount, label: profileData.followersCount === 1 ? 'Seguidor' : 'Seguidores' }, ...(company ? [] : [{ count: posts.data?.pages[0]?.meta.total, label: 'Publicações' }]), { count: reports.data?.pages[0]?.meta.total, label: kind === 'users' ? 'Relatos' : 'Relatos recebidos' }, ...(typeof profileData.votzScore === 'number' ? [{ count: profileData.votzScore, label: 'Votz Score' }] : typeof profileData.reputation === 'number' ? [{ count: profileData.reputation, label: 'Reputação' }] : [])].map((stat) => <View key={stat.label} style={{ gap: 3 }}><Text style={{ fontFamily: theme.fonts.medium, fontSize: 16, color: colors.primary }}>{stat.count?.toLocaleString('pt-BR') ?? '—'}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{stat.label}</Text></View>)}</View>
      <ErrorText message={toggle.isError ? errorMessage(toggle.error) : logout.isError ? errorMessage(logout.error) : undefined} />
      {following.isError && <Button secondary title="Consultar acompanhamento" onPress={() => { void following.refetch() }} />}
    </View>
    {company ? <Text style={{ paddingHorizontal: 16, paddingVertical: 12, fontFamily: theme.fonts.medium, fontSize: 14, color: colors.primary, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>Relatos recebidos</Text> : <TabStrip tabs={[{ value: 'posts', label: 'Publicações' }, { value: 'reports', label: 'Relatos' }]} value={tab} onChange={setTab} />}
  </>

  return <Screen tabs={tabs}><Toolbar title={tabs ? 'Meu perfil' : name} back={!tabs} right={own ? <IconButton label="Opções da conta" onPress={() => setAccountSheetOpen(true)}><MoreHorizontal size={23} color={colors.primary} /></IconButton> : undefined} />
    {!profileData ? <State loading={profile.isPending} title={profile.isPending ? 'Abrindo perfil…' : 'Não foi possível abrir'} description={profile.isError ? errorMessage(profile.error) : undefined} retry={() => { void profile.refetch() }} /> : <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList style={{ backgroundColor: colors.background }} data={data} keyExtractor={(item) => item.id} contentContainerStyle={{ paddingBottom: 84 }} ListHeaderComponent={header}
        renderItem={({ item }) => tab === 'posts' ? <PostCard post={item as PostDto} /> : <Pressable accessibilityRole="button" accessibilityLabel={`Abrir relato: ${(item as ReportSummary).title}`} onPress={() => router.push({ pathname: '/report/[id]', params: { id: item.id } })} style={{ paddingHorizontal: 16, paddingVertical: 16, gap: 5, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ fontSize: 11, color: colors.muted }}>{statusLabels[(item as ReportSummary).status]} · {relativeTime(item.createdAt)}</Text><Text style={{ fontFamily: theme.fonts.medium, fontSize: 16, color: colors.primary }}>{(item as ReportSummary).title}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{formatCount((item as ReportSummary)._count.votes, 'apoio', 'apoios')}</Text></Pressable>}
        refreshing={current.isRefetching && !current.isFetchingNextPage} onRefresh={() => { void profile.refetch(); void current.refetch() }}
        onEndReached={() => { if (current.hasNextPage && !current.isFetching && !current.isFetchNextPageError) void current.fetchNextPage() }} onEndReachedThreshold={0.3}
        ListEmptyComponent={<State loading={current.isPending} title={current.isPending ? 'Carregando…' : current.isError ? 'Não foi possível carregar' : tab === 'posts' ? 'Nenhuma publicação ainda' : 'Nenhum relato por aqui'} retry={current.isError ? () => { void current.refetch() } : undefined} />}
        ListFooterComponent={current.isFetchingNextPage ? <ActivityIndicator color={colors.action} style={{ padding: 18 }} /> : current.isFetchNextPageError ? <State title="Não foi possível carregar mais" retry={() => { void current.fetchNextPage() }} /> : undefined}
      />
      {own && <FloatingCompose />}
    </View>}
    <ActionSheet visible={accountSheetOpen} title="Sua conta" items={accountItems} onClose={() => setAccountSheetOpen(false)} />
    <ChoiceSheet
      visible={themeSheetOpen}
      title="Aparência"
      subtitle="Escolha o tema salvo no seu perfil"
      options={THEME_OPTIONS}
      value={themePref}
      onChange={setThemePref}
      onClose={() => setThemeSheetOpen(false)}
    />
    <ConfirmModal
      visible={!!notice}
      title={notice?.title ?? ''}
      message={notice?.message}
      onClose={() => setNotice(null)}
    />
  </Screen>
}
