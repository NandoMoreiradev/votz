import type { ReactNode } from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import X from 'lucide-react-native/icons/x'
import { IconButton } from './ui'
import { useAppTheme } from '../theme-context'

export interface SheetItem {
  key: string
  label: string
  subtitle?: string
  icon?: ReactNode
  danger?: boolean
  onPress: () => void
}

/** Lista de ações com identidade visual Votz que sobe do rodapé. */
export function ActionSheet({
  visible,
  title,
  items,
  onClose,
}: {
  visible: boolean
  title: string
  items: readonly SheetItem[]
  onClose: () => void
}) {
  const { colors, theme } = useAppTheme()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10, 12, 16, 0.56)' }}>
        <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Fechar opções" onPress={onClose} />
        <SafeAreaView
          edges={['bottom']}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderTopWidth: 1,
            borderColor: colors.border,
            maxHeight: '80%',
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 2 }}>
            <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>
          <View
            style={{
              height: 52,
              paddingLeft: 20,
              paddingRight: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottomWidth: 0.5,
              borderBottomColor: colors.border,
            }}
          >
            <Text style={{ fontFamily: theme.fonts.heading, fontSize: 19, color: colors.primary }}>{title}</Text>
            <IconButton label="Fechar opções" onPress={onClose}>
              <X size={22} color={colors.primary} />
            </IconButton>
          </View>
          <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: 14 }}>
            {items.map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                onPress={() => {
                  onClose()
                  item.onPress()
                }}
                style={({ pressed }) => ({
                  minHeight: 54,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  backgroundColor: pressed ? colors.soft : 'transparent',
                })}
              >
                {item.icon}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{
                      fontFamily: theme.fonts.medium,
                      fontSize: 15,
                      color: item.danger ? colors.action : colors.primary,
                    }}
                  >
                    {item.label}
                  </Text>
                  {!!item.subtitle && (
                    <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                      {item.subtitle}
                    </Text>
                  )}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  )
}
