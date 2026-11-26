import { useState } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import Info from 'lucide-react-native/icons/info'
import { CONTEXT_NOTE_KIND_LABELS, CONTEXT_NOTES_BRAND } from '@votz/shared-types'
import { useShownContextNote, type ContextTargetType } from '../hooks/use-context-notes'
import { useFlagContent } from '../hooks/use-content'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'
import { ChoiceSheet } from './choice-sheet'
import { ConfirmModal } from './confirm-modal'
import { FLAG_REASONS } from './content-menu'

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

/** Cartão do Contexto da Comunidade: aparece embaixo da publicação ou do relato quando há uma nota exibida. */
export function ContextNoteCard({ type, id }: { type: ContextTargetType; id: string }) {
  const { colors, theme } = useAppTheme()
  const { data: note } = useShownContextNote(type, id)
  const user = useSession((s) => s.user)
  const flag = useFlagContent()
  const [reasons, setReasons] = useState(false)
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null)
  if (!note) return null

  return <View accessibilityLabel={CONTEXT_NOTES_BRAND.feature} style={{ marginTop: 10, borderWidth: 0.5, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: colors.primary, borderRadius: theme.radius.sm, padding: 12, gap: 6, backgroundColor: colors.soft }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Info size={15} color={colors.primary} />
      <Text style={{ flex: 1, fontFamily: theme.fonts.heading, fontSize: 13, color: colors.primary }}>{CONTEXT_NOTES_BRAND.shownTitle}</Text>
    </View>
    <Text style={{ fontFamily: theme.fonts.medium, fontSize: 11, color: colors.muted }}>{CONTEXT_NOTE_KIND_LABELS[note.kind].label}</Text>
    <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, lineHeight: 21, color: colors.text }}>{note.text}</Text>
    {note.sources.map((source) => <Pressable key={source} accessibilityRole="link" accessibilityLabel={`Abrir a fonte ${hostOf(source)}`} onPress={() => { void Linking.openURL(source).catch(() => setNotice({ title: 'Não foi possível abrir o link', message: source })) }}>
      <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.primary, textDecorationLine: 'underline' }}>Fonte: {hostOf(source)}</Text>
    </Pressable>)}
    <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>Avaliada como útil por várias pessoas do Votz.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Denunciar ou discordar desta nota" onPress={() => (user ? setReasons(true) : router.push('/login'))} style={{ minHeight: 32, justifyContent: 'center' }}>
      <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted, textDecorationLine: 'underline' }}>Denunciar ou discordar desta nota</Text>
    </Pressable>
    <ChoiceSheet visible={reasons} title="Qual o motivo?" options={FLAG_REASONS} value={null} onClose={() => setReasons(false)}
      onChange={(reason) => flag.mutate({ targetType: 'CONTEXT_NOTE', targetId: note.id, reason }, { onSuccess: () => setNotice({ title: 'Recebemos sua denúncia', message: 'A moderação vai analisar. Ela é confidencial.' }), onError: (error) => setNotice({ title: 'Não foi possível denunciar', message: errorMessage(error) }) })} />
    <ConfirmModal visible={!!notice} title={notice?.title ?? ''} message={notice?.message} onClose={() => setNotice(null)} />
  </View>
}
