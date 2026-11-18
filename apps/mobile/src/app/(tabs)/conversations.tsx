import { useState } from 'react'
import { FlatList, View } from 'react-native'
import { router } from 'expo-router'
import Plus from 'lucide-react-native/icons/plus'
import Ban from 'lucide-react-native/icons/ban'
import { conversationMemberLabel, conversationTitle } from '@votz/shared-types'
import {
  ConversationGate,
  ConversationLoadingMore,
  ConversationPersonRow,
} from '../../components/conversation-ui'
import { Screen, Toolbar } from '../../components/screen'
import { Button, ErrorText, IconButton, State, TabStrip } from '../../components/ui'
import {
  useConversationAction,
  useConversationList,
  useConversationScope,
} from '../../hooks/use-conversations'
import { errorMessage } from '../../lib/api'
import { theme } from '../../theme'

function Inbox() {
  const [folder, setFolder] = useState<'active' | 'requests'>('active')
  const list = useConversationList(folder)
  const action = useConversationAction()
  const { user } = useConversationScope()
  const items = list.data?.pages.flatMap((page) => page.items) || []
  return (
    <View style={{ flex: 1 }}>
      <TabStrip
        value={folder}
        onChange={(value) => {
          setFolder(value)
          action.reset()
        }}
        tabs={[
          { value: 'active', label: 'Conversas' },
          { value: 'requests', label: 'Solicitações' },
        ]}
      />
      {action.isError && (
        <View style={{ padding: 16 }}>
          <ErrorText message={errorMessage(action.error)} />
        </View>
      )}
      {list.isError && items.length > 0 && (
        <State
          title="Não foi possível atualizar"
          retry={() => {
            void list.refetch()
          }}
        />
      )}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        onRefresh={() => {
          void list.refetch()
        }}
        renderItem={({ item }) => (
          <ConversationPersonRow
            group={item.kind === 'GROUP'}
            person={item.members.find((m) => m.user.id !== user!.id)?.user}
            title={conversationTitle(item, user!.id)}
            subtitle={
              folder === 'requests'
                ? `${item.invitedBy?.name || 'Uma pessoa'} ${item.kind === 'GROUP' ? 'convidou você para um grupo' : 'quer conversar com você'}.`
                : item.archivedAt
                  ? 'Grupo encerrado'
                  : item.kind === 'GROUP'
                    ? conversationMemberLabel(item.memberCount)
                    : item.members.some((m) => m.state === 'INVITED')
                      ? 'Aguardando aceite'
                      : 'Conversa aceita'
            }
            onPress={
              folder === 'active'
                ? () => router.push({ pathname: '/conversation/[id]', params: { id: item.id } })
                : undefined
            }
          >
            {folder === 'requests' && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button
                  title="Aceitar"
                  disabled={action.isPending}
                  onPress={() =>
                    action.mutate({ path: `/${item.id}/respond`, body: { accept: true } })
                  }
                />
                <Button
                  title="Recusar"
                  secondary
                  disabled={action.isPending}
                  onPress={() =>
                    action.mutate({ path: `/${item.id}/respond`, body: { accept: false } })
                  }
                />
              </View>
            )}
          </ConversationPersonRow>
        )}
        ListEmptyComponent={
          <State
            loading={list.isPending}
            title={
              list.isPending
                ? 'Carregando…'
                : list.isError
                  ? 'Não foi possível carregar'
                  : folder === 'requests'
                    ? 'Você está em dia'
                    : 'Uma conversa pode aproximar'
            }
            description={
              list.isError
                ? errorMessage(list.error)
                : folder === 'requests'
                  ? 'Seus convites e solicitações aparecerão aqui.'
                  : 'Encontre uma pessoa ou crie um grupo para sua comunidade.'
            }
            retry={
              list.isError
                ? () => {
                    void list.refetch()
                  }
                : undefined
            }
          />
        }
        ListFooterComponent={
          <ConversationLoadingMore
            loading={list.isFetchingNextPage}
            more={list.hasNextPage}
            onMore={() => {
              void list.fetchNextPage()
            }}
          />
        }
      />
    </View>
  )
}
export default function ConversationsScreen() {
  return (
    <Screen tabs>
      <Toolbar
        title="Conversas"
        right={
          <View style={{ flexDirection: 'row' }}>
            <IconButton
              label="Pessoas bloqueadas"
              onPress={() => router.push('/conversation/blocked')}
            >
              <Ban size={21} color={theme.colors.primary} />
            </IconButton>
            <IconButton label="Nova conversa" onPress={() => router.push('/conversation/new')}>
              <Plus size={23} color={theme.colors.primary} />
            </IconButton>
          </View>
        }
      />
      <ConversationGate>
        <Inbox />
      </ConversationGate>
    </Screen>
  )
}
