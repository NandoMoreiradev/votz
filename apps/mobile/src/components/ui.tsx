import type { PropsWithChildren } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle, type StyleProp } from 'react-native'
import { Image } from 'expo-image'
import { theme } from '../theme'

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
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 8 }}><Label>{label}</Label><TextInput accessibilityLabel={label} placeholderTextColor={theme.colors.muted} {...props} style={[styles.input, props.multiline && { minHeight: 130, textAlignVertical: 'top' }, props.style]} /></View>
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
  heading: { fontFamily: theme.fonts.heading, fontSize: 25, color: theme.colors.primary, lineHeight: 32 },
  button: { backgroundColor: theme.colors.action, borderRadius: theme.radius.sm, minHeight: 48, paddingHorizontal: 18, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: theme.colors.background },
  buttonText: { fontFamily: theme.fonts.medium, color: theme.colors.surface, fontSize: 15 },
  input: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: 14, minHeight: 50, fontSize: 16, color: theme.colors.text, fontFamily: theme.fonts.body },
  card: { backgroundColor: theme.colors.surface, padding: 18, borderRadius: theme.radius.md, gap: 14, borderWidth: 1, borderColor: theme.colors.border },
  avatar: { backgroundColor: theme.colors.tint, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: theme.fonts.heading, color: theme.colors.action, fontSize: 20 },
  state: { padding: 28, gap: 18, alignItems: 'center' },
  error: { color: theme.colors.action, fontFamily: theme.fonts.body, lineHeight: 22 },
  page: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, gap: 18, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
})
