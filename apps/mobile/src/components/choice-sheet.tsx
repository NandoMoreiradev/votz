import { useEffect } from 'react'
import { Keyboard, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Check from 'lucide-react-native/icons/check'
import X from 'lucide-react-native/icons/x'
import { IconButton } from './ui'
import { theme } from '../theme'

export function ChoiceSheet<T extends string>({ visible, title, options, value, onChange, onClose }: { visible: boolean; title: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; onClose: () => void }) {
  useEffect(() => { if (visible) Keyboard.dismiss() }, [visible])
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000055' }}><Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Fechar opções" onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '78%' }}>
        <View style={{ height: 54, paddingLeft: 20, paddingRight: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ fontFamily: theme.fonts.heading, fontSize: 19, color: theme.colors.primary }}>{title}</Text><IconButton label="Fechar opções" onPress={onClose}><X size={22} color={theme.colors.primary} /></IconButton></View>
        <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>{options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: value === option.value }} onPress={() => { onChange(option.value); onClose() }} style={{ minHeight: 48, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ fontFamily: value === option.value ? theme.fonts.medium : theme.fonts.body, fontSize: 15, color: value === option.value ? theme.colors.action : theme.colors.primary }}>{option.label}</Text>{value === option.value && <Check size={20} color={theme.colors.action} />}</Pressable>)}</ScrollView>
      </SafeAreaView>
    </View>
  </Modal>
}
