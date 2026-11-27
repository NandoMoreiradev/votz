import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { router, type Href } from 'expo-router'
import BadgeCheck from 'lucide-react-native/icons/badge-check'
import ExternalLink from 'lucide-react-native/icons/external-link'
import { SURVEY_KIND_LABELS } from '@votz/shared-types'
import { Screen, Toolbar } from '../components/screen'
import { Card, State } from '../components/ui'
import { useInstituteProfile } from '../hooks/use-surveys'
import { useAppTheme } from '../theme-context'

export default function InstituteProfileScreen({ slug }: { slug: string }) {
  const { colors, theme } = useAppTheme()
  const query = useInstituteProfile(slug)

  if (query.isPending || query.isError || !query.data) {
    return (
      <Screen>
        <Toolbar title="Instituto de Pesquisa" back />
        <State
          loading={query.isPending}
          title={query.isPending ? 'Carregando instituto…' : 'Instituto não encontrado'}
          retry={query.isError ? () => { void query.refetch() } : undefined}
        />
      </Screen>
    )
  }

  const { institute, surveys } = query.data

  const openWebsite = () => {
    if (!institute.website) return
    void Linking.openURL(institute.website).catch(() =>
      Alert.alert('Não foi possível abrir o site', 'Verifique o endereço e tente novamente.'),
    )
  }

  return (
    <Screen>
      <Toolbar title={institute.name} back />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.soft }}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      >
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontFamily: theme.fonts.heading, fontSize: 20, color: colors.primary, flexShrink: 1 }}>
              {institute.name}
            </Text>
            {institute.verified && <BadgeCheck size={19} color={colors.action} />}
          </View>

          <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted }}>
            {institute.legalName}
            {institute.cnpj ? ` · CNPJ ${institute.cnpj}` : ''}
          </Text>

          {!!institute.description && (
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: colors.text, lineHeight: 21 }}>
              {institute.description}
            </Text>
          )}

          {!!institute.statisticianLead && (
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted }}>
              Estatístico responsável:{' '}
              <Text style={{ fontFamily: theme.fonts.medium, color: colors.text }}>
                {institute.statisticianLead}
              </Text>
              {institute.conreLead ? ` (${institute.conreLead})` : ''}
            </Text>
          )}

          {!!institute.website && (
            <Pressable
              accessibilityRole="link"
              onPress={openWebsite}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingTop: 2 }}
            >
              <ExternalLink size={15} color={colors.action} />
              <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.action }}>
                Site oficial
              </Text>
            </Pressable>
          )}
        </Card>

        <Card>
          <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary }}>
            Pesquisas publicadas ({surveys.length})
          </Text>

          {surveys.length === 0 ? (
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted }}>
              Nenhuma pesquisa pública registrada ainda.
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {surveys.map((s) => (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/pesquisas/${s.slug}` as Href)}
                  style={{
                    paddingTop: 10,
                    borderTopWidth: 0.5,
                    borderTopColor: colors.border,
                    gap: 4,
                  }}
                >
                  <Text style={{ fontFamily: theme.fonts.medium, fontSize: 15, color: colors.primary }}>
                    {s.title}
                  </Text>
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                    {SURVEY_KIND_LABELS[s.kind]} · {s.totalBallots.toLocaleString('pt-BR')} cédulas
                    {s.tseRegistrationCode ? ` · TSE ${s.tseRegistrationCode}` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </Screen>
  )
}
