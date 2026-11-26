import { useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import { State, TabStrip } from '../components/ui'
import { Screen, Toolbar } from '../components/screen'
import { useDebateList } from '../hooks/use-debates'
import { errorMessage } from '../lib/api'
import { hostLabel } from '../lib/debate-view'
import type { Debate, DebateStatus } from '../lib/types'
import { useAppTheme } from '../theme-context'

type ListTab = Extract<DebateStatus, 'LIVE' | 'SCHEDULED' | 'ENDED'>
const TABS: readonly { value: ListTab; label: string }[] = [
  { value: 'LIVE', label: 'Ao vivo' }, { value: 'SCHEDULED', label: 'Próximos' }, { value: 'ENDED', label: 'Encerrados' },
]
const EMPTY: Record<ListTab, string> = {
  LIVE: 'Nenhum debate ao vivo no momento.', SCHEDULED: 'Nenhum debate agendado.', ENDED: 'Nenhum debate encerrado ainda.',
}

function DebateRow({ debate }: { debate: Debate }) {
  const { colors, theme } = useAppTheme()
  const names = debate.participants.filter((p) => p.inviteStatus === 'CONFIRMED').map((p) => p.politician.name)
  const when = new Date(debate.scheduledFor).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return <Pressable accessibilityRole="button" accessibilityLabel={`Abrir debate: ${debate.title}`} onPress={() => router.push({ pathname: '/debate/[id]', params: { id: debate.id } })}
    style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border, backgroundColor: colors.surface, gap: 5 }}>
    <Text style={{ fontSize: 11, color: debate.status === 'LIVE' ? colors.action : colors.muted, fontFamily: theme.fonts.medium }}>
      {debate.status === 'LIVE' ? `AO VIVO · ${debate.viewerCount.toLocaleString('pt-BR')} assistindo` : when}
    </Text>
    <Text numberOfLines={2} style={{ fontFamily: theme.fonts.medium, fontSize: 15, color: colors.primary }}>{debate.title}</Text>
    <Text numberOfLines={2} style={{ fontSize: 12, color: colors.muted }}>
      Organizado por {hostLabel(debate)}{names.length ? ` · ${names.join(', ')}` : ''}
    </Text>
  </Pressable>
}

export default function DebatesScreen() {
  const { colors } = useAppTheme()
  const [tab, setTab] = useState<ListTab>('LIVE')
  const list = useDebateList(tab)
  return <Screen><Toolbar back title="Debates" />
    <TabStrip tabs={TABS} value={tab} onChange={setTab} />
    <FlatList<Debate> style={{ backgroundColor: colors.background }} data={list.data?.data ?? []} keyExtractor={(item) => item.id} contentContainerStyle={{ paddingBottom: 20 }}
      renderItem={({ item }) => <DebateRow debate={item} />}
      refreshing={list.isRefetching} onRefresh={() => { void list.refetch() }}
      ListEmptyComponent={<View><State loading={list.isPending} title={list.isPending ? 'Buscando…' : list.isError ? 'Não foi possível buscar' : EMPTY[tab]}
        description={list.isError ? errorMessage(list.error) : undefined} retry={list.isError ? () => { void list.refetch() } : undefined} /></View>}
    />
  </Screen>
}
