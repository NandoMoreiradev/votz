import { useState, type PropsWithChildren } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import ArrowLeft from 'lucide-react-native/icons/arrow-left'
import Ban from 'lucide-react-native/icons/ban'
import ChevronRight from 'lucide-react-native/icons/chevron-right'
import EllipsisVertical from 'lucide-react-native/icons/ellipsis-vertical'
import MessageSquarePlus from 'lucide-react-native/icons/message-square-plus'
import Settings from 'lucide-react-native/icons/settings'
import Smartphone from 'lucide-react-native/icons/smartphone'
import UserPlus from 'lucide-react-native/icons/user-plus'
import {
  conversationIsMuted,
  conversationMemberLabel,
  conversationTime,
  conversationTitle,
  conversationUnreadLabel,
  type ConversationSummary,
} from '@votz/shared-types'
import { useChatPreview } from '../../hooks/use-chat-preview'
import { MenuItem, PopoverMenu } from '../../components/chat-sheet'
import {
  ConversationGate,
  ConversationLoadingMore,
  ConversationPersonRow,
} from '../../components/conversation-ui'
import { Screen } from '../../components/screen'
import { Button, ErrorText, IconButton, State } from '../../components/ui'
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
      pinned={folder === 'active' && !!item.pinnedAt}
      muted={folder === 'active' && conversationIsMuted(item.mutedUntil)}
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

/** Faixa no topo da lista: leva às solicitações (só aparece se houver) ou volta delas. */
function FolderRow({
  folder,
  requestCount,
  onOpen,
}: {
  folder: 'active' | 'requests'
  requestCount: number
  onOpen: (folder: 'active' | 'requests') => void
}) {
  if (folder === 'requests')
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voltar às conversas"
        onPress={() => onOpen('active')}
        style={styles.folderRow}
      >
        <ArrowLeft size={22} color={theme.colors.primary} />
        <Text style={styles.folderTitle}>Solicitações</Text>
      </Pressable>
    )
  if (requestCount === 0) return null
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Solicitações de conversa, ${requestCount} ${requestCount === 1 ? 'pendente' : 'pendentes'}`}
      onPress={() => onOpen('requests')}
      style={styles.folderRow}
    >
      <View style={styles.folderIcon}>
        <UserPlus size={22} color={theme.colors.primary} />
      </View>
      <Text style={[styles.folderTitle, { flex: 1 }]}>Solicitações</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{conversationUnreadLabel(requestCount)}</Text>
      </View>
      <ChevronRight size={20} color={theme.colors.muted} />
    </Pressable>
  )
}

function Inbox() {
  const [folder, setFolder] = useState<'active' | 'requests'>('active')
  const list = useConversationList(folder)
  const requests = useConversationList('requests')
  const action = useConversationAction()
  const { user } = useConversationScope()
  const items = list.data?.pages.flatMap((page) => page.items) || []
  const requestCount = requests.data?.pages.flatMap((page) => page.items).length ?? 0
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface }}>
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
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 96 }}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        onRefresh={() => {
          void list.refetch()
        }}
        ListHeaderComponent={
          <FolderRow
            folder={folder}
            requestCount={requestCount}
            onOpen={(value) => {
              setFolder(value)
              action.reset()
            }}
          />
        }
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
                  : 'Toque no botão vermelho para falar com uma pessoa ou criar um grupo.'
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nova conversa"
        onPress={() => router.push('/conversation/new')}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      >
        <MessageSquarePlus size={26} color={theme.colors.surface} />
      </Pressable>
    </View>
  )
}

/** Menu dos três pontinhos: tudo que não é conversa fica aqui, fora da vista. */
function InboxMenu() {
  const [open, setOpen] = useState(false)
  const go = (path: '/conversation/settings' | '/conversation/devices' | '/conversation/blocked') => {
    setOpen(false)
    router.push(path)
  }
  return (
    <>
      <IconButton label="Mais opções" onPress={() => setOpen(true)}>
        <EllipsisVertical size={22} color={theme.colors.primary} />
      </IconButton>
      <PopoverMenu visible={open} onClose={() => setOpen(false)}>
        <MenuItem
          label="Configurações de conversas"
          icon={<Settings size={20} color={theme.colors.muted} />}
          onPress={() => go('/conversation/settings')}
        />
        <MenuItem
          label="Aparelhos conectados"
          icon={<Smartphone size={20} color={theme.colors.muted} />}
          onPress={() => go('/conversation/devices')}
        />
        <MenuItem
          label="Pessoas bloqueadas"
          icon={<Ban size={20} color={theme.colors.muted} />}
          onPress={() => go('/conversation/blocked')}
        />
      </PopoverMenu>
    </>
  )
}

export default function ConversationsScreen() {
  return (
    <Screen tabs>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.headerTitle}>
          Conversas
        </Text>
        <InboxMenu />
      </View>
      <ConversationGate>
        <Inbox />
      </ConversationGate>
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 8,
    backgroundColor: theme.colors.surface,
  },
  headerTitle: {
    flex: 1,
    fontFamily: theme.fonts.heading,
    fontSize: 26,
    color: theme.colors.primary,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 16,
  },
  folderIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.soft,
  },
  folderTitle: {
    fontFamily: theme.fonts.medium,
    fontSize: 16,
    color: theme.colors.text,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.action,
  },
  badgeText: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    color: theme.colors.surface,
  },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 22,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.action,
    elevation: 6,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
})
