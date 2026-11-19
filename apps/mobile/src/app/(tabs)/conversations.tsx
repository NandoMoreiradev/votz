import { useState, type PropsWithChildren } from 'react'
import { FlatList, View } from 'react-native'
import { router } from 'expo-router'
import Plus from 'lucide-react-native/icons/plus'
import Ban from 'lucide-react-native/icons/ban'
import Smartphone from 'lucide-react-native/icons/smartphone'
import {
  conversationMemberLabel,
  conversationTime,
  conversationTitle,
  type ConversationSummary,
} from '@votz/shared-types'
import { useChatPreview } from '../../hooks/use-chat-preview'
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

/** Linha da lista: nome, última mensagem (prévia só se este aparelho a abriu), horário e não lidas. */
function InboxRow({
  item,
  folder,
  userId,
  children,
}: PropsWithChildren<{
  item: ConversationSummary
  folder: 'active' | 'requests'
  userId: string
}>) {
  const preview = useChatPreview(item.id)
  const last = item.lastMessage
  const direct = item.kind === 'DIRECT'
  const unread = folder === 'active' ? item.unreadCount : 0
  const subtitle =
    folder === 'requests'
      ? `${item.invitedBy?.name || 'Uma pessoa'} ${item.kind === 'GROUP' ? 'convidou você para um grupo' : 'quer conversar com você'}.`
      : item.archivedAt
        ? 'Grupo encerrado'
        : item.kind === 'GROUP'
          ? conversationMemberLabel(item.memberCount)
          : item.members.some((m) => m.state === 'INVITED')
            ? 'Aguardando aceite'
            : direct && last
              ? `${last.fromMe ? 'Você: ' : ''}${
                  preview?.eventId === last.eventId ? preview.text : 'Mensagem protegida'
                }`
              : 'Conversa aceita'
  return (
    <ConversationPersonRow
      group={item.kind === 'GROUP'}
      person={item.members.find((m) => m.user.id !== userId)?.user}
      title={conversationTitle(item, userId)}
      subtitle={subtitle}
      meta={folder === 'active' && last ? conversationTime(last.at) : undefined}
      unread={unread}
      onPress={
        folder === 'active'
          ? () => router.push({ pathname: '/conversation/[id]', params: { id: item.id } })
          : undefined
      }
    >
      {children}
    </ConversationPersonRow>
  )
}
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
          <InboxRow item={item} folder={folder} userId={user!.id}>
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
          </InboxRow>
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
              label="Aparelhos conectados"
              onPress={() => router.push('/conversation/devices')}
            >
              <Smartphone size={21} color={theme.colors.primary} />
            </IconButton>
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
