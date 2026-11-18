import { Alert, FlatList, View } from 'react-native'
import {
  ConversationGate,
  ConversationLoadingMore,
  ConversationPersonRow,
} from '../../components/conversation-ui'
import { Screen, Toolbar } from '../../components/screen'
import { Button, ErrorText, Label, State } from '../../components/ui'
import { useConversationAction, useConversationBlocks } from '../../hooks/use-conversations'
import { errorMessage } from '../../lib/api'

function BlockedPeople() {
  const list = useConversationBlocks()
  const action = useConversationAction()
  const items = list.data?.pages.flatMap((page) => page.items) || []
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.blockedId}
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshing={list.isRefetching && !list.isFetchingNextPage}
      onRefresh={() => {
        void list.refetch()
      }}
      ListHeaderComponent={
        <View style={{ padding: 16, gap: 12 }}>
          <Label muted>Você pode permitir novas interações ao desbloquear uma pessoa.</Label>
          {action.isError && <ErrorText message={errorMessage(action.error)} />}
          {list.isError && <ErrorText message={errorMessage(list.error)} />}
        </View>
      }
      renderItem={({ item }) => (
        <ConversationPersonRow person={item.blocked}>
          <Button
            title="Desbloquear"
            secondary
            disabled={action.isPending}
            onPress={() =>
              Alert.alert(`Desbloquear ${item.blocked.name}?`, undefined, [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Desbloquear',
                  onPress: () =>
                    action.mutate({ path: `/blocks/${item.blockedId}`, method: 'DELETE' }),
                },
              ])
            }
          />
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
                : 'Nenhuma pessoa bloqueada'
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
  )
}
export default function BlockedPeopleScreen() {
  return (
    <Screen>
      <Toolbar title="Pessoas bloqueadas" back />
      <ConversationGate>
        <BlockedPeople />
      </ConversationGate>
    </Screen>
  )
}
