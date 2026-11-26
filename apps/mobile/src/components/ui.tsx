import { useRef, type PropsWithChildren } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle, type StyleProp } from 'react-native'
import { Image } from 'expo-image'
import { theme } from '../theme'
import { useAppTheme } from '../theme-context'
import { useRevealInput, type InputHandle } from './keyboard-context'

export function Label({ children, muted = false }: PropsWithChildren<{ muted?: boolean }>) {
  const { colors } = useAppTheme()
  return <Text style={[styles.text, { color: muted ? colors.muted : colors.text }]}>{children}</Text>
}
export function Heading({ children }: PropsWithChildren) {
  const { colors } = useAppTheme()
  return <Text style={[styles.heading, { color: colors.primary }]}>{children}</Text>
}
export function Button({ title, onPress, loading, secondary, disabled }: { title: string; onPress: () => void; loading?: boolean; secondary?: boolean; disabled?: boolean }) {
  const { colors } = useAppTheme()
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading, busy: loading }} disabled={disabled || loading} onPress={onPress}
    style={({ pressed }) => [
      styles.button,
      { backgroundColor: secondary ? colors.soft : colors.action },
      secondary && { borderWidth: 0.5, borderColor: colors.border },
      (pressed || disabled || loading) && { opacity: 0.6 },
    ]}>
    {loading ? <ActivityIndicator color={secondary ? colors.primary : colors.onAccent} /> : <Text style={[styles.buttonText, { color: secondary ? colors.primary : colors.onAccent }]}>{title}</Text>}
  </Pressable>
}
export function Field({ label, bare, ...props }: TextInputProps & { label?: string; bare?: boolean }) {
  const { colors } = useAppTheme()
  const input = useRef<InputHandle>(null)
  const reveal = useRevealInput()
  return <View style={{ gap: 6 }}>{label && <Label>{label}</Label>}<TextInput ref={input} accessibilityLabel={props.accessibilityLabel || label} placeholderTextColor={colors.muted} underlineColorAndroid="transparent" {...props}
    onFocus={(event) => { reveal(input.current); props.onFocus?.(event) }}
    style={[styles.input, { backgroundColor: bare ? 'transparent' : colors.surface, borderColor: colors.border, color: colors.text }, props.multiline && { minHeight: 100, textAlignVertical: 'top' }, bare && { borderWidth: 0, padding: 0, borderRadius: 0 }, props.style]} /></View>
}
export function IconButton({ label, onPress, children, disabled }: PropsWithChildren<{ label: string; onPress: () => void; disabled?: boolean }>) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minWidth: 40, minHeight: 40, justifyContent: 'center', alignItems: 'center', opacity: pressed || disabled ? 0.45 : 1 })}>{children}</Pressable>
}
export function TabStrip<T extends string>({ tabs, value, onChange }: { tabs: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  const { colors } = useAppTheme()
  return <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: colors.border, backgroundColor: colors.surface }}>{tabs.map((tab) => <Pressable key={tab.value} accessibilityRole="tab" accessibilityState={{ selected: value === tab.value }} onPress={() => onChange(tab.value)} style={{ flex: 1, alignItems: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
    <Text style={{ color: value === tab.value ? colors.primary : colors.muted, fontFamily: theme.fonts.medium, fontSize: 14 }}>{tab.label}</Text>
    {value === tab.value && <View style={{ position: 'absolute', bottom: 0, height: 3, width: 42, borderRadius: 3, backgroundColor: colors.action }} />}
  </Pressable>)}</View>
}
export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { colors } = useAppTheme()
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>
}
export function Avatar({ name, uri, size = 42 }: { name: string; uri?: string | null; size?: number }) {
  const { colors } = useAppTheme()
  return uri ? <Image source={uri} recyclingKey={uri} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" /> :
    <View style={[styles.avatar, { backgroundColor: colors.tint, width: size, height: size, borderRadius: size / 2 }]}><Text style={[styles.initial, { color: colors.action }]}>{name.trim().slice(0, 1).toUpperCase() || 'V'}</Text></View>
}
export function State({ title, description, retry, loading }: { title: string; description?: string; retry?: () => void; loading?: boolean }) {
  const { colors } = useAppTheme()
  return <View style={styles.state}>{loading && <ActivityIndicator color={colors.action} />}<Heading>{title}</Heading>{description && <Label muted>{description}</Label>}{retry && <Button secondary title="Tentar novamente" onPress={retry} />}</View>
}
export function ErrorText({ message }: { message?: string }) {
  const { colors } = useAppTheme()
  return message ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.action }]}>{message}</Text> : null
}
export const styles = StyleSheet.create({
  text: { fontFamily: theme.fonts.body, fontSize: 15, lineHeight: 23, color: theme.colors.text },
  muted: { color: theme.colors.muted },
  heading: { fontFamily: theme.fonts.heading, fontSize: 22, color: theme.colors.primary, lineHeight: 28 },
  button: { backgroundColor: theme.colors.action, borderRadius: 22, minHeight: 40, paddingHorizontal: 16, paddingVertical: 9, justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: theme.colors.soft, borderWidth: 0.5, borderColor: theme.colors.border },
  buttonText: { fontFamily: theme.fonts.medium, color: theme.colors.onAccent, fontSize: 15 },
  input: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: 14, minHeight: 50, fontSize: 16, color: theme.colors.text, fontFamily: theme.fonts.body },
  card: { backgroundColor: theme.colors.surface, padding: 14, borderRadius: theme.radius.md, gap: 10, borderWidth: 0.5, borderColor: theme.colors.border },
  avatar: { backgroundColor: theme.colors.tint, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: theme.fonts.heading, color: theme.colors.action, fontSize: 20 },
  state: { padding: 24, gap: 12, alignItems: 'center' },
  error: { color: theme.colors.action, fontFamily: theme.fonts.body, lineHeight: 22 },
  page: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
})
