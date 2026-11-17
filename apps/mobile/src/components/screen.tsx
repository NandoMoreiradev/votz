import { useCallback, useEffect, useRef, type ComponentRef, type PropsWithChildren, type ReactNode } from 'react'
import { Dimensions, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, View, type ScrollViewProps } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import ArrowLeft from 'lucide-react-native/icons/arrow-left'
import { IconButton, styles } from './ui'
import { theme } from '../theme'
import { RevealInput, type InputHandle } from './keyboard-context'

// The avoiding view owns the full screen (including our toolbar), so it needs
// no guessed navigation-header offset. This also works with Android edge-to-edge.
export function Screen({ children, tabs = false }: PropsWithChildren<{ tabs?: boolean }>) {
  return <KeyboardAvoidingView behavior="padding" style={styles.page}>
    <SafeAreaView edges={tabs ? ['top'] : ['top', 'bottom']} style={styles.page}>{children}</SafeAreaView>
  </KeyboardAvoidingView>
}
export function Brand() {
  return <Image source={require('../../assets/votz-logo.svg')} style={{ width: 105, height: 30 }} contentFit="contain" accessibilityLabel="Votz" />
}
export function Toolbar({ title, back, left, right, brand }: { title?: string; back?: boolean; left?: ReactNode; right?: ReactNode; brand?: boolean }) {
  return <View style={{ height: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.surface, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }}>
    <View style={{ minWidth: 36 }}>{left || (back && <IconButton label="Voltar" onPress={() => router.canGoBack() ? router.back() : router.replace('/')}><ArrowLeft size={23} color={theme.colors.primary} /></IconButton>)}</View>
    <View style={{ flex: 1, alignItems: brand ? 'center' : 'flex-start' }}>{brand ? <Brand /> : <Text numberOfLines={1} style={{ fontFamily: theme.fonts.heading, fontSize: 19, color: theme.colors.primary }}>{title}</Text>}</View>
    <View style={{ minWidth: 36, alignItems: 'flex-end' }}>{right}</View>
  </View>
}

// A focused field near the end of a long form must be scrolled as well as
// avoiding the keyboard. Measurements use screen coordinates, like keyboard metrics.
export function FormScroll({ children, contentContainerStyle, ...props }: ScrollViewProps) {
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
    <ScrollView {...props} ref={scroll} style={{ flex: 1 }} contentContainerStyle={[styles.content, contentContainerStyle]}
      keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      scrollEventThrottle={16} onScroll={(event) => { offset.current = event.nativeEvent.contentOffset.y; props.onScroll?.(event) }}
      onLayout={(event) => { schedule(); props.onLayout?.(event) }}>
      {children}
    </ScrollView>
  </RevealInput.Provider>
}
