import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import Monitor from 'lucide-react-native/icons/monitor'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import Smartphone from 'lucide-react-native/icons/smartphone'
import { deviceRequestText, type ChatDeviceInfo, type ChatDeviceLink } from '@votz/chat-core'
import { ConversationGate } from '../../components/conversation-ui'
import { Screen, Toolbar } from '../../components/screen'
import { SettingsRow } from '../../components/settings-ui'
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
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <ShieldCheck size={20} color={theme.colors.action} />
        </View>
        <Text style={styles.cardTitle}>{request.title}</Text>
      </View>
      <Label muted>{request.text}</Label>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button title={request.allow} disabled={busy} onPress={() => onDecide(true)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={request.deny} secondary disabled={busy} onPress={() => onDecide(false)} />
        </View>
      </View>
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
  const label = device.current ? 'Sair' : 'Desconectar'
  return (
    <SettingsRow
      icon={
        device.platform === 'web' ? (
          <Monitor size={20} color={theme.colors.primary} />
        ) : (
          <Smartphone size={20} color={theme.colors.primary} />
        )
      }
      title={name(device)}
      subtitle={`${device.current ? 'Este aparelho · ' : ''}Conectado em ${new Date(device.createdAt).toLocaleDateString('pt-BR')}`}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} ${name(device)}`}
          disabled={busy}
          hitSlop={10}
          onPress={onRevoke}
          style={{ opacity: busy ? 0.4 : 1 }}
        >
          <Text style={styles.revoke}>{label}</Text>
        </Pressable>
      }
    />
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
    gap: 12,
    borderRadius: 16,
    backgroundColor: theme.colors.tint,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    color: theme.colors.text,
  },
  revoke: {
    fontSize: 14,
    fontFamily: theme.fonts.medium,
    color: theme.colors.action,
  },
})
