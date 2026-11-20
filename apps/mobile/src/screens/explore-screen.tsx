import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import Search from 'lucide-react-native/icons/search'
import X from 'lucide-react-native/icons/x'
import BadgeCheck from 'lucide-react-native/icons/badge-check'
import Radio from 'lucide-react-native/icons/radio'
import { Avatar, IconButton, State, TabStrip } from '../components/ui'
import { Screen, Toolbar } from '../components/screen'
import { statusLabels } from '../components/content-row'
import { useDirectory, type SearchKind } from '../hooks/use-content'
import { errorMessage } from '../lib/api'
import { SECTOR_LABELS, formatCount, relativeTime } from '../lib/format'
import type { PublicProfile, ReportSummary } from '../lib/types'
import { theme } from '../theme'

type Item = PublicProfile & ReportSummary

const TABS: readonly { value: SearchKind; label: string }[] = [
  { value: 'reports', label: 'Relatos' },
  { value: 'politicians', label: 'Políticos' },
  { value: 'entities', label: 'Entidades' },
  { value: 'companies', label: 'Empresas' },
]
const PLACEHOLDER: Record<SearchKind, string> = {
  reports: 'Buscar relatos', politicians: 'Buscar políticos', entities: 'Buscar entidades', companies: 'Buscar empresas',
}
const EMPTY: Record<SearchKind, string> = {
  reports: 'Nenhum relato encontrado', politicians: 'Nenhum político encontrado', entities: 'Nenhuma entidade encontrada', companies: 'Nenhuma empresa encontrada',
}
const rowStyle = { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border, flexDirection: 'row', gap: 12 } as const

function ReportRow({ item }: { item: ReportSummary }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Abrir relato: ${item.title}`} onPress={() => router.push({ pathname: '/report/[id]', params: { id: item.id } })} style={[rowStyle, { flexDirection: 'column', gap: 5 }]}>
    <Text style={{ fontSize: 11, color: item.status === 'RESOLVED' ? theme.colors.positive : theme.colors.muted }}>{statusLabels[item.status]}{item.city ? ` · ${item.city}` : ''} · {relativeTime(item.createdAt)}</Text>
    <Text numberOfLines={2} style={{ fontFamily: theme.fonts.medium, fontSize: 15, color: theme.colors.primary }}>{item.title}</Text>
    <Text style={{ fontSize: 12, color: theme.colors.muted }}>{formatCount(item._count.votes, 'apoio', 'apoios')} · {formatCount(item._count.comments, 'comentário', 'comentários')}</Text>
  </Pressable>
}
function ProfileRow({ item, kind }: { item: PublicProfile; kind: Exclude<SearchKind, 'reports'> }) {
  const name = item.name || item.tradeName || item.legalName || 'Perfil'
  const detail = kind === 'companies'
    ? [item.sector && (SECTOR_LABELS[item.sector] ?? item.sector), item.legalName !== name ? item.legalName : null].filter(Boolean).join(' · ')
    : [item.office, item.city, item.state].filter(Boolean).join(' · ')
  return <Pressable accessibilityRole="button" accessibilityLabel={`Ver perfil de ${name}`} onPress={() => router.push({ pathname: '/profile/[kind]/[id]', params: { kind, id: item.id } })} style={rowStyle}>
    <Avatar name={name} uri={item.avatarUrl || item.logoUrl} size={42} />
    <View style={{ flex: 1, gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}><Text style={{ fontFamily: theme.fonts.medium, color: theme.colors.primary, fontSize: 14, flexShrink: 1 }}>{name}</Text>{item.verified && <BadgeCheck size={14} color={theme.colors.action} />}</View>
      <Text numberOfLines={1} style={{ fontSize: 12, color: theme.colors.muted }}>{detail || 'Perfil público'}</Text>
    </View>
  </Pressable>
}

export default function ExploreScreen() {
  const [kind, setKind] = useState<SearchKind>('reports')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(timer) }, [search])
  const list = useDirectory<Item>(kind, debounced)
  return <Screen tabs><Toolbar title="Explorar" right={<IconButton label="Debates ao vivo" onPress={() => router.push('/debates')}><Radio size={22} color={theme.colors.action} /></IconButton>} />
    <View style={{ marginHorizontal: 16, marginVertical: 10, borderRadius: 22, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.soft }}><Search size={18} color={theme.colors.muted} /><TextInput accessibilityLabel={PLACEHOLDER[kind]} placeholder={PLACEHOLDER[kind]} placeholderTextColor={theme.colors.muted} value={search} onChangeText={setSearch} returnKeyType="search" style={{ flex: 1, minHeight: 42, paddingHorizontal: 10, fontFamily: theme.fonts.body, color: theme.colors.text, fontSize: 14 }} />{!!search && <IconButton label="Limpar busca" onPress={() => setSearch('')}><X size={17} color={theme.colors.muted} /></IconButton>}</View>
    <TabStrip tabs={TABS} value={kind} onChange={setKind} />
    <FlatList data={list.data?.pages.flatMap((page) => page.data) ?? []} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: 20 }}
      renderItem={({ item }) => kind === 'reports' ? <ReportRow item={item} /> : <ProfileRow item={item} kind={kind} />}
      refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => { void list.refetch() }}
      onEndReached={() => { if (list.hasNextPage && !list.isFetching && !list.isFetchNextPageError) void list.fetchNextPage() }}
      ListEmptyComponent={<State loading={list.isPending} title={list.isPending ? 'Buscando…' : list.isError ? 'Não foi possível buscar' : EMPTY[kind]} description={list.isError ? errorMessage(list.error) : 'Tente buscar outro nome.'} retry={list.isError ? () => { void list.refetch() } : undefined} />}
      ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={theme.colors.action} style={{ padding: 16 }} /> : list.isError && list.data ? <State title="Não foi possível atualizar" retry={() => { void (list.isFetchNextPageError ? list.fetchNextPage() : list.refetch()) }} /> : undefined}
    />
  </Screen>
}
