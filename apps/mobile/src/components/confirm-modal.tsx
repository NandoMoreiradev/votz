import type { ReactNode } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { useAppTheme } from '../theme-context'
import { Button } from './ui'

export interface ConfirmModalProps {
  visible: boolean
  title: string
  message?: string
  icon?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
  onConfirm?: () => void
  onClose: () => void
}

/**
 * Diálogo padrão com identidade visual Votz (substitui Alert.alert nativo em confirmações e avisos).
 */
export function ConfirmModal({
  visible,
  title,
  message,
  icon,
  confirmLabel = 'Entendi',
  cancelLabel,
  danger = false,
  loading = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const { colors, theme } = useAppTheme()
  const handleConfirm = () => {
    if (onConfirm) onConfirm()
    else onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(10, 12, 16, 0.62)',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar aviso"
          onPress={loading ? undefined : onClose}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 18,
            padding: 20,
            gap: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {icon}
            <Text
              style={{
                flex: 1,
                fontFamily: theme.fonts.heading,
                fontSize: 18,
                lineHeight: 24,
                color: danger ? colors.action : colors.primary,
              }}
            >
              {title}
            </Text>
          </View>
          {!!message && (
            <Text
              style={{
                fontFamily: theme.fonts.body,
                fontSize: 14,
                lineHeight: 21,
                color: colors.muted,
              }}
            >
              {message}
            </Text>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            {!!cancelLabel && (
              <Button secondary title={cancelLabel} disabled={loading} onPress={onClose} />
            )}
            <Button title={confirmLabel} loading={loading} onPress={handleConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  )
}
