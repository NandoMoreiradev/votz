import { useState } from 'react'
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import Check from 'lucide-react-native/icons/check'
import {
  chatStorageDeleteConfirm,
  chatStorageView,
  formatStorageSize,
  STORAGE_KIND_LABEL,
} from '@votz/chat-core'
import { conversationTitle } from '@votz/shared-types'
import { ConversationGate } from '../../components/conversation-ui'
import { Screen, Toolbar } from '../../components/screen'
import { Button, ErrorText, Label, State } from '../../components/ui'
import { useChatStorage, useDeleteChatStorage } from '../../hooks/use-chat-storage'
import { useConversationList } from '../../hooks/use-conversations'
import { ApiError, errorMessage } from '../../lib/api'
import { useSession } from '../../lib/session'
import { theme } from '../../theme'

function Storage() {
  const userId = useSession((s) => s.user?.id)
  const [sort, setSort] = useState<'size' | 'date'>('size')
  const [picked, setPicked] = useState<string[]>([])
  const list = useChatStorage(sort)
  const remove = useDeleteChatStorage()
  const conversations = useConversationList('active')
  const titles = new Map(
    (conversations.data?.pages.flatMap((page) => page.items) || []).map((item) => [
      item.id,
      userId ? conversationTitle(item, userId) : 'Conversa',
    ]),
  )
  const usage = list.data?.pages[0]?.usage
  const view = usage ? chatStorageView(usage) : null
  const items = list.data?.pages.flatMap((page) => page.items) || []
  // 401 aqui significa que ESTE aparelho ainda não ativou as conversas.
  const notActivated = list.error instanceof ApiError && list.error.status === 401
  const chosenBytes = items
    .filter((item) => picked.includes(item.id))
    .reduce((total, item) => total + item.sizeBytes, 0)
  function toggle(id: string) {
    setPicked((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }
  function eraseChosen() {
    if (!picked.length) return
    Alert.alert('Apagar arquivos', chatStorageDeleteConfirm(picked.length), [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () => remove.mutate(picked, { onSuccess: () => setPicked([]) }),
      },
    ])
  }
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshing={list.isRefetching}
      onRefresh={() => {
        void list.refetch()
      }}
      onEndReached={() => {
        if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage()
      }}
      ListHeaderComponent={
        <View style={{ padding: 16, gap: 12 }}>
          <Label muted>
            {chatStorageView({ usedBytes: 0, limitBytes: 1, nearLimit: false }).help}
          </Label>
          {view && (
            <View style={{ gap: 8 }} accessibilityRole="progressbar" accessibilityLabel="Espaço usado" accessibilityValue={{ min: 0, max: 100, now: view.percent }}>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${view.percent}%`,
                      backgroundColor: view.level === 'ok' ? theme.colors.positive : theme.colors.action,
                    },
                  ]}
                />
              </View>
              <Text style={styles.summary}>{view.summary}</Text>
              {view.hint ? <Label muted>{view.hint}</Label> : null}
            </View>
          )}
          <Button title={`${view?.upgrade.label ?? 'Aumentar espaço'} · ${view?.upgrade.soon ?? 'Em breve'}`} secondary disabled onPress={() => {}} />
          {remove.isError && <ErrorText message={errorMessage(remove.error)} />}
          <View style={styles.toolbar}>
            <Text style={[styles.summary, { flex: 1 }]}>
              {picked.length
                ? `${picked.length} selecionado(s) · ${formatStorageSize(chosenBytes)}`
                : 'Seus arquivos'}
            </Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => {
                setSort(sort === 'size' ? 'date' : 'size')
                setPicked([])
              }}
            >
              <Text style={styles.link}>{sort === 'size' ? 'Maiores primeiro' : 'Mais novos primeiro'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              hitSlop={10}
              disabled={!picked.length || remove.isPending}
              onPress={eraseChosen}
              style={{ opacity: !picked.length || remove.isPending ? 0.4 : 1 }}
            >
              <Text style={styles.link}>Apagar</Text>
            </Pressable>
          </View>
        </View>
      }
      renderItem={({ item }) => {
        const on = picked.includes(item.id)
        const date = new Date(item.createdAt).toLocaleDateString('pt-BR')
        return (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${STORAGE_KIND_LABEL[item.kind]}, ${formatStorageSize(item.sizeBytes)}, ${date}`}
            onPress={() => toggle(item.id)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.colors.soft }]}
          >
            <View style={[styles.box, on && styles.boxOn]}>
              {on && <Check size={16} color={theme.colors.surface} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {STORAGE_KIND_LABEL[item.kind]} · {formatStorageSize(item.sizeBytes)}
              </Text>
              <Text style={styles.subtitle}>
                {titles.get(item.conversationId) || 'Conversa'} · {date}
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
              : notActivated
                ? 'Abra uma conversa primeiro'
                : list.isError
                  ? 'Não foi possível carregar'
                  : (view?.empty ?? 'Você ainda não enviou nenhum arquivo.')
          }
          description={
            notActivated
              ? 'Seus arquivos aparecem aqui depois que você abrir qualquer conversa neste aparelho.'
              : list.isError
                ? errorMessage(list.error)
                : undefined
          }
          retry={
            list.isError && !notActivated
              ? () => {
                  void list.refetch()
                }
              : undefined
          }
        />
      }
    />
  )
}
export default function ChatStorageScreen() {
  return (
    <Screen>
      <Toolbar title="Gerenciar armazenamento" back />
      <ConversationGate>
        <Storage />
      </ConversationGate>
    </Screen>
  )
}
const styles = StyleSheet.create({
  track: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: theme.colors.soft,
  },
  fill: { height: '100%', borderRadius: 5 },
  summary: {
    fontSize: 15,
    fontFamily: theme.fonts.medium,
    color: theme.colors.text,
  },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  link: {
    fontSize: 14,
    fontFamily: theme.fonts.medium,
    color: theme.colors.action,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: theme.colors.action, borderColor: theme.colors.action },
  title: {
    fontSize: 15,
    fontFamily: theme.fonts.medium,
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: theme.fonts.body,
    color: theme.colors.muted,
  },
})
