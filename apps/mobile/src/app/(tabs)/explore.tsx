import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Avatar, Button, Card, Field, Heading, Label, State, styles } from '../../components/ui'
import { useDirectory } from '../../hooks/use-content'
import { errorMessage } from '../../lib/api'
import { theme } from '../../theme'

export default function Explore() {
  const [kind, setKind] = useState<'politicians' | 'entities'>('politicians')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 350); return () => clearTimeout(timer) }, [search])
  const list = useDirectory(kind, debounced)
  return <SafeAreaView edges={['top']} style={styles.page}>
    <View style={styles.content}><Heading>Quem move sua cidade</Heading><Label muted>Conheça, acompanhe e participe.</Label><Field label="Buscar perfis" placeholder="Busque pelo nome" value={search} onChangeText={setSearch} returnKeyType="search" />
      <View style={styles.row}><Button title="Políticos" secondary={kind !== 'politicians'} onPress={() => setKind('politicians')} /><Button title="Entidades" secondary={kind !== 'entities'} onPress={() => setKind('entities')} /></View>
    </View>
    <FlatList data={list.data?.pages.flatMap((page) => page.data) ?? []} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Ver perfil de ${item.name || item.legalName}`} onPress={() => router.push({ pathname: '/profile/[kind]/[id]', params: { kind, id: item.id } })}><Card><View style={styles.row}><Avatar name={item.name || item.legalName || 'V'} uri={item.avatarUrl || item.logoUrl} /><View style={{ flex: 1 }}><Label>{item.name || item.legalName}{item.verified ? ' · Verificado' : ''}</Label><Label muted>{[item.office, item.city, item.state].filter(Boolean).join(' · ') || 'Perfil público'}</Label></View></View></Card></Pressable>}
      refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => { void list.refetch() }}
      onEndReached={() => { if (list.hasNextPage && !list.isFetching && !list.isFetchNextPageError) void list.fetchNextPage() }}
      ListEmptyComponent={<State loading={list.isPending} title={list.isPending ? 'Buscando perfis' : list.isError ? 'Não foi possível buscar' : 'Nenhum perfil encontrado'} description={list.isError ? errorMessage(list.error) : 'Tente buscar outro nome.'} retry={list.isError ? () => { void list.refetch() } : undefined} />}
      ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={theme.colors.action} /> : list.isError && list.data ? <State title="Não foi possível atualizar" retry={() => { void (list.isFetchNextPageError ? list.fetchNextPage() : list.refetch()) }} /> : undefined}
    />
  </SafeAreaView>
}
