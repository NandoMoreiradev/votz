import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router, type Href } from 'expo-router'
import Lock from 'lucide-react-native/icons/lock'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import X from 'lucide-react-native/icons/x'
import { SURVEY_KIND_LABELS, SURVEY_ORIGIN_LABELS } from '@votz/shared-types'
import { useFeaturedSurveys } from '../hooks/use-surveys'
import { useAppTheme } from '../theme-context'

export function FeaturedSurveyCard() {
  const { colors, theme } = useAppTheme()
  const { data } = useFeaturedSurveys()
  const [dismissed, setDismissed] = useState<string[]>([])

  const survey = (data ?? []).find((s) => !dismissed.includes(s.id))
  if (!survey) return null

  const scopeLabel =
    survey.scope === 'NATIONAL'
      ? 'Nacional'
      : survey.scope === 'STATE'
        ? survey.targetState ?? ''
        : `${survey.targetCity ?? ''}/${survey.targetState ?? ''}`

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderBottomWidth: 0.5,
        borderTopWidth: 0.5,
        borderColor: colors.border,
        padding: 16,
        marginBottom: 8,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: colors.badgeBg,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 99,
            }}
          >
            <ShieldCheck size={12} color={colors.onAccent} />
            <Text style={{ color: colors.onAccent, fontFamily: theme.fonts.medium, fontSize: 11 }}>
              {SURVEY_ORIGIN_LABELS[survey.origin].toUpperCase()}
            </Text>
          </View>
          <Text style={{ color: colors.muted, fontFamily: theme.fonts.medium, fontSize: 12 }}>
            {SURVEY_KIND_LABELS[survey.kind]}{scopeLabel ? ` · ${scopeLabel}` : ''}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dispensar pesquisa por agora"
          onPress={() => setDismissed((prev) => [...prev, survey.id])}
          style={{ padding: 4 }}
        >
          <X size={16} color={colors.muted} />
        </Pressable>
      </View>

      <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary, lineHeight: 22 }}>
        {survey.title}
      </Text>
      {survey.subtitle ? (
        <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: colors.muted, lineHeight: 20 }}>
          {survey.subtitle}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Lock size={13} color={colors.positive} />
          <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: colors.positive }}>
            Voto anônimo e seguro
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/pesquisas/${survey.slug}` as Href)}
          style={{
            backgroundColor: colors.action,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
          }}
        >
          <Text style={{ color: colors.onAccent, fontFamily: theme.fonts.medium, fontSize: 13 }}>
            {survey.hasVoted ? 'Ver pesquisa' : 'Participar'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
