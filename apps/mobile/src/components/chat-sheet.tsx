import type { PropsWithChildren, ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppTheme } from '../theme-context'

/** Linha de um menu (cabeçalho ou mensagem): ícone, texto e, se quiser, algo à direita. */
export function MenuItem({
  label,
  icon,
  trailing,
  onPress,
}: {
  label: string
  icon?: ReactNode
  trailing?: ReactNode
  onPress?: () => void
}) {
  const { colors, theme } = useAppTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.soft }]}
    >
      {icon}
      <Text style={[styles.itemText, { fontFamily: theme.fonts.body, color: colors.text }]}>{label}</Text>
      {trailing}
    </Pressable>
  )
}

/** Menu pequeno no canto de cima, como o dos três pontinhos do WhatsApp. */
export function PopoverMenu({
  visible,
  onClose,
  children,
}: PropsWithChildren<{ visible: boolean; onClose: () => void }>) {
  const insets = useSafeAreaInsets()
  const { colors } = useAppTheme()
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityLabel="Fechar menu"
        style={StyleSheet.absoluteFill}
        onPress={onClose}
      />
      <View style={[styles.popover, { top: insets.top + 48, backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>
    </Modal>
  )
}

/** Onde a mensagem tocada está na tela (coordenadas da janela). */
export interface MenuAnchor {
  x: number
  y: number
  width: number
  height: number
  /** Mensagem minha: o menu alinha pela direita; da outra pessoa, pela esquerda. */
  own: boolean
}
export interface MenuAction {
  label: string
  icon: ReactNode
  onPress: () => void
}

const BAR_HEIGHT = 58
const ROW_HEIGHT = 48
const CARD_PADDING = 12
const GAP = 8
const MARGIN = 8
const REACTION_SIZE = 46

export function MessageMenu({
  anchor,
  onClose,
  reactions,
  onReact,
  actions,
}: {
  anchor: MenuAnchor | null
  onClose: () => void
  reactions: readonly string[]
  onReact: (emoji: string) => void
  actions: MenuAction[]
}) {
  const { colors } = useAppTheme()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  if (!anchor) return null
  const limitTop = insets.top + MARGIN
  const limitBottom = height - insets.bottom - MARGIN
  const top = Math.max(anchor.y, limitTop)
  const bottom = Math.min(anchor.y + anchor.height, limitBottom)
  const visibleHeight = Math.max(bottom - top, 0)
  const cardHeight = actions.length * ROW_HEIGHT + CARD_PADDING
  const roomAbove = top - limitTop
  const roomBelow = limitBottom - bottom
  let barY: number
  let cardY: number
  if (roomAbove >= BAR_HEIGHT + GAP && roomBelow >= cardHeight + GAP) {
    barY = top - GAP - BAR_HEIGHT
    cardY = bottom + GAP
  } else if (roomAbove >= BAR_HEIGHT + cardHeight + GAP * 2) {
    cardY = top - GAP - cardHeight
    barY = cardY - GAP - BAR_HEIGHT
  } else {
    barY = bottom + GAP
    cardY = barY + BAR_HEIGHT + GAP
    if (cardY + cardHeight > limitBottom) {
      cardY = limitBottom - cardHeight
      barY = cardY - GAP - BAR_HEIGHT
    }
  }
  const barWidth = Math.min(reactions.length * REACTION_SIZE + 20, width - MARGIN * 2)
  const cardWidth = Math.min(240, width - MARGIN * 2)
  const place = (menuWidth: number) => {
    const left = anchor.own ? anchor.x + anchor.width - menuWidth : anchor.x
    return Math.min(Math.max(left, MARGIN), width - MARGIN - menuWidth)
  }
  const dim = (style: object, label?: string) => (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={label ? 'button' : undefined}
      onPress={onClose}
      style={[styles.dim, style]}
    />
  )
  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {dim({ top: 0, left: 0, right: 0, height: top }, 'Fechar menu da mensagem')}
      {dim({ top: bottom, left: 0, right: 0, bottom: 0 })}
      {dim({ top, left: 0, width: anchor.x, height: visibleHeight })}
      {dim({ top, left: anchor.x + anchor.width, right: 0, height: visibleHeight })}
      <View style={[styles.bar, { top: barY, left: place(barWidth), width: barWidth, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border }]}>
        {reactions.map((emoji) => (
          <Pressable
            key={emoji}
            accessibilityRole="button"
            accessibilityLabel={`Reagir com ${emoji}`}
            onPress={() => onReact(emoji)}
            style={({ pressed }) => [styles.reaction, pressed && { backgroundColor: colors.soft }]}
          >
            <Text style={styles.reactionText}>{emoji}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.card, { top: cardY, left: place(cardWidth), width: cardWidth, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border }]}>
        {actions.map((action) => (
          <MenuItem
            key={action.label}
            label={action.label}
            icon={action.icon}
            onPress={action.onPress}
          />
        ))}
      </View>
    </Modal>
  )
}

const shadow = {
  elevation: 8,
  shadowColor: '#000000',
  shadowOpacity: 0.24,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
} as const

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: ROW_HEIGHT,
    paddingHorizontal: 18,
  },
  itemText: {
    flex: 1,
    fontSize: 16,
  },
  popover: {
    position: 'absolute',
    right: 10,
    minWidth: 240,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 0.5,
    ...shadow,
  },
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(10,12,16,0.52)',
  },
  bar: {
    position: 'absolute',
    height: BAR_HEIGHT,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderRadius: BAR_HEIGHT / 2,
    ...shadow,
  },
  reaction: {
    width: REACTION_SIZE,
    height: REACTION_SIZE,
    borderRadius: REACTION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionText: {
    fontSize: 28,
  },
  card: {
    position: 'absolute',
    paddingVertical: CARD_PADDING / 2,
    borderRadius: 14,
    ...shadow,
  },
})
