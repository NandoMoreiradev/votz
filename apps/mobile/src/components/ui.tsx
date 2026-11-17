import { useRef, type PropsWithChildren } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle, type StyleProp } from 'react-native'
import { Image } from 'expo-image'
import { theme } from '../theme'
import { useRevealInput, type InputHandle } from './keyboard-context'

export function Label({ children, muted = false }: PropsWithChildren<{ muted?: boolean }>) {
  return <Text style={[styles.text, muted && styles.muted]}>{children}</Text>
}
export function Heading({ children }: PropsWithChildren) { return <Text style={styles.heading}>{children}</Text> }
export function Button({ title, onPress, loading, secondary, disabled }: { title: string; onPress: () => void; loading?: boolean; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading, busy: loading }} disabled={disabled || loading} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, (pressed || disabled || loading) && { opacity: 0.6 }]}>
    {loading ? <ActivityIndicator color={secondary ? theme.colors.primary : theme.colors.surface} /> : <Text style={[styles.buttonText, secondary && { color: theme.colors.primary }]}>{title}</Text>}
  </Pressable>
}
export function Field({ label, bare, ...props }: TextInputProps & { label?: string; bare?: boolean }) {
  const input = useRef<InputHandle>(null)
  const reveal = useRevealInput()
  return <View style={{ gap: 6 }}>{label && <Label>{label}</Label>}<TextInput ref={input} accessibilityLabel={props.accessibilityLabel || label} placeholderTextColor={theme.colors.muted} underlineColorAndroid="transparent" {...props}
    onFocus={(event) => { reveal(input.current); props.onFocus?.(event) }}
    style={[styles.input, props.multiline && { minHeight: 100, textAlignVertical: 'top' }, bare && { borderWidth: 0, padding: 0, borderRadius: 0 }, props.style]} /></View>
}
export function IconButton({ label, onPress, children, disabled }: PropsWithChildren<{ label: string; onPress: () => void; disabled?: boolean }>) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minWidth: 40, minHeight: 40, justifyContent: 'center', alignItems: 'center', opacity: pressed || disabled ? 0.45 : 1 })}>{children}</Pressable>
}
export function TabStrip<T extends string>({ tabs, value, onChange }: { tabs: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface }}>{tabs.map((tab) => <Pressable key={tab.value} accessibilityRole="tab" accessibilityState={{ selected: value === tab.value }} onPress={() => onChange(tab.value)} style={{ flex: 1, alignItems: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
    <Text style={{ color: value === tab.value ? theme.colors.primary : theme.colors.muted, fontFamily: theme.fonts.medium, fontSize: 14 }}>{tab.label}</Text>
    {value === tab.value && <View style={{ position: 'absolute', bottom: 0, height: 3, width: 42, borderRadius: 3, backgroundColor: theme.colors.action }} />}
  </Pressable>)}</View>
}
export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) { return <View style={[styles.card, style]}>{children}</View> }
export function Avatar({ name, uri, size = 42 }: { name: string; uri?: string | null; size?: number }) {
  return uri ? <Image source={uri} recyclingKey={uri} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" /> :
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}><Text style={styles.initial}>{name.trim().slice(0, 1).toUpperCase() || 'V'}</Text></View>
}
export function State({ title, description, retry, loading }: { title: string; description?: string; retry?: () => void; loading?: boolean }) {
  return <View style={styles.state}>{loading && <ActivityIndicator color={theme.colors.action} />}<Heading>{title}</Heading>{description && <Label muted>{description}</Label>}{retry && <Button secondary title="Tentar novamente" onPress={retry} />}</View>
}
export function ErrorText({ message }: { message?: string }) { return message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null }
export const styles = StyleSheet.create({
  text: { fontFamily: theme.fonts.body, fontSize: 15, lineHeight: 23, color: theme.colors.text },
  muted: { color: theme.colors.muted },
  heading: { fontFamily: theme.fonts.heading, fontSize: 22, color: theme.colors.primary, lineHeight: 28 },
  button: { backgroundColor: theme.colors.action, borderRadius: 22, minHeight: 40, paddingHorizontal: 16, paddingVertical: 9, justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: theme.colors.soft, borderWidth: 0.5, borderColor: theme.colors.border },
  buttonText: { fontFamily: theme.fonts.medium, color: theme.colors.surface, fontSize: 15 },
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
