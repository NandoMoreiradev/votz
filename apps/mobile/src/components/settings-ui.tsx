import type { PropsWithChildren, ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ChevronRight from 'lucide-react-native/icons/chevron-right'
import { theme } from '../theme'

/** Bloco de configurações com título pequeno, como nos aplicativos de mensagem. */
export function SettingsSection({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
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
  const content = (
    <View style={[styles.row, soon && { opacity: 0.55 }]}>
      <View style={styles.icon}>{icon}</View>
      <View style={styles.texts}>
        <Text style={[styles.title, danger && { color: theme.colors.action }]}>{title}</Text>
        {subtitle || soon ? (
          <Text style={styles.subtitle}>{soon ? 'Em breve' : subtitle}</Text>
        ) : null}
      </View>
      {right}
      {chevron && <ChevronRight size={20} color={theme.colors.muted} />}
    </View>
  )
  return onPress && !soon ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => pressed && { backgroundColor: theme.colors.soft }}
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
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.sheetTitle}>{title}</Text>
        {help ? <Text style={styles.sheetHelp}>{help}</Text> : null}
        {options.map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ selected: key === value }}
            onPress={() => {
              onSelect(key)
              onClose()
            }}
            style={({ pressed }) => [styles.option, pressed && { backgroundColor: theme.colors.soft }]}
          >
            <View style={[styles.radio, key === value && styles.radioOn]}>
              {key === value && <View style={styles.radioDot} />}
            </View>
            <Text style={styles.optionText}>{label}</Text>
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
    borderBottomColor: theme.colors.border,
  },
  sectionTitle: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    letterSpacing: 0.3,
    color: theme.colors.action,
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
    backgroundColor: theme.colors.soft,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: theme.fonts.body,
    fontSize: 16,
    color: theme.colors.text,
  },
  subtitle: {
    fontFamily: theme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted,
  },
  dim: {
    backgroundColor: 'rgba(13,13,13,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 18,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: theme.colors.surface,
  },
  sheetTitle: {
    paddingHorizontal: 20,
    fontFamily: theme.fonts.heading,
    fontSize: 18,
    color: theme.colors.primary,
  },
  sheetHelp: {
    paddingHorizontal: 20,
    paddingTop: 4,
    fontFamily: theme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted,
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
    fontFamily: theme.fonts.body,
    fontSize: 16,
    color: theme.colors.text,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    borderColor: theme.colors.action,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.action,
  },
})
