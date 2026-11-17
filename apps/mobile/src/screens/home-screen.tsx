import { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal'
import ImagePlus from 'lucide-react-native/icons/image-plus'
import type { FeedSortMode } from '@votz/shared-types'
import { PostCard, ReportCard } from '../components/content-row'
import { Avatar, IconButton, State, TabStrip } from '../components/ui'
import { Screen, Toolbar } from '../components/screen'
import { FloatingCompose } from '../components/floating-compose'
import { ChoiceSheet } from '../components/choice-sheet'
import { useFeed } from '../hooks/use-content'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import type { PostDto, Report } from '../lib/types'
import { theme } from '../theme'

function Feed({ kind, sort }: { kind: 'posts' | 'reports'; sort: FeedSortMode }) {
  const feed = useFeed<PostDto | Report>(kind, sort)
  const user = useSession((s) => s.user)
  const data = feed.data?.pages.flatMap((page) => page.data) ?? []
  return <FlatList data={data} keyExtractor={(item) => item.id} contentContainerStyle={{ paddingBottom: 88, flexGrow: 1 }}
    initialNumToRender={5} maxToRenderPerBatch={5} windowSize={7}
    renderItem={({ item }) => kind === 'posts' ? <PostCard post={item as PostDto} /> : <ReportCard report={item as Report} />}
    ListHeaderComponent={<Pressable accessibilityRole="button" accessibilityLabel={kind === 'posts' ? 'Escrever publicação' : 'Registrar relato'} onPress={() => router.push(user ? { pathname: '/compose', params: { kind } } : '/login')} style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }}><Avatar name={user?.name || 'Votz'} uri={user?.avatarUrl} size={34} /><Text style={{ color: theme.colors.muted, fontFamily: theme.fonts.body, fontSize: 14, flex: 1 }}>{kind === 'posts' ? 'O que está acontecendo?' : 'O que precisa mudar na sua cidade?'}</Text><ImagePlus size={20} color={theme.colors.action} /></Pressable>}
    refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => { void feed.refetch() }}
    onEndReached={() => { if (feed.hasNextPage && !feed.isFetching && !feed.isFetchNextPageError) void feed.fetchNextPage() }} onEndReachedThreshold={0.4}
    ListEmptyComponent={<State loading={feed.isPending} title={feed.isPending ? 'Carregando…' : feed.isError ? 'Não foi possível carregar' : 'A conversa começa aqui'} description={feed.isError ? errorMessage(feed.error) : 'Compartilhe uma ideia ou acompanhe sua comunidade.'} retry={feed.isError ? () => { void feed.refetch() } : undefined} />}
    ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator color={theme.colors.action} style={{ padding: 20 }} /> : feed.isError && data.length > 0 ? <State title="Não foi possível atualizar" retry={() => { void (feed.isFetchNextPageError ? feed.fetchNextPage() : feed.refetch()) }} /> : undefined}
  />
}
export default function HomeScreen() {
  const [tab, setTab] = useState<'posts' | 'reports'>('posts')
  const [sort, setSort] = useState<FeedSortMode>('recent')
  const [sortSheet, setSortSheet] = useState(false)
  const user = useSession((s) => s.user)
  const sortNames: Record<FeedSortMode, string> = { recent: 'Recentes', for_you: 'Para você', trending: 'Em alta', following: 'Seguindo' }
  return <Screen tabs>
    <Toolbar brand left={<Pressable accessibilityRole="button" accessibilityLabel="Abrir meu perfil" onPress={() => router.navigate('/account')} style={{ padding: 4 }}><Avatar name={user?.name || 'Votz'} uri={user?.avatarUrl} size={30} /></Pressable>} right={<IconButton label={`Ordenação: ${sortNames[sort]}`} onPress={() => setSortSheet(true)}><SlidersHorizontal size={21} color={theme.colors.primary} /></IconButton>} />
    <TabStrip tabs={[{ value: 'posts', label: 'Publicações' }, { value: 'reports', label: 'Relatos' }]} value={tab} onChange={setTab} />
    <View style={{ flex: 1 }}><Feed key={`${tab}-${sort}`} kind={tab} sort={sort} /><FloatingCompose /></View>
    <ChoiceSheet visible={sortSheet} title="Seu feed" options={(Object.entries(sortNames) as [FeedSortMode, string][]).map(([value, label]) => ({ value, label }))} value={sort} onChange={(value) => { if (value === 'following' && !user) router.push('/login'); else { setSort(value); setTab('posts') } }} onClose={() => setSortSheet(false)} />
  </Screen>
}
