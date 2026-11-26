import { useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import Check from 'lucide-react-native/icons/check'
import { Screen, Toolbar } from '../components/screen'
import { State } from '../components/ui'
import {
  notificationSummary,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMobileNotifications,
  useUnreadNotificationsCount,
  type MobileNotification,
} from '../hooks/use-notifications'
import { errorMessage } from '../lib/api'
import { useAppTheme } from '../theme-context'

function formatRelative(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (diffSec < 60) return 'agora'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} h`
  return `${Math.floor(diffSec / 86400)} d`
}

export default function NotificationsScreen() {
  const { colors, theme } = useAppTheme()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const { data: unreadCount = 0 } = useUnreadNotificationsCount()
  const list = useMobileNotifications({ page: 1, limit: 40, unreadOnly })
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()

  const items = list.data?.data ?? []

  const onPressItem = (item: MobileNotification) => {
    if (!item.read) markRead.mutate(item.id)
    const { route } = notificationSummary(item)
    if (route) {
      router.push(route as never)
    }
  }

  return (
    <Screen>
      <Toolbar
        title="Notificações"
        back
        right={
          unreadCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Marcar todas como lidas"
              onPress={() => markAll.mutate()}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 }}
            >
              <Check size={18} color={colors.action} />
              <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.action }}>
                Ler todas
              </Text>
            </Pressable>
          ) : undefined
        }
      />

      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: colors.surface,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        {[
          { key: 'all', label: 'Todas', value: false },
          { key: 'unread', label: unreadCount > 0 ? `Não lidas (${unreadCount})` : 'Não lidas', value: true },
        ].map((tab) => {
          const active = unreadOnly === tab.value
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="button"
              onPress={() => setUnreadOnly(tab.value)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: active ? colors.action : colors.soft,
              }}
            >
              <Text
                style={{
                  fontFamily: theme.fonts.medium,
                  fontSize: 13,
                  color: active ? '#FFFFFF' : colors.primary,
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        refreshing={list.isRefetching}
        onRefresh={() => {
          void list.refetch()
        }}
        ItemSeparatorComponent={() => (
          <View style={{ height: 0.5, backgroundColor: colors.border }} />
        )}
        renderItem={({ item }) => {
          const { label } = notificationSummary(item)
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onPressItem(item)}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 10,
                paddingHorizontal: 16,
                paddingVertical: 14,
                backgroundColor: item.read ? colors.surface : colors.soft,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  marginTop: 6,
                  backgroundColor: item.read ? 'transparent' : colors.action,
                }}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{
                    fontFamily: item.read ? theme.fonts.body : theme.fonts.medium,
                    fontSize: 14,
                    lineHeight: 20,
                    color: colors.primary,
                  }}
                >
                  {label}
                </Text>
                <Text
                  style={{
                    fontFamily: theme.fonts.body,
                    fontSize: 12,
                    color: colors.muted,
                  }}
                >
                  {formatRelative(item.createdAt)}
                </Text>
              </View>
            </Pressable>
          )
        }}
        ListEmptyComponent={
          <State
            loading={list.isPending}
            title={
              list.isPending
                ? 'Carregando…'
                : list.isError
                  ? 'Não foi possível carregar'
                  : unreadOnly
                    ? 'Tudo lido por aqui'
                    : 'Nenhuma notificação ainda'
            }
            description={
              list.isError
                ? errorMessage(list.error)
                : unreadOnly
                  ? 'Você não tem avisos não lidos no momento.'
                  : 'Quando houver novidades nos seus relatos ou publicações, elas aparecerão aqui.'
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
      />
    </Screen>
  )
}
