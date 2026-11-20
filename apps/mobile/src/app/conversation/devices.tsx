import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { requireOptionalNativeModule } from 'expo'
import { useQueryClient } from '@tanstack/react-query'
import Monitor from 'lucide-react-native/icons/monitor'
import QrCode from 'lucide-react-native/icons/qr-code'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import Smartphone from 'lucide-react-native/icons/smartphone'
import {
  ChatDeviceDisconnectedError,
  ENROLL_WAITING,
  chatError,
  deviceRequestText,
  enrollDevice,
  parseDeviceLinkQr,
  type ChatDeviceInfo,
  type ChatDeviceLink,
  type ChatEnrollment,
  type ChatPendingLink,
} from '@votz/chat-core'
import { ConversationGate } from '../../components/conversation-ui'
import { DeviceLinkQr } from '../../components/device-link-qr'
import { Screen, Toolbar } from '../../components/screen'
import { SettingsRow } from '../../components/settings-ui'
import { Button, ErrorText, Field, Heading, Label, State } from '../../components/ui'
import { useChatDeviceAction, useChatDevices } from '../../hooks/use-chat-devices'
import { useConversationScope } from '../../hooks/use-conversations'
import { ApiError, api, errorMessage, json } from '../../lib/api'
import { forgetNativeChat, nativeChatStorage } from '../../lib/chat-storage'
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
          <Button
            title={request.allow}
            disabled={busy}
            onPress={() => onDecide(true)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title={request.deny}
            secondary
            disabled={busy}
            onPress={() => onDecide(false)}
          />
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

function QrScannerModal({
  visible,
  onClose,
  onScanned,
}: {
  visible: boolean
  onClose: () => void
  onScanned: (raw: string) => void
}) {
  const [CameraView, setCameraView] = useState<
    null | React.ComponentType<{
      style?: object
      facing?: 'back' | 'front'
      barcodeScannerSettings?: { barcodeTypes: string[] }
      onBarcodeScanned?: (event: { data: string }) => void
    }>
  >(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const scannedRef = useRef(false)

  useEffect(() => {
    if (!visible) {
      scannedRef.current = false
      return
    }
    let active = true
    ;(async () => {
      if (!requireOptionalNativeModule('ExpoCamera')) {
        if (active) {
          Alert.alert(
            'Leitura por câmera',
            'A leitura do código QR pela câmera chega na próxima atualização do aplicativo. Por enquanto, digite os 6 dígitos abaixo.',
          )
          onClose()
        }
        return
      }
      try {
        // Carregamento dinâmico opcional para não quebrar builds sem expo-camera.
        const mod = (await import('expo-camera' as string)) as {
          Camera?: { requestCameraPermissionsAsync?: () => Promise<{ status: string }> }
          CameraView?: React.ComponentType<{
            style?: object
            facing?: 'back' | 'front'
            barcodeScannerSettings?: { barcodeTypes: string[] }
            onBarcodeScanned?: (event: { data: string }) => void
          }>
        }
        const perm = await mod.Camera?.requestCameraPermissionsAsync?.()
        if (!active) return
        if (perm && perm.status !== 'granted') {
          setPermissionDenied(true)
          return
        }
        if (mod.CameraView) setCameraView(() => mod.CameraView!)
      } catch {
        if (active) {
          Alert.alert(
            'Leitura por câmera',
            'Não foi possível abrir a câmera agora. Digite os 6 dígitos mostrados no outro aparelho.',
          )
          onClose()
        }
      }
    })()
    return () => {
      active = false
    }
  }, [visible, onClose])

  if (!visible) return null

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={onClose}>
      <Screen>
        <Toolbar
          title="Ler código QR"
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              onPress={onClose}
              hitSlop={10}
            >
              <Text style={styles.revoke}>Fechar</Text>
            </Pressable>
          }
        />
        {permissionDenied ? (
          <View style={styles.scannerFallback}>
            <Label muted>
              Permita o uso da câmera nas configurações do aparelho ou digite os 6 dígitos na tela anterior.
            </Label>
            <Button title="Voltar" onPress={onClose} />
          </View>
        ) : CameraView ? (
          <View style={{ flex: 1 }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={(event) => {
                if (scannedRef.current) return
                scannedRef.current = true
                onScanned(event.data)
              }}
            />
            <View style={styles.scannerHint}>
              <Text style={styles.scannerHintText}>
                Aponte a câmera para o código QR na tela do outro aparelho.
              </Text>
            </View>
          </View>
        ) : (
          <State loading title="Abrindo câmera…" />
        )}
      </Screen>
    </Modal>
  )
}

function Devices() {
  const params = useLocalSearchParams<{ connect?: string }>()
  const scope = useConversationScope()
  const queryClient = useQueryClient()
  const list = useChatDevices()
  const action = useChatDeviceAction()
  const [codeInput, setCodeInput] = useState('')
  const [codeFeedback, setCodeFeedback] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [connecting, setConnecting] = useState(params.connect === '1')
  const [pendingSelf, setPendingSelf] = useState<ChatPendingLink | null>(null)
  const [connectError, setConnectError] = useState('')

  const devices = list.data?.devices || []
  const links = list.data?.links || []
  // 401 aqui significa que ESTE aparelho ainda não ativou as conversas.
  const notActivated =
    list.error instanceof ApiError && list.error.status === 401

  useEffect(() => {
    if (!connecting || !scope.user?.id) return
    const controller = new AbortController()
    const userId = scope.user.id
    setConnectError('')
    ;(async () => {
      try {
        const storage = await nativeChatStorage(userId)
        await enrollDevice(
          () =>
            api<ChatEnrollment>('/conversations/chat/devices', {
              ...json({
                ...storage.credentials,
                label: Platform.OS === 'ios' ? 'Votz no iPhone' : 'Votz no Android',
              }),
              signal: controller.signal,
            }),
          {
            onPending: (value) => {
              if (!controller.signal.aborted) setPendingSelf(value)
            },
            signal: controller.signal,
          },
        )
        if (controller.signal.aborted) return
        setPendingSelf(null)
        setConnecting(false)
        await queryClient.invalidateQueries({ queryKey: scope.key })
      } catch (failure) {
        if (controller.signal.aborted) return
        const status = failure instanceof ApiError ? failure.status : undefined
        if (failure instanceof ChatDeviceDisconnectedError || status === 410) {
          await forgetNativeChat(userId)
          setPendingSelf(null)
          setConnecting(false)
          if (status === 410) {
            setConnectError(
              'O pedido anterior expirou. Toque em Conectar agora para gerar um novo código.',
            )
          }
          return
        }
        setConnectError(chatError(failure))
      }
    })()
    return () => controller.abort()
  }, [connecting, scope.user?.id, scope.key, queryClient])

  function submitCode(raw = codeInput) {
    const parsed = parseDeviceLinkQr(raw)
    if (!parsed) {
      setCodeFeedback('Digite os 6 dígitos mostrados no outro aparelho.')
      return
    }
    setCodeFeedback('')
    action.mutate(
      { type: 'approve-code', code: parsed.code, linkId: parsed.linkId },
      {
        onSuccess: () => {
          setCodeInput('')
          setCodeFeedback('Aparelho permitido com sucesso.')
        },
      },
    )
  }

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

  if (connecting) {
    return (
      <View style={styles.connectBox}>
        <ShieldCheck size={28} color={theme.colors.primary} />
        <Heading>{ENROLL_WAITING.title}</Heading>
        {pendingSelf ? (
          <>
            <Label muted>{ENROLL_WAITING.text}</Label>
            <DeviceLinkQr id={pendingSelf.id} code={pendingSelf.code} />
            <Text accessibilityLabel="Código do pedido" style={styles.bigCode}>
              {pendingSelf.code}
            </Text>
            <Label muted>{ENROLL_WAITING.qrHint}</Label>
            <Label muted>{ENROLL_WAITING.historyNote}</Label>
            <Label muted>{ENROLL_WAITING.note}</Label>
          </>
        ) : (
          <Label muted>Preparando o pedido de conexão…</Label>
        )}
        {!!connectError && <ErrorText message={connectError} />}
        <Button
          secondary
          title="Cancelar"
          onPress={() => {
            setConnecting(false)
            setPendingSelf(null)
          }}
        />
      </View>
    )
  }

  return (
    <>
      <QrScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={(raw) => {
          setScannerOpen(false)
          submitCode(raw)
        }}
      />
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
            {list.isSuccess && (
              <View style={styles.connectCard}>
                <Text style={styles.cardTitle}>{ENROLL_WAITING.enterCodeTitle}</Text>
                <Label muted>{ENROLL_WAITING.enterCodeHint}</Label>
                <Field
                  accessibilityLabel="Código de 6 dígitos"
                  keyboardType="number-pad"
                  maxLength={7}
                  placeholder="000 000"
                  value={codeInput}
                  onChangeText={(text) => {
                    setCodeInput(text)
                    if (codeFeedback) setCodeFeedback('')
                  }}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title={ENROLL_WAITING.enterCodeAction}
                      disabled={action.isPending || !parseDeviceLinkQr(codeInput)}
                      onPress={() => submitCode()}
                    />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={ENROLL_WAITING.scanQrAction}
                    onPress={() => setScannerOpen(true)}
                    style={styles.qrButton}
                  >
                    <QrCode size={20} color={theme.colors.primary} />
                    <Text style={styles.qrButtonText}>QR</Text>
                  </Pressable>
                </View>
                {!!codeFeedback && <Label muted>{codeFeedback}</Label>}
              </View>
            )}
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
          notActivated ? (
            <View style={{ padding: 16, gap: 12 }}>
              <State
                title="Abra uma conversa primeiro"
                description="Conecte este aparelho para ver seus aparelhos conectados e usar suas mensagens por aqui."
              />
              <Button
                title={ENROLL_WAITING.bannerAction}
                onPress={() => setConnecting(true)}
              />
            </View>
          ) : (
            <State
              loading={list.isPending}
              title={
                list.isPending
                  ? 'Carregando…'
                  : list.isError
                    ? 'Não foi possível carregar'
                    : 'Nenhum aparelho conectado'
              }
              description={list.isError ? errorMessage(list.error) : undefined}
              retry={
                list.isError
                  ? () => {
                      void list.refetch()
                    }
                  : undefined
              }
            />
          )
        }
      />
    </>
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
  connectCard: {
    padding: 16,
    gap: 10,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  connectBox: {
    padding: 20,
    gap: 12,
    alignItems: 'center',
  },
  bigCode: {
    fontSize: 30,
    letterSpacing: 5,
    fontFamily: theme.fonts.heading,
    color: theme.colors.primary,
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
  qrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.tint,
  },
  qrButtonText: {
    fontSize: 14,
    fontFamily: theme.fonts.medium,
    color: theme.colors.primary,
  },
  scannerFallback: {
    padding: 24,
    gap: 16,
  },
  scannerHint: {
    padding: 16,
    backgroundColor: theme.colors.primary,
  },
  scannerHintText: {
    color: theme.colors.surface,
    textAlign: 'center',
    fontSize: 14,
    fontFamily: theme.fonts.body,
  },
})
