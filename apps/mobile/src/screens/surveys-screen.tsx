import { useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import { router, type Href } from 'expo-router'
import CheckCircle2 from 'lucide-react-native/icons/check-circle-2'
import Lock from 'lucide-react-native/icons/lock'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import {
  SURVEY_KIND_LABELS,
  SURVEY_ORIGIN_LABELS,
  type SurveyStatus,
  type SurveySummaryView,
} from '@votz/shared-types'
import { Screen, Toolbar } from '../components/screen'
import { Card, State, TabStrip } from '../components/ui'
import { useMySurveyInvitations, usePublicSurveys, useSurveysEnabled } from '../hooks/use-surveys'
import { theme } from '../theme'

const STATUS_TABS: readonly { value: SurveyStatus; label: string }[] = [
  { value: 'OPEN', label: 'Abertas' },
  { value: 'CLOSED', label: 'Encerradas' },
]

function SurveyRow({ survey }: { survey: SurveySummaryView }) {
  const scopeLabel =
    survey.scope === 'NATIONAL'
      ? 'Nacional'
      : survey.scope === 'STATE'
        ? survey.targetState ?? ''
        : `${survey.targetCity ?? ''}/${survey.targetState ?? ''}`

  return (
    <Pressable onPress={() => router.push(`/pesquisas/${survey.slug}` as Href)}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: theme.colors.primary,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 99,
            }}
          >
            <ShieldCheck size={11} color={theme.colors.surface} />
            <Text style={{ color: theme.colors.surface, fontFamily: theme.fonts.medium, fontSize: 10 }}>
              {SURVEY_ORIGIN_LABELS[survey.origin].toUpperCase()}
            </Text>
          </View>
          <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: theme.colors.muted }}>
            {SURVEY_KIND_LABELS[survey.kind]}{scopeLabel ? ` · ${scopeLabel}` : ''}
          </Text>
          {survey.hasVoted && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <CheckCircle2 size={13} color={theme.colors.positive} />
              <Text style={{ fontFamily: theme.fonts.medium, fontSize: 11, color: theme.colors.positive }}>
                Você participou
              </Text>
            </View>
          )}
        </View>

        <Text style={{ fontFamily: theme.fonts.heading, fontSize: 17, color: theme.colors.primary, lineHeight: 23 }}>
          {survey.title}
        </Text>
        {survey.subtitle ? (
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.muted, lineHeight: 20 }}>
            {survey.subtitle}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: theme.colors.muted }}>
            {survey.verificationLevel === 'VERIFIED_CPF' ? 'Exige CPF verificado' : 'Conta verificada'}
          </Text>
          <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: theme.colors.primary }}>
            {survey.totalBallots.toLocaleString('pt-BR')} participações
          </Text>
        </View>
      </Card>
    </Pressable>
  )
}

export default function SurveysScreen() {
  const enabled = useSurveysEnabled()
  const [status, setStatus] = useState<SurveyStatus>('OPEN')
  const query = usePublicSurveys(status)
  const invitations = useMySurveyInvitations()

  return (
    <Screen>
      <Toolbar title="Pesquisa Votz" />
      <TabStrip tabs={STATUS_TABS} value={status} onChange={setStatus} />
      {!enabled ? (
        <State title="Pesquisa Votz indisponível" description="Este recurso ainda não foi liberado neste ambiente." />
      ) : (
        <FlatList
          style={{ flex: 1, backgroundColor: theme.colors.soft }}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40, flexGrow: 1 }}
          data={query.data ?? []}
          keyExtractor={(item) => item.id}
          refreshing={query.isRefetching}
          onRefresh={() => { void query.refetch() }}
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 4 }}>
              <Card>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <Lock size={18} color={theme.colors.positive} style={{ marginTop: 2 }} />
                  <Text style={{ flex: 1, fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.text, lineHeight: 19 }}>
                    Seu voto é separado criptograficamente da sua conta, embaralhado em lotes e nunca usado para anúncios.
                  </Text>
                </View>
              </Card>
              {invitations.data && invitations.data.length > 0 && (
                <Card style={{ borderColor: theme.colors.primary, borderWidth: 1.5 }}>
                  <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: theme.colors.primary }}>
                    Convites exclusivos ({invitations.data.length})
                  </Text>
                  {invitations.data.map((inv) => (
                    <Pressable
                      key={inv.invitationId}
                      onPress={() => router.push(`/pesquisas/${inv.survey.slug}` as Href)}
                      style={{ paddingVertical: 6 }}
                    >
                      <Text style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: theme.colors.primary }}>
                        {inv.survey.title} →
                      </Text>
                      <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: theme.colors.muted }}>
                        Amostra sorteada independente · Voto 100% anônimo
                      </Text>
                    </Pressable>
                  ))}
                </Card>
              )}
            </View>
          }
          renderItem={({ item }) => <SurveyRow survey={item} />}
          ListEmptyComponent={
            <State
              loading={query.isPending}
              title={query.isPending ? 'Carregando pesquisas…' : status === 'OPEN' ? 'Nenhuma pesquisa aberta' : 'Nenhuma pesquisa encerrada'}
              description={query.isPending ? undefined : 'Quando uma nova Pesquisa Votz oficial for publicada, ela aparecerá aqui.'}
              retry={query.isError ? () => { void query.refetch() } : undefined}
            />
          }
        />
      )}
    </Screen>
  )
}
