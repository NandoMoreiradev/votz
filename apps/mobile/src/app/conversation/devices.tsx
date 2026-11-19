import { Alert, FlatList, StyleSheet, Text, View } from 'react-native'
import { deviceRequestText, type ChatDeviceInfo, type ChatDeviceLink } from '@votz/chat-core'
import { ConversationGate } from '../../components/conversation-ui'
import { Screen, Toolbar } from '../../components/screen'
import { Button, ErrorText, Label, State } from '../../components/ui'
import { useChatDeviceAction, useChatDevices } from '../../hooks/use-chat-devices'
import { ApiError, errorMessage } from '../../lib/api'
import { theme } from '../../theme'

const PLATFORM: Record<string, string> = {
  android: 'Android',
  ios: 'iPhone',
  web: 'Navegador',
  test: 'Teste',
}
const name = (device: { label: string | null; platform: string }) =>
  device.label || PLATFORM[device.platform] || device.platform

function PendingLink({
  link,
  busy,
  onDecide,
}: {
  link: ChatDeviceLink
  busy: boolean
  onDecide: (approve: boolean) => void
}) {
  const request = deviceRequestText(link)
  return (
    <View style={styles.card} accessibilityRole="alert">
      <Text style={styles.title}>{request.title}</Text>
      <Label muted>{request.text}</Label>
      <Button title={request.allow} disabled={busy} onPress={() => onDecide(true)} />
      <Button
        title={request.deny}
        secondary
        disabled={busy}
        onPress={() => onDecide(false)}
      />
    </View>
  )
}
function DeviceRow({
  device,
  busy,
  onRevoke,
}: {
  device: ChatDeviceInfo
  busy: boolean
  onRevoke: () => void
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title}>
          {name(device)}
          {device.current ? ' · Este aparelho' : ''}
        </Text>
        <Label muted>
          Conectado em {new Date(device.createdAt).toLocaleDateString('pt-BR')}
        </Label>
      </View>
      <Button
        title={device.current ? 'Sair' : 'Desconectar'}
        secondary
        disabled={busy}
        onPress={onRevoke}
      />
    </View>
  )
}
function Devices() {
  const list = useChatDevices()
  const action = useChatDeviceAction()
  const devices = list.data?.devices || []
  const links = list.data?.links || []
  // 401 aqui significa que ESTE aparelho ainda não ativou as conversas.
  const notActivated =
    list.error instanceof ApiError && list.error.status === 401
  function revoke(device: ChatDeviceInfo) {
    Alert.alert(
      device.current
        ? 'Sair das conversas neste aparelho?'
        : `Desconectar ${name(device)}?`,
      device.current
        ? 'Este aparelho deixa de receber mensagens e você perde o acesso ao histórico dele. Para voltar, abra uma conversa de novo; se você usa outros aparelhos, será preciso permitir este acesso.'
        : 'Esse aparelho deixa de receber mensagens novas. Mensagens que ele já recebeu continuam nele.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: device.current ? 'Sair' : 'Desconectar',
          style: 'destructive',
          onPress: () => action.mutate({ type: 'revoke', id: device.id }),
        },
      ],
    )
  }
  return (
    <FlatList
      data={devices}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshing={list.isRefetching}
      onRefresh={() => {
        void list.refetch()
      }}
      ListHeaderComponent={
        <View style={{ padding: 16, gap: 12 }}>
          <Label muted>
            Você pode usar suas conversas em até 5 aparelhos, como celular e
            navegador. Desconecte os que não usa mais.
          </Label>
          {action.isError && <ErrorText message={errorMessage(action.error)} />}
          {links.map((link) => (
            <PendingLink
              key={link.id}
              link={link}
              busy={action.isPending}
              onDecide={(approve) =>
                action.mutate({ type: approve ? 'approve' : 'deny', id: link.id })
              }
            />
          ))}
        </View>
      }
      renderItem={({ item }) => (
        <DeviceRow
          device={item}
          busy={action.isPending}
          onRevoke={() => revoke(item)}
        />
      )}
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
                  : 'Nenhum aparelho conectado'
          }
          description={
            notActivated
              ? 'Seus aparelhos aparecem aqui depois que você abrir qualquer conversa neste aparelho.'
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
export default function ChatDevicesScreen() {
  return (
    <Screen>
      <Toolbar title="Aparelhos conectados" back />
      <ConversationGate>
        <Devices />
      </ConversationGate>
    </Screen>
  )
}
const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 10,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    borderRadius: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    color: theme.colors.text,
  },
})
