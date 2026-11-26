import { useCallback, useEffect, useRef, useState, type ComponentRef, type PropsWithChildren, type ReactNode } from 'react'
import { Dimensions, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View, type ScrollViewProps } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import ArrowLeft from 'lucide-react-native/icons/arrow-left'
import ChevronDown from 'lucide-react-native/icons/chevron-down'
import { IconButton, styles } from './ui'
import { useAppTheme } from '../theme-context'
import { RevealInput, type InputHandle } from './keyboard-context'

// The avoiding view owns the full screen (including our toolbar), so it needs
// no guessed navigation-header offset. This also works with Android edge-to-edge.
// Com o teclado aberto a área segura de baixo não existe mais: sem isso sobra uma faixa em branco entre o campo e o teclado.
function useKeyboardVisible() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true))
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false))
    return () => { show.remove(); hide.remove() }
  }, [])
  return visible
}
export function Screen({ children, tabs = false }: PropsWithChildren<{ tabs?: boolean }>) {
  const { colors } = useAppTheme()
  const keyboard = useKeyboardVisible()
  const bg = { flex: 1, backgroundColor: colors.background }
  return <KeyboardAvoidingView behavior="padding" style={bg}>
    <SafeAreaView edges={tabs || keyboard ? ['top'] : ['top', 'bottom']} style={bg}>{children}</SafeAreaView>
  </KeyboardAvoidingView>
}
export function Brand() {
  const { resolvedMode, colors, theme } = useAppTheme()
  if (resolvedMode === 'dark') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }} accessibilityLabel="Votz">
        <Image source={require('../../assets/votz-mark.svg')} style={{ width: 28, height: 28 }} contentFit="contain" />
        <Text style={{ fontFamily: theme.fonts.heading, fontSize: 20, letterSpacing: 1.2, color: colors.text }}>VOTZ</Text>
      </View>
    )
  }
  return <Image source={require('../../assets/votz-logo.svg')} style={{ width: 105, height: 30 }} contentFit="contain" accessibilityLabel="Votz" />
}
/** Só o V do Votz: ocupa o lugar do botão voltar nas telas de aba, que não têm para onde voltar. */
export function BrandMark() {
  return <Image source={require('../../assets/votz-mark.svg')} style={{ width: 30, height: 30 }} contentFit="contain" accessibilityLabel="Votz" />
}
/** `onBrandPress` faz do logo um botão com seta (como o Instagram): usado para abrir o menu de qual feed ver. */
export function Toolbar({ title, back, left, right, brand, onBrandPress, brandLabel }: { title?: string; back?: boolean; left?: ReactNode; right?: ReactNode; brand?: boolean; onBrandPress?: () => void; brandLabel?: string }) {
  const { colors, theme } = useAppTheme()
  return <View style={{ height: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
    <View style={{ minWidth: 36 }}>{left || (back ? <IconButton label="Voltar" onPress={() => router.canGoBack() ? router.back() : router.replace('/')}><ArrowLeft size={23} color={colors.primary} /></IconButton> : !brand && <BrandMark />)}</View>
    <View style={{ flex: 1, alignItems: brand ? 'center' : 'flex-start' }}>{brand ? (onBrandPress ? <Pressable accessibilityRole="button" accessibilityLabel={brandLabel || 'Escolher o que ver'} onPress={onBrandPress} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 }}><Brand /><ChevronDown size={18} color={colors.primary} /></Pressable> : <Brand />) : <Text numberOfLines={1} style={{ fontFamily: theme.fonts.heading, fontSize: 19, color: colors.primary }}>{title}</Text>}</View>
    <View style={{ minWidth: 36, alignItems: 'flex-end' }}>{right}</View>
  </View>
}

// A focused field near the end of a long form must be scrolled as well as
// avoiding the keyboard. Measurements use screen coordinates, like keyboard metrics.
export function FormScroll({ children, contentContainerStyle, ...props }: ScrollViewProps) {
  const { colors } = useAppTheme()
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null)
  const focused = useRef<InputHandle | null>(null)
  const offset = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reveal = useCallback(() => {
    focused.current?.measureInWindow((_x, y, _width, height) => {
      const bottom = Keyboard.metrics()?.screenY ?? Dimensions.get('window').height
      const overflow = y + Math.min(height, 170) + 24 - bottom
      if (overflow > 0) scroll.current?.scrollTo({ y: offset.current + overflow, animated: true })
    })
  }, [])
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(reveal, 180)
  }, [reveal])
  useEffect(() => {
    const listener = Keyboard.addListener('keyboardDidShow', schedule)
    return () => { listener.remove(); if (timer.current) clearTimeout(timer.current) }
  }, [schedule])
  return <RevealInput.Provider value={(input) => { focused.current = input; schedule() }}>
    <ScrollView {...props} ref={scroll} style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={[styles.content, contentContainerStyle]}
      keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      scrollEventThrottle={16} onScroll={(event) => { offset.current = event.nativeEvent.contentOffset.y; props.onScroll?.(event) }}
      onLayout={(event) => { schedule(); props.onLayout?.(event) }}>
      {children}
    </ScrollView>
  </RevealInput.Provider>
}
