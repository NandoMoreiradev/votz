import { Pressable, Switch, Text, View } from 'react-native'
import { Redirect } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AD_INTERESTS,
  AD_MAX_DECLARED_INTERESTS,
  AD_PREFERENCES_COPY as COPY,
  USER_GENDER_LABELS,
  type AdInterestId,
  type AdPreferencesView,
  type UpdateAdPreferencesInput,
} from '@votz/shared-types'
import { ErrorText, State } from '../components/ui'
import { FormScroll, Screen, Toolbar } from '../components/screen'
import { api, errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'

const KEY = ['ads', 'preferences', 'me']
const INTEREST_GROUPS = [...new Set(AD_INTERESTS.map((interest) => interest.group))]

/** "Preferências de anúncios": aceite da personalização (opt-in) e interesses. Mesmos textos do site. */
export default function AdPreferencesScreen() {
  const { colors, theme } = useAppTheme()
  const user = useSession((s) => s.user)
  const client = useQueryClient()
  const preferences = useQuery({ queryKey: KEY, queryFn: () => api<AdPreferencesView>('/ads/preferences/me'), enabled: !!user })
  const update = useMutation({
    mutationFn: (input: UpdateAdPreferencesInput) => api<AdPreferencesView>('/ads/preferences/me', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: (view) => client.setQueryData(KEY, view),
  })
  if (!user) return <Redirect href="/login" />

  const data = preferences.data
  const selected = new Set<AdInterestId>(data?.interests ?? [])
  const full = selected.size >= AD_MAX_DECLARED_INTERESTS
  const demographics = data ? [data.ageBand ? `${data.ageBand} anos` : null, data.gender ? USER_GENDER_LABELS[data.gender] : null].filter(Boolean).join(' · ') : ''

  function toggleInterest(id: AdInterestId) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else if (!full) next.add(id)
    else return
    update.mutate({ interests: [...next] })
  }

  return <Screen>
    <Toolbar title={COPY.title} back />
    {preferences.isPending ? <State loading title="Carregando" />
      : preferences.isError || !data ? <State title="Não foi possível carregar" description={errorMessage(preferences.error)} retry={() => preferences.refetch()} />
      : <FormScroll>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>{COPY.intro}</Text>

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 15, color: colors.text }}>{COPY.toggleLabel}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{data.personalizationConsent ? COPY.toggleOn : COPY.toggleOff}</Text>
          </View>
          <Switch
            accessibilityLabel={COPY.toggleLabel}
            value={data.personalizationConsent}
            disabled={update.isPending}
            onValueChange={(value) => update.mutate({ personalizationConsent: value })}
            trackColor={{ false: colors.border, true: colors.positive }}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>{COPY.usedTitle}</Text>
          {COPY.usedItems.map((item) => <Text key={item} style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>• {item}</Text>)}
          {!!demographics && <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, paddingTop: 4 }}>Hoje: {demographics}. {COPY.demographicsHint}</Text>}
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>{COPY.neverTitle}</Text>
          {COPY.neverItems.map((item) => <Text key={item} style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>• {item}</Text>)}
          <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary, marginTop: 8 }}>{COPY.messagesTitle}</Text>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{COPY.messagesText}</Text>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>{COPY.interestsTitle}</Text>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{COPY.interestsHint}</Text>
          {INTEREST_GROUPS.map((group) => <View key={group} style={{ gap: 8 }}>
            <Text style={{ color: colors.muted, fontSize: 11, fontFamily: theme.fonts.medium, textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 6 }}>{group}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {AD_INTERESTS.filter((interest) => interest.group === group).map((interest) => {
                const isSelected = selected.has(interest.id)
                const blocked = update.isPending || (full && !isSelected)
                return <Pressable
                  key={interest.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: blocked }}
                  accessibilityLabel={interest.label}
                  disabled={blocked}
                  onPress={() => toggleInterest(interest.id)}
                  style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, borderWidth: 1.5, borderColor: isSelected ? colors.action : colors.border, backgroundColor: isSelected ? colors.action : colors.surface, opacity: blocked && !isSelected ? 0.45 : 1 }}
                >
                  <Text style={{ fontSize: 14, color: isSelected ? colors.onAccent : colors.text }}>{interest.label}</Text>
                </Pressable>
              })}
            </View>
          </View>)}
          {full && <Text style={{ color: colors.muted, fontSize: 13 }}>{COPY.interestsLimit}</Text>}
        </View>

        <ErrorText message={update.isError ? COPY.saveError : undefined} />
        {update.isSuccess && !update.isPending && <Text accessibilityRole="alert" style={{ color: colors.positive, fontSize: 13 }}>{COPY.saved}</Text>}
      </FormScroll>}
  </Screen>
}
