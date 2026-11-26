import { useEffect } from 'react'
import { Keyboard, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Check from 'lucide-react-native/icons/check'
import X from 'lucide-react-native/icons/x'
import { IconButton } from './ui'
import { useAppTheme } from '../theme-context'

export function ChoiceSheet<T extends string>({
  visible,
  title,
  subtitle,
  options,
  value,
  onChange,
  onClose,
}: {
  visible: boolean
  title: string
  subtitle?: string
  options: readonly { value: T; label: string }[]
  value: T | null
  onChange: (value: T) => void
  onClose: () => void
}) {
  const { colors, theme } = useAppTheme()
  useEffect(() => {
    if (visible) Keyboard.dismiss()
  }, [visible])
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
            maxHeight: '78%',
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 2 }}>
            <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>
          <View
            style={{
              minHeight: 52,
              paddingLeft: 20,
              paddingRight: 12,
              paddingVertical: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottomWidth: 0.5,
              borderBottomColor: colors.border,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: theme.fonts.heading, fontSize: 19, color: colors.primary }}>{title}</Text>
              {!!subtitle && (
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>{subtitle}</Text>
              )}
            </View>
            <IconButton label="Fechar opções" onPress={onClose}>
              <X size={22} color={colors.primary} />
            </IconButton>
          </View>
          <ScrollView contentContainerStyle={{ paddingVertical: 6, paddingBottom: 14 }}>
            {options.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: value === option.value }}
                onPress={() => {
                  onChange(option.value)
                  onClose()
                }}
                style={({ pressed }) => ({
                  minHeight: 50,
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: pressed ? colors.soft : 'transparent',
                })}
              >
                <Text
                  style={{
                    fontFamily: value === option.value ? theme.fonts.medium : theme.fonts.body,
                    fontSize: 15,
                    color: value === option.value ? colors.action : colors.primary,
                  }}
                >
                  {option.label}
                </Text>
                {value === option.value && <Check size={20} color={colors.action} />}
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  )
}
