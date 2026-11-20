import type { ReactNode } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import X from 'lucide-react-native/icons/x'
import { IconButton } from './ui'
import { theme } from '../theme'

export interface SheetItem { key: string; label: string; icon?: ReactNode; danger?: boolean; onPress: () => void }

/** Lista de ações que sobe do rodapé (o "⋯" dos posts e relatos). */
export function ActionSheet({ visible, title, items, onClose }: { visible: boolean; title: string; items: readonly SheetItem[]; onClose: () => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000055' }}><Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Fechar opções" onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}>
        <View style={{ height: 54, paddingLeft: 20, paddingRight: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ fontFamily: theme.fonts.heading, fontSize: 19, color: theme.colors.primary }}>{title}</Text><IconButton label="Fechar opções" onPress={onClose}><X size={22} color={theme.colors.primary} /></IconButton></View>
        <View style={{ paddingBottom: 12 }}>{items.map((item) => <Pressable key={item.key} accessibilityRole="button" onPress={() => { onClose(); item.onPress() }} style={({ pressed }) => ({ minHeight: 52, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: pressed ? theme.colors.soft : 'transparent' })}>
          {item.icon}<Text style={{ fontFamily: theme.fonts.medium, fontSize: 15, color: item.danger ? theme.colors.action : theme.colors.primary }}>{item.label}</Text>
        </Pressable>)}</View>
      </SafeAreaView>
    </View>
  </Modal>
}
