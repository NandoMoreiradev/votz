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
  mergeInboxLists,
  type ConversationSummary,
} from '@votz/shared-types'
import { ENROLL_WAITING } from '@votz/chat-core'
import { useChatDeviceStatus } from '../../hooks/use-chat-devices'
import { useChatPreview } from '../../hooks/use-chat-preview'
import { MenuItem, PopoverMenu } from '../../components/chat-sheet'
import {
  ConversationGate,
  ConversationLoadingMore,
  ConversationPersonRow,
} from '../../components/conversation-ui'
import { BrandMark, Screen } from '../../components/screen'
import { Button, ErrorText, IconButton, State } from '../../components/ui'
import {
  useConversationAction,
  useConversationCapabilities,
  useConversationList,
  useConversationScope,
} from '../../hooks/use-conversations'
import { useMyPageConversationList, type MyPageConversationRow } from '../../hooks/use-page-inbox'
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

function PageInboxRow({ item }: { item: MyPageConversationRow }) {
  const pending = item.startedBy === 'STAFF' && !item.accepted
  const subtitle = pending
    ? 'Quer conversar com você'
    : `${item.lastFrom === 'CITIZEN' ? 'Você: ' : ''}${item.lastText}`
  return (
    <ConversationPersonRow
      person={{ id: item.page.orgId, name: item.page.name, username: item.page.username, avatarUrl: item.page.avatarUrl, verified: false }}
      title={item.page.name}
      subtitle={subtitle}
      meta={conversationTime(item.lastMessageAt)}
      unread={item.unread}
      onPress={() =>
        router.push({
          pathname: '/conversation/page',
          params: { orgType: item.page.orgType, orgId: item.page.orgId, name: item.page.name },
        })
      }
    />
  )
}

type UnifiedInboxItem =
  | { key: string; kind: 'chat'; sortAt: string; pinned: boolean; chat: ConversationSummary }
  | { key: string; kind: 'page'; sortAt: string; pinned: false; page: MyPageConversationRow }

function Inbox() {
  const [folder, setFolder] = useState<'active' | 'requests'>('active')
  const capabilities = useConversationCapabilities()
  const chatEnabled = !!capabilities.data?.enabled
  const list = useConversationList(folder, chatEnabled)
  const requests = useConversationList('requests', chatEnabled)
  const pageList = useMyPageConversationList(folder === 'active')
  const action = useConversationAction()
  const deviceStatus = useChatDeviceStatus()
  const { user } = useConversationScope()
  const chatItems: UnifiedInboxItem[] = (list.data?.pages.flatMap((page) => page.items) || []).map((chat) => ({
    key: chat.id,
    kind: 'chat',
    sortAt: chat.lastMessage?.at ?? chat.updatedAt,
    pinned: !!chat.pinnedAt,
    chat,
  }))
  const pageItems: UnifiedInboxItem[] =
    folder === 'active'
      ? (pageList.data?.pages.flatMap((page) => page.items) || [])
          .filter((p) => !(p.startedBy === 'STAFF' && !p.accepted && p.status === 'BLOCKED'))
          .map((page) => ({
            key: `page:${page.id}`,
            kind: 'page',
            sortAt: page.lastMessageAt,
            pinned: false,
            page,
          }))
      : []
  const items =
    folder === 'active'
      ? mergeInboxLists(
          [
            { items: chatItems, hasMore: chatEnabled && !!list.hasNextPage },
            { items: pageItems, hasMore: !!pageList.hasNextPage },
          ],
          (i) => i.sortAt,
          (i) => i.pinned,
        )
      : chatItems
  const requestCount = chatEnabled ? (requests.data?.pages.flatMap((page) => page.items).length ?? 0) : 0
  const needsApproval = chatEnabled && deviceStatus.data?.status === 'needs_approval'
  const loading = (chatEnabled && list.isPending) || (folder === 'active' && pageList.isPending)
  const listError = (chatEnabled && list.isError ? list.error : null) || (folder === 'active' && pageList.isError ? pageList.error : null)
  const hasMore = (chatEnabled && !!list.hasNextPage) || (folder === 'active' && !!pageList.hasNextPage)
  const fetchingMore = list.isFetchingNextPage || pageList.isFetchingNextPage
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      {action.isError && (
        <View style={{ padding: 16 }}>
          <ErrorText message={errorMessage(action.error)} />
        </View>
      )}
      {listError && items.length > 0 && (
        <State
          title="Não foi possível atualizar"
          retry={() => {
            if (chatEnabled) void list.refetch()
            if (folder === 'active') void pageList.refetch()
          }}
        />
      )}
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 96 }}
        refreshing={(list.isRefetching && !list.isFetchingNextPage) || (pageList.isRefetching && !pageList.isFetchingNextPage)}
        onRefresh={() => {
          if (chatEnabled) void list.refetch()
          if (folder === 'active') void pageList.refetch()
        }}
        ListHeaderComponent={
          <View>
            {needsApproval && (
              <View style={styles.connectCard}>
                <Text style={styles.connectTitle}>{ENROLL_WAITING.bannerTitle}</Text>
                <Text style={styles.connectText}>{ENROLL_WAITING.bannerText}</Text>
                <Button
                  title={ENROLL_WAITING.bannerAction}
                  onPress={() =>
                    router.push({
                      pathname: '/conversation/devices',
                      params: { connect: '1' },
                    })
                  }
                />
              </View>
            )}
            <FolderRow
              folder={folder}
              requestCount={requestCount}
              onOpen={(value) => {
                setFolder(value)
                action.reset()
              }}
            />
          </View>
        }
        renderItem={({ item }) =>
          item.kind === 'page' ? (
            <PageInboxRow item={item.page} />
          ) : (
            <InboxRow item={item.chat} folder={folder} userId={user!.id}>
              {folder === 'requests' && (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    title="Aceitar"
                    disabled={action.isPending}
                    onPress={() =>
                      action.mutate({ path: `/${item.chat.id}/respond`, body: { accept: true } })
                    }
                  />
                  <Button
                    title="Recusar"
                    secondary
                    disabled={action.isPending}
                    onPress={() =>
                      action.mutate({ path: `/${item.chat.id}/respond`, body: { accept: false } })
                    }
                  />
                </View>
              )}
            </InboxRow>
          )
        }
        ListEmptyComponent={
          <State
            loading={loading}
            title={
              loading
                ? 'Carregando…'
                : listError
                  ? 'Não foi possível carregar'
                  : folder === 'requests'
                    ? 'Você está em dia'
                    : 'Uma conversa pode aproximar'
            }
            description={
              listError
                ? errorMessage(listError)
                : folder === 'requests'
                  ? 'Seus convites e solicitações aparecerão aqui.'
                  : 'Toque no botão vermelho para falar com uma pessoa, um grupo ou uma página.'
            }
            retry={
              listError
                ? () => {
                    if (chatEnabled) void list.refetch()
                    if (folder === 'active') void pageList.refetch()
                  }
                : undefined
            }
          />
        }
        ListFooterComponent={
          <ConversationLoadingMore
            loading={fetchingMore}
            more={hasMore}
            onMore={() => {
              if (chatEnabled && list.hasNextPage) void list.fetchNextPage()
              if (folder === 'active' && pageList.hasNextPage) void pageList.fetchNextPage()
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
        <BrandMark />
        <Text accessibilityRole="header" style={styles.headerTitle}>
          Conversas
        </Text>
        <InboxMenu />
      </View>
      <ConversationGate allowWithoutChat>
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
    paddingLeft: 12,
    paddingRight: 8,
    gap: 12,
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
  connectCard: {
    margin: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
    gap: 8,
    backgroundColor: theme.colors.tint,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  connectTitle: {
    fontFamily: theme.fonts.heading,
    fontSize: 16,
    color: theme.colors.text,
  },
  connectText: {
    fontFamily: theme.fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.muted,
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
