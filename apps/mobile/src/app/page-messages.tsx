import { FlatList, Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import { Screen, Toolbar } from '../components/screen'
import { Avatar, State } from '../components/ui'
import { KIND_BY_ORG, useMyPageConversations } from '../hooks/use-page-inbox'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { theme } from '../theme'

/** Minhas mensagens para páginas (políticos, entidades e empresas). */
export default function PageMessages() {
  const user = useSession((s) => s.user)
  const list = useMyPageConversations()
  if (!user) return <Screen><Toolbar title="Mensagens para páginas" back /><State title="Entre para ver suas mensagens" /></Screen>
  return (
    <Screen>
      <Toolbar title="Mensagens para páginas" back />
      {list.isError ? (
        <State title="Não foi possível carregar" description={errorMessage(list.error)} retry={() => { void list.refetch() }} />
      ) : (
        <FlatList
          data={list.data?.items ?? []}
          keyExtractor={(c) => c.id}
          refreshing={list.isRefetching}
          onRefresh={() => { void list.refetch() }}
          ListEmptyComponent={list.isLoading ? <State loading title="Carregando" /> : <State title="Nenhuma mensagem ainda" description="Abra o perfil de um político, entidade ou empresa e toque em Mensagem." />}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/profile/[kind]/[id]/messages', params: { kind: KIND_BY_ORG[item.page.orgType], id: item.page.orgId, name: item.page.name } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }}
            >
              <Avatar name={item.page.name} uri={item.page.avatarUrl} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: theme.fonts.medium, color: theme.colors.text }}>{item.page.name}</Text>
                <Text numberOfLines={1} style={{ color: theme.colors.muted, fontSize: 13 }}>{item.lastFrom === 'CITIZEN' ? 'Você: ' : ''}{item.lastText}</Text>
              </View>
              {item.unread > 0 && <Text style={{ backgroundColor: theme.colors.action, color: '#FFFFFF', borderRadius: 10, paddingHorizontal: 7, fontSize: 12 }}>{item.unread}</Text>}
            </Pressable>
          )}
        />
      )}
    </Screen>
  )
}
