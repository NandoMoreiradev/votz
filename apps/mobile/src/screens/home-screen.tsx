import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Modal, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import ImagePlus from 'lucide-react-native/icons/image-plus'
import Check from 'lucide-react-native/icons/check'
import Bell from 'lucide-react-native/icons/bell'
import { AD_DELIVERY_LIMITS, adNeighborIds, type AdSurface, type FeedSortMode, type SponsoredAdView } from '@votz/shared-types'
import { PostCard, ReportCard } from '../components/content-row'
import { Avatar, State, TabStrip } from '../components/ui'
import { Screen, Toolbar } from '../components/screen'
import { SuggestedProfilesCard } from '../components/suggested-profiles-card'
import { FeaturedSurveyCard } from '../components/featured-survey-card'
import { FloatingCompose } from '../components/floating-compose'
import { SponsoredSlot } from '../components/sponsored-card'
import { isAdSlot, withAdSlots, type AdSlotItem } from '../lib/ad-feed'
import { trackAdEventOnce } from '../lib/ad-events'
import { useFeed } from '../hooks/use-content'
import { useUnreadNotificationsCount } from '../hooks/use-notifications'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'
import type { FeedSuggestions } from '@votz/shared-types'
import type { PostDto, Report } from '../lib/types'

type FeedKind = 'posts' | 'reports'
const kindNames: Record<FeedKind, string> = { posts: 'Publicações', reports: 'Relatos' }
const kindHints: Record<FeedKind, string> = { posts: 'Conversa da comunidade', reports: 'Problemas registrados na cidade' }

type SuggestionsItem = { id: '__suggestions__'; suggestions: FeedSuggestions }
// Anúncio conta como visto com 50% do espaço na tela por 1 segundo (padrão de mercado); a lista mede, o servidor confere.
const AD_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50, minimumViewTime: 1000 } as const
function Feed({ kind, sort }: { kind: FeedKind; sort: FeedSortMode }) {
  const { colors, theme } = useAppTheme()
  const feed = useFeed<PostDto | Report>(kind, sort)
  const user = useSession((s) => s.user)
  const items = feed.data?.pages.flatMap((page) => page.data) ?? []
  // Cartão de perfis sugeridos (só vem do servidor para quem segue poucas contas, na primeira página).
  const first = feed.data?.pages[0]
  // 1 anúncio a cada 8 publicações, só para quem entrou (o pedido de anúncio exige login).
  const withAds = withAdSlots<PostDto | Report>(items, AD_DELIVERY_LIMITS.FEED_ITEMS_PER_AD, kind === 'posts' && !!user, adNeighborIds)
  const data: (PostDto | Report | SuggestionsItem | AdSlotItem)[] = [...withAds]
  if (kind === 'posts' && first?.suggestions && items.length > 0) data.splice(Math.min(first.suggestionsAfter ?? 3, items.length), 0, { id: '__suggestions__', suggestions: first.suggestions })
  const surface: AdSurface = sort === 'recent' ? 'FEED_RECENT' : 'FEED_FOR_YOU'
  // Anúncios já entregues, por espaço: a lista mede a visibilidade e só então manda o evento "visto".
  const loadedAds = useRef(new Map<string, SponsoredAdView>())
  const onAdLoaded = useCallback((slotId: string, ad: SponsoredAdView | null) => { if (ad) loadedAds.current.set(slotId, ad); else loadedAds.current.delete(slotId) }, [])
  const loadedSurface = useRef<AdSurface>(surface)
  loadedSurface.current = surface
  const onViewable = useRef(({ viewableItems }: { viewableItems: { item: unknown }[] }) => {
    for (const { item } of viewableItems) {
      if (!isAdSlot(item)) continue
      const ad = loadedAds.current.get(item.id)
      if (ad) trackAdEventOnce({ type: 'VIEWABLE_IMPRESSION', impressionId: ad.impressionId, adId: ad.adId, surface: loadedSurface.current, position: item.adSlot, visibleMs: AD_VIEWABILITY_CONFIG.minimumViewTime })
    }
  })
  const viewabilityConfig = useRef(AD_VIEWABILITY_CONFIG)
  return <FlatList style={{ backgroundColor: colors.soft }} data={data} keyExtractor={(item) => item.id} contentContainerStyle={{ paddingBottom: 88, flexGrow: 1 }}
    initialNumToRender={5} maxToRenderPerBatch={5} windowSize={7}
    viewabilityConfig={viewabilityConfig.current} onViewableItemsChanged={onViewable.current}
    ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
    renderItem={({ item }) => isAdSlot(item) ? <SponsoredSlot slotId={item.id} surface={surface} position={item.adSlot} near={item.near} onLoaded={onAdLoaded} /> : item.id === '__suggestions__' ? <SuggestedProfilesCard suggestions={(item as SuggestionsItem).suggestions} /> : kind === 'posts' ? <PostCard post={item as PostDto} /> : <ReportCard report={item as Report} />}
    ListHeaderComponent={<><Pressable accessibilityRole="button" accessibilityLabel={kind === 'posts' ? 'Escrever publicação' : 'Registrar relato'} onPress={() => router.push(user ? { pathname: '/compose', params: { kind } } : '/login')} style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, marginBottom: 8 }}><Avatar name={user?.name || 'Votz'} uri={user?.avatarUrl} size={34} /><Text style={{ color: colors.muted, fontFamily: theme.fonts.body, fontSize: 14, flex: 1 }}>{kind === 'posts' ? 'O que está acontecendo?' : 'O que precisa mudar na sua cidade?'}</Text><ImagePlus size={20} color={colors.action} /></Pressable>{kind === 'posts' && <FeaturedSurveyCard />}</>}
    refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => { void feed.refetch() }}
    onEndReached={() => { if (feed.hasNextPage && !feed.isFetching && !feed.isFetchNextPageError) void feed.fetchNextPage() }} onEndReachedThreshold={0.4}
    ListEmptyComponent={<State loading={feed.isPending} title={feed.isPending ? 'Carregando…' : feed.isError ? 'Não foi possível carregar' : sort === 'following' ? 'Você ainda não segue ninguém' : 'A conversa começa aqui'} description={feed.isError ? errorMessage(feed.error) : sort === 'following' ? 'Siga pessoas, políticos e entidades para ver o que eles publicam.' : 'Compartilhe uma ideia ou acompanhe sua comunidade.'} retry={feed.isError ? () => { void feed.refetch() } : undefined} />}
    ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator color={colors.action} style={{ padding: 20 }} /> : feed.isError && data.length > 0 ? <State title="Não foi possível atualizar" retry={() => { void (feed.isFetchNextPageError ? feed.fetchNextPage() : feed.refetch()) }} /> : undefined}
  />
}

/** Menu que abre ao tocar no logo: escolhe entre Publicações e Relatos. */
function KindMenu({ visible, value, onChange, onClose }: { visible: boolean; value: FeedKind; onChange: (value: FeedKind) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets()
  const { colors, theme } = useAppTheme()
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable accessibilityRole="button" accessibilityLabel="Fechar menu" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(10, 12, 16, 0.48)' }}>
      <View accessibilityRole="menu" style={{ position: 'absolute', top: insets.top + 52, alignSelf: 'center', width: 260, backgroundColor: colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 6, elevation: 8 }}>
        {(Object.keys(kindNames) as FeedKind[]).map((kind) => <Pressable key={kind} accessibilityRole="menuitem" accessibilityState={{ selected: value === kind }} onPress={() => { onChange(kind); onClose() }} style={{ minHeight: 56, paddingHorizontal: 18, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: value === kind ? colors.action : colors.primary }}>{kindNames[kind]}</Text>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>{kindHints[kind]}</Text>
          </View>
          {value === kind && <Check size={20} color={colors.action} />}
        </Pressable>)}
      </View>
    </Pressable>
  </Modal>
}

export default function HomeScreen() {
  const [kind, setKind] = useState<FeedKind>('posts')
  const [chosenSort, setSort] = useState<FeedSortMode>('for_you')
  const [menu, setMenu] = useState(false)
  const user = useSession((s) => s.user)
  const { colors, theme } = useAppTheme()
  const { data: unreadCount = 0 } = useUnreadNotificationsCount()
  // Como no Votz Web: "Seguindo" só existe para quem entrou. Sem login, volta para "Para você".
  const sort: FeedSortMode = chosenSort === 'following' && !user ? 'for_you' : chosenSort
  const sortTabs: { value: FeedSortMode; label: string }[] = [
    { value: 'for_you', label: 'Para você' }, { value: 'trending', label: 'Em alta' },
    ...(user ? [{ value: 'following' as const, label: 'Seguindo' }] : []),
    { value: 'recent', label: 'Recentes' },
  ]
  return <Screen tabs>
    <Toolbar
      brand
      brandLabel={`Votz. Você está vendo ${kindNames[kind]}. Toque para trocar`}
      onBrandPress={() => setMenu(true)}
      left={<Pressable accessibilityRole="button" accessibilityLabel="Abrir meu perfil" onPress={() => router.navigate('/account')} style={{ padding: 4 }}><Avatar name={user?.name || 'Votz'} uri={user?.avatarUrl} size={30} /></Pressable>}
      right={user ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `Notificações, ${unreadCount} não lidas` : 'Notificações'}
          onPress={() => router.push('/notifications' as never)}
          style={{ padding: 6, position: 'relative' }}
        >
          <Bell size={22} color={colors.primary} />
          {unreadCount > 0 && (
            <View style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.action, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
              <Text style={{ fontFamily: theme.fonts.medium, fontSize: 10, color: '#FFFFFF' }}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </Pressable>
      ) : undefined}
    />
    {kind === 'posts' && <TabStrip tabs={sortTabs} value={sort} onChange={setSort} />}
    <View style={{ flex: 1 }}><Feed key={`${kind}-${kind === 'posts' ? sort : ''}`} kind={kind} sort={sort} /><FloatingCompose /></View>
    <KindMenu visible={menu} value={kind} onChange={setKind} onClose={() => setMenu(false)} />
  </Screen>
}
