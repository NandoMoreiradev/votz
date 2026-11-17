import { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import Plus from 'lucide-react-native/icons/plus'
import type { FeedSortMode } from '@votz/shared-types'
import { PostCard, ReportCard } from '../../components/content-card'
import { Label, State, styles } from '../../components/ui'
import { useFeed } from '../../hooks/use-content'
import { errorMessage } from '../../lib/api'
import { useSession } from '../../lib/session'
import type { PostDto, Report } from '../../lib/types'
import { theme } from '../../theme'

function PostsFeed({ sort }: { sort: FeedSortMode }) {
  const feed = useFeed<PostDto>('posts', sort)
  const data = feed.data?.pages.flatMap((page) => page.data) ?? []
  return <FlatList data={data} keyExtractor={(item) => item.id} contentContainerStyle={styles.content}
    renderItem={({ item }) => <PostCard post={item} />} ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
    refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => { void feed.refetch() }}
    onEndReached={() => { if (feed.hasNextPage && !feed.isFetching && !feed.isFetchNextPageError) void feed.fetchNextPage() }} onEndReachedThreshold={0.4}
    ListEmptyComponent={<State loading={feed.isPending} title={feed.isPending ? 'Carregando a comunidade' : feed.isError ? 'Não foi possível carregar' : 'A conversa começa aqui'} description={feed.isError ? errorMessage(feed.error) : 'Compartilhe ideias e acompanhe quem faz sua cidade acontecer.'} retry={feed.isError ? () => { void feed.refetch() } : undefined} />}
    ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator color={theme.colors.action} /> : feed.isError && data.length > 0 ? <State title="Não foi possível atualizar" retry={() => { void (feed.isFetchNextPageError ? feed.fetchNextPage() : feed.refetch()) }} /> : undefined}
  />
}
function ReportsFeed() {
  const feed = useFeed<Report>('reports')
  const data = feed.data?.pages.flatMap((page) => page.data) ?? []
  return <FlatList data={data} keyExtractor={(item) => item.id} contentContainerStyle={styles.content}
    renderItem={({ item }) => <ReportCard report={item} />} ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
    refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => { void feed.refetch() }}
    onEndReached={() => { if (feed.hasNextPage && !feed.isFetching && !feed.isFetchNextPageError) void feed.fetchNextPage() }} onEndReachedThreshold={0.4}
    ListEmptyComponent={<State loading={feed.isPending} title={feed.isPending ? 'Buscando relatos' : feed.isError ? 'Não foi possível carregar' : 'Toda mudança começa com uma voz'} description={feed.isError ? errorMessage(feed.error) : 'Registre um problema e mobilize sua comunidade.'} retry={feed.isError ? () => { void feed.refetch() } : undefined} />}
    ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator color={theme.colors.action} /> : feed.isError && data.length > 0 ? <State title="Não foi possível atualizar" retry={() => { void (feed.isFetchNextPageError ? feed.fetchNextPage() : feed.refetch()) }} /> : undefined}
  />
}
export default function Home() {
  const [tab, setTab] = useState<'posts' | 'reports'>('posts')
  const [sort, setSort] = useState<FeedSortMode>('recent')
  const user = useSession((s) => s.user)
  return <SafeAreaView edges={['top']} style={styles.page}>
    <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18, gap: 20, backgroundColor: theme.colors.surface }}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><View><Text style={{ fontFamily: theme.fonts.heading, color: theme.colors.action, fontSize: 36, letterSpacing: -2 }}>votz.</Text><Label muted>Sua voz move a cidade.</Label></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Criar relato ou publicação" onPress={() => router.push(user ? '/compose' : '/login')} style={{ backgroundColor: theme.colors.primary, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}><Plus color={theme.colors.surface} size={24} /></Pressable>
      </View>
      <View style={styles.row}>{(['posts', 'reports'] as const).map((key) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={{ flex: 1, minHeight: 48, padding: 12, borderRadius: 12, backgroundColor: tab === key ? theme.colors.primary : theme.colors.background, alignItems: 'center' }}><Text style={{ fontFamily: theme.fonts.medium, color: tab === key ? theme.colors.surface : theme.colors.muted }}>{key === 'posts' ? 'Publicações' : 'Relatos'}</Text></Pressable>)}</View>
      {tab === 'posts' && <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{([['recent', 'Recentes'], ['for_you', 'Para você'], ['following', 'Seguindo']] as const).map(([value, title]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: sort === value }} onPress={() => { if (value === 'following' && !user) router.push('/login'); else setSort(value) }} style={{ minHeight: 44, justifyContent: 'center', borderBottomWidth: sort === value ? 2 : 0, borderBottomColor: theme.colors.action }}><Text style={{ fontFamily: theme.fonts.medium, color: sort === value ? theme.colors.action : theme.colors.muted }}>{title}</Text></Pressable>)}</View>}
    </View>
    {tab === 'posts' ? <PostsFeed sort={sort} /> : <ReportsFeed />}
  </SafeAreaView>
}
