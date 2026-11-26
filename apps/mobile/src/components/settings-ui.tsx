import type { PropsWithChildren, ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ChevronRight from 'lucide-react-native/icons/chevron-right'
import { useAppTheme } from '../theme-context'

/** Bloco de configurações com título pequeno, como nos aplicativos de mensagem. */
export function SettingsSection({ title, children }: PropsWithChildren<{ title: string }>) {
  const { colors, theme } = useAppTheme()
  return (
    <View style={[styles.section, { borderBottomColor: colors.border }]}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { fontFamily: theme.fonts.medium, color: colors.action }]}>
        {title}
      </Text>
      {children}
    </View>
  )
}

/**
 * Linha de configuração: ícone, título, explicação curta e, à direita, o controle
 * (chave, seta ou nada). Linhas ainda sem efeito aparecem apagadas, com "Em breve".
 */
export function SettingsRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  chevron = false,
  soon = false,
  danger = false,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  right?: ReactNode
  onPress?: () => void
  chevron?: boolean
  soon?: boolean
  /** Ação sem volta ou que afasta alguém (sair, bloquear, denunciar): título em vermelho. */
  danger?: boolean
}) {
  const { colors, theme } = useAppTheme()
  const content = (
    <View style={[styles.row, soon && { opacity: 0.55 }]}>
      <View style={[styles.icon, { backgroundColor: colors.soft }]}>{icon}</View>
      <View style={styles.texts}>
        <Text style={[styles.title, { fontFamily: theme.fonts.body, color: danger ? colors.action : colors.text }]}>{title}</Text>
        {subtitle || soon ? (
          <Text style={[styles.subtitle, { fontFamily: theme.fonts.body, color: colors.muted }]}>{soon ? 'Em breve' : subtitle}</Text>
        ) : null}
      </View>
      {right}
      {chevron && <ChevronRight size={20} color={colors.muted} />}
    </View>
  )
  return onPress && !soon ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => pressed && { backgroundColor: colors.soft }}
    >
      {content}
    </Pressable>
  ) : (
    content
  )
}

/** Folha de baixo para escolher uma opção (uma só), com a atual marcada. */
export function OptionSheet<T extends string>({
  visible,
  title,
  help,
  options,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean
  title: string
  help?: string
  options: readonly (readonly [T, string])[]
  value: T | null
  onSelect: (value: T) => void
  onClose: () => void
}) {
  const { colors, theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityLabel="Fechar"
        style={[StyleSheet.absoluteFill, styles.dim]}
        onPress={onClose}
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border }]}>
        <View style={{ alignItems: 'center', marginBottom: 10 }}>
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
        </View>
        <Text style={[styles.sheetTitle, { fontFamily: theme.fonts.heading, color: colors.primary }]}>{title}</Text>
        {help ? <Text style={[styles.sheetHelp, { fontFamily: theme.fonts.body, color: colors.muted }]}>{help}</Text> : null}
        {options.map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ selected: key === value }}
            onPress={() => {
              onSelect(key)
              onClose()
            }}
            style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.soft }]}
          >
            <View style={[styles.radio, { borderColor: key === value ? colors.action : colors.muted }]}>
              {key === value && <View style={[styles.radioDot, { backgroundColor: colors.action }]} />}
            </View>
            <Text style={[styles.optionText, { fontFamily: theme.fonts.body, color: colors.text }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  section: {
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
  },
  sectionTitle: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  dim: {
    backgroundColor: 'rgba(10,12,16,0.56)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  sheetTitle: {
    paddingHorizontal: 20,
    fontSize: 18,
  },
  sheetHelp: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 6,
    fontSize: 13,
    lineHeight: 18,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 54,
    paddingHorizontal: 20,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
})
