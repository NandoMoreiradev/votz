import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import X from 'lucide-react-native/icons/x'
import { deviceRequestText, formatLinkCode } from '@votz/chat-core'
import {
  useChatDeviceAction,
  useChatDeviceStatus,
  useChatDevices,
} from '../hooks/use-chat-devices'
import { Button, ErrorText, Label } from './ui'
import { errorMessage } from '../lib/api'
import { theme } from '../theme'

/**
 * Aviso global em tempo real no celular já conectado: assim que outro aparelho
 * (ex.: computador) pede acesso, aparece imediatamente por cima de qualquer tela
 * para Permitir ou Negar com um toque.
 */
export function DeviceLinkPrompt() {
  const status = useChatDeviceStatus()
  const isActive = status.data?.status === 'active'
  const devices = useChatDevices(isActive)
  const action = useChatDeviceAction()
  const [dismissedIds, setDismissedIds] = useState<string[]>([])

  if (!status.data?.enabled || !isActive) return null
  const link = (devices.data?.links || []).find(
    (item) => !dismissedIds.includes(item.id),
  )
  if (!link) return null
  const request = deviceRequestText(link)

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => setDismissedIds((prev) => [...prev, link.id])}
    >
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert">
          <View style={styles.head}>
            <View style={styles.icon}>
              <ShieldCheck size={22} color={theme.colors.action} />
            </View>
            <Text style={styles.title}>{request.title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar aviso"
              hitSlop={10}
              onPress={() => setDismissedIds((prev) => [...prev, link.id])}
            >
              <X size={20} color={theme.colors.muted} />
            </Pressable>
          </View>
          <Label muted>{request.text}</Label>
          <Text style={styles.code}>{formatLinkCode(link.code)}</Text>
          {action.isError && <ErrorText message={errorMessage(action.error)} />}
          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button
                title={request.allow}
                loading={action.isPending}
                onPress={() => action.mutate({ type: 'approve', id: link.id })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title={request.deny}
                secondary
                disabled={action.isPending}
                onPress={() => action.mutate({ type: 'deny', id: link.id })}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    padding: 20,
    gap: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.tint,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    color: theme.colors.text,
  },
  code: {
    fontSize: 28,
    letterSpacing: 4,
    textAlign: 'center',
    fontFamily: theme.fonts.heading,
    color: theme.colors.primary,
    paddingVertical: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
})
