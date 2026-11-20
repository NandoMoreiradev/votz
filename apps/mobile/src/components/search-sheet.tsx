import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Keyboard, Modal, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Check from 'lucide-react-native/icons/check'
import X from 'lucide-react-native/icons/x'
import { Button, ErrorText, Field, IconButton } from './ui'
import { filterPlaces } from '../lib/ibge'
import { theme } from '../theme'

/** Lista com busca para escolher um valor entre muitos (ex.: as mais de 800 cidades de Minas Gerais). */
export function SearchSheet({ visible, title, options, value, loading, error, onRetry, onSelect, onClose }: {
  visible: boolean; title: string; options: readonly string[]; value: string
  loading?: boolean; error?: string; onRetry?: () => void; onSelect: (value: string) => void; onClose: () => void
}) {
  const [search, setSearch] = useState('')
  useEffect(() => { if (visible) Keyboard.dismiss() }, [visible])
  // A busca zera ao fechar (não ao abrir) para a próxima abertura já começar limpa.
  const close = () => { setSearch(''); onClose() }
  const shown = useMemo(() => filterPlaces(options, search), [options, search])
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000055' }}>
      <Pressable style={{ height: 60 }} accessibilityRole="button" accessibilityLabel="Fechar lista" onPress={close} />
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}>
        <View style={{ height: 54, paddingLeft: 20, paddingRight: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: theme.fonts.heading, fontSize: 19, color: theme.colors.primary }}>{title}</Text>
          <IconButton label="Fechar lista" onPress={close}><X size={22} color={theme.colors.primary} /></IconButton>
        </View>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Field accessibilityLabel={`Buscar em ${title}`} placeholder="Digite para buscar" value={search} onChangeText={setSearch} autoCorrect={false} autoCapitalize="none" />
        </View>
        {loading ? <View style={{ padding: 24 }}><ActivityIndicator color={theme.colors.action} /></View>
          : error ? <View style={{ padding: 16, gap: 12 }}><ErrorText message={error} />{onRetry && <Button secondary title="Tentar novamente" onPress={onRetry} />}</View>
          : <FlatList data={shown} keyExtractor={(item) => item} keyboardShouldPersistTaps="handled" initialNumToRender={20}
              ListEmptyComponent={<Text style={{ padding: 20, color: theme.colors.muted }}>Nada encontrado. Confira a escrita.</Text>}
              renderItem={({ item }) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: item === value }} onPress={() => { onSelect(item); close() }} style={{ minHeight: 48, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: item === value ? theme.fonts.medium : theme.fonts.body, fontSize: 15, color: item === value ? theme.colors.action : theme.colors.primary }}>{item}</Text>
                {item === value && <Check size={20} color={theme.colors.action} />}
              </Pressable>} />}
      </SafeAreaView>
    </View>
  </Modal>
}
