import { useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import { router, type Href } from 'expo-router'
import Plus from 'lucide-react-native/icons/plus'
import { Screen, Toolbar } from '../components/screen'
import { Card, IconButton, State, TabStrip } from '../components/ui'
import { usePropostas } from '../hooks/use-politician-tools'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'

export const PROPOSTA_STATUS_LABELS: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  EM_DISCUSSAO: 'Em discussão',
  PROTOCOLADA: 'Protocolada',
  EM_TRAMITACAO: 'Em tramitação',
  APROVADA: 'Aprovada',
  REJEITADA: 'Rejeitada',
  ARQUIVADA: 'Arquivada',
}

export default function PropostasScreen() {
  const { colors, theme } = useAppTheme()
  const activeContext = useSession((s) => s.activeContext)
  const isPolitician = activeContext?.type === 'POLITICIAN'
  const [scope, setScope] = useState<'all' | 'mine'>(isPolitician ? 'mine' : 'all')

  const query = usePropostas(isPolitician && scope === 'mine' ? { politicoId: activeContext.id } : {})

  return (
    <Screen>
      <Toolbar
        title="Propostas"
        back
        right={
          isPolitician ? (
            <IconButton label="Nova proposta" onPress={() => router.push('/proposta-nova' as Href)}>
              <Plus size={22} color={colors.action} />
            </IconButton>
          ) : undefined
        }
      />
      {isPolitician && (
        <TabStrip
          tabs={[
            { value: 'mine', label: 'Meu mandato' },
            { value: 'all', label: 'Todas' },
          ]}
          value={scope}
          onChange={setScope}
        />
      )}
      <FlatList
        style={{ flex: 1, backgroundColor: colors.soft }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40, flexGrow: 1 }}
        data={query.data?.data ?? []}
        keyExtractor={(item) => item.id}
        refreshing={query.isRefetching}
        onRefresh={() => {
          void query.refetch()
        }}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/propostas/${item.id}` as Href)}>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontFamily: theme.fonts.medium, fontSize: 11, color: colors.action, textTransform: 'uppercase' }}>
                  {PROPOSTA_STATUS_LABELS[item.status] ?? item.status}
                </Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 11, color: colors.muted }}>
                  {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                </Text>
              </View>
              <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary }}>
                {item.titulo}
              </Text>
              <Text numberOfLines={2} style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted, lineHeight: 19 }}>
                {item.descricao}
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: colors.text }} numberOfLines={1}>
                  {item.politico ? `${item.politico.name} (${item.politico.party.abbreviation})` : ''}
                </Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                  👍 {item.totalApoios} · 👎 {item.totalRejeicoes}
                </Text>
              </View>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={
          <State
            loading={query.isPending}
            title={
              query.isPending
                ? 'Carregando propostas…'
                : query.isError
                  ? 'Não foi possível carregar'
                  : 'Nenhuma proposta ainda'
            }
            description={query.isError ? errorMessage(query.error) : undefined}
            retry={query.isError ? () => { void query.refetch() } : undefined}
          />
        }
      />
    </Screen>
  )
}
