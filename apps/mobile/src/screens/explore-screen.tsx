import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import Search from 'lucide-react-native/icons/search'
import X from 'lucide-react-native/icons/x'
import BadgeCheck from 'lucide-react-native/icons/badge-check'
import { Avatar, IconButton, State, TabStrip } from '../components/ui'
import { Screen, Toolbar } from '../components/screen'
import { useDirectory } from '../hooks/use-content'
import { errorMessage } from '../lib/api'
import { theme } from '../theme'

export default function ExploreScreen() {
  const [kind, setKind] = useState<'politicians' | 'entities'>('politicians')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(timer) }, [search])
  const list = useDirectory(kind, debounced)
  return <Screen tabs><Toolbar title="Explorar" />
    <View style={{ marginHorizontal: 16, marginVertical: 10, borderRadius: 22, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.soft }}><Search size={18} color={theme.colors.muted} /><TextInput accessibilityLabel="Buscar perfis" placeholder="Buscar no Votz" placeholderTextColor={theme.colors.muted} value={search} onChangeText={setSearch} returnKeyType="search" style={{ flex: 1, minHeight: 42, paddingHorizontal: 10, fontFamily: theme.fonts.body, color: theme.colors.text, fontSize: 14 }} />{!!search && <IconButton label="Limpar busca" onPress={() => setSearch('')}><X size={17} color={theme.colors.muted} /></IconButton>}</View>
    <TabStrip tabs={[{ value: 'politicians', label: 'Políticos' }, { value: 'entities', label: 'Entidades' }]} value={kind} onChange={setKind} />
    <FlatList data={list.data?.pages.flatMap((page) => page.data) ?? []} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: 20 }}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Ver perfil de ${item.name || item.legalName}`} onPress={() => router.push({ pathname: '/profile/[kind]/[id]', params: { kind, id: item.id } })} style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border, flexDirection: 'row', gap: 12 }}><Avatar name={item.name || item.legalName || 'V'} uri={item.avatarUrl || item.logoUrl} size={42} /><View style={{ flex: 1, gap: 4 }}><View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}><Text style={{ fontFamily: theme.fonts.medium, color: theme.colors.primary, fontSize: 14, flexShrink: 1 }}>{item.name || item.legalName}</Text>{item.verified && <BadgeCheck size={14} color={theme.colors.action} />}</View><Text style={{ fontSize: 12, color: theme.colors.muted }}>{[item.office, item.city, item.state].filter(Boolean).join(' · ') || 'Perfil público'}</Text></View></Pressable>}
      refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => { void list.refetch() }}
      onEndReached={() => { if (list.hasNextPage && !list.isFetching && !list.isFetchNextPageError) void list.fetchNextPage() }}
      ListEmptyComponent={<State loading={list.isPending} title={list.isPending ? 'Buscando…' : list.isError ? 'Não foi possível buscar' : 'Nenhum perfil encontrado'} description={list.isError ? errorMessage(list.error) : 'Tente buscar outro nome.'} retry={list.isError ? () => { void list.refetch() } : undefined} />}
      ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={theme.colors.action} style={{ padding: 16 }} /> : list.isError && list.data ? <State title="Não foi possível atualizar" retry={() => { void (list.isFetchNextPageError ? list.fetchNextPage() : list.refetch()) }} /> : undefined}
    />
  </Screen>
}
