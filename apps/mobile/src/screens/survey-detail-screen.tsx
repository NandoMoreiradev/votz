import { useState } from 'react'
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import CheckCircle2 from 'lucide-react-native/icons/check-circle-2'
import Lock from 'lucide-react-native/icons/lock'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import {
  SURVEY_ANONYMITY_NOTICE,
  SURVEY_KIND_LABELS,
  SURVEY_METHODOLOGY_LABELS,
  SURVEY_ORIGIN_LABELS,
  type SurveyIneligibleReason,
} from '@votz/shared-types'
import { Screen, Toolbar } from '../components/screen'
import { Button, Card, State } from '../components/ui'
import { useSubmitSurveyVote, useSurveyDetail, useSurveyResults } from '../hooks/use-surveys'
import { errorMessage } from '../lib/api'
import { theme } from '../theme'

function formatSegmentLabel(seg: string): string {
  if (seg === 'ALL') return 'Todos'
  if (seg.startsWith('STATE:')) return `UF ${seg.slice(6)}`
  if (seg.startsWith('AGE:')) return seg.slice(4)
  if (seg === 'GENDER:FEMALE') return 'Mulher'
  if (seg === 'GENDER:MALE') return 'Homem'
  if (seg === 'GENDER:OTHER') return 'Outro'
  return seg
}

function ineligibleText(reason: SurveyIneligibleReason | null): { text: string; route?: '/login' | '/edit-profile'; cta?: string } {
  switch (reason) {
    case 'UNAUTHENTICATED':
      return { text: 'Entre na sua conta para participar desta pesquisa com anonimato garantido.', route: '/login', cta: 'Entrar no Votz' }
    case 'EMAIL_NOT_VERIFIED':
      return { text: 'Confirme seu e-mail cadastrado para poder participar.' }
    case 'ACCOUNT_TOO_NEW':
      return { text: 'Esta pesquisa exige um tempo mínimo de conta para evitar fraudes.' }
    case 'CPF_REQUIRED':
      return {
        text: 'Esta pesquisa oficial exige CPF cadastrado na sua conta (usado apenas para garantir 1 voto por pessoa, nunca ligado à sua resposta).',
        route: '/edit-profile',
        cta: 'Completar perfil',
      }
    case 'OUT_OF_TERRITORY':
      return { text: 'Esta pesquisa é restrita a moradores do território informado.', route: '/edit-profile', cta: 'Ver localização no perfil' }
    case 'INVITE_REQUIRED':
      return { text: 'Esta pesquisa é conduzida por amostra sorteada. Os resultados ficarão públicos ao encerrar.' }
    default:
      return { text: 'Você não pode votar nesta pesquisa neste momento.' }
  }
}

export default function SurveyDetailScreen({ slug }: { slug: string }) {
  const { data: survey, isPending, isError, refetch } = useSurveyDetail(slug)
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [votedSuccess, setVotedSuccess] = useState(false)
  const [segment, setSegment] = useState('ALL')

  const showResults =
    !!survey &&
    (survey.status === 'CLOSED' ||
      survey.status === 'ARCHIVED' ||
      (survey.resultsVisibility === 'AFTER_VOTE' && (survey.hasVoted || votedSuccess || survey.quorumReached)))

  const { data: results } = useSurveyResults(slug, segment, showResults)
  const submitMut = useSubmitSurveyVote(survey?.id ?? '')

  if (isPending || isError || !survey) {
    return (
      <Screen>
        <Toolbar title="Pesquisa Votz" />
        <State
          loading={isPending}
          title={isPending ? 'Carregando pesquisa…' : 'Pesquisa indisponível'}
          retry={isError ? () => { void refetch() } : undefined}
        />
      </Screen>
    )
  }

  const canVote = survey.status === 'OPEN' && survey.eligible === true && !survey.hasVoted && !votedSuccess
  const allRequiredAnswered = survey.questions.every((q) => !q.required || (answers[q.id]?.length ?? 0) > 0)

  function toggleOption(questionId: string, optionId: string, maxSelections: number, isMulti: boolean) {
    setAnswers((prev) => {
      const current = prev[questionId] ?? []
      if (!isMulti) return { ...prev, [questionId]: [optionId] }
      if (current.includes(optionId)) return { ...prev, [questionId]: current.filter((id) => id !== optionId) }
      if (current.length >= maxSelections) return prev
      return { ...prev, [questionId]: [...current, optionId] }
    })
  }

  function confirmVote() {
    submitMut.mutate(answers, {
      onSuccess: () => {
        setConfirmOpen(false)
        setVotedSuccess(true)
      },
      onError: (err) => Alert.alert('Não foi possível votar', errorMessage(err)),
    })
  }

  const inelig = !canVote && survey.status === 'OPEN' && !survey.hasVoted && !votedSuccess
    ? ineligibleText(survey.ineligibleReason)
    : null

  return (
    <Screen>
      <Toolbar title="Pesquisa Votz" />
      <ScrollView style={{ flex: 1, backgroundColor: theme.colors.soft }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 }}>
              <ShieldCheck size={12} color={theme.colors.surface} />
              <Text style={{ color: theme.colors.surface, fontFamily: theme.fonts.medium, fontSize: 11 }}>
                {SURVEY_ORIGIN_LABELS[survey.origin].toUpperCase()}
              </Text>
            </View>
            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: theme.colors.muted }}>
              {SURVEY_KIND_LABELS[survey.kind]}
            </Text>
          </View>
          <Text style={{ fontFamily: theme.fonts.heading, fontSize: 20, color: theme.colors.primary, lineHeight: 26 }}>
            {survey.title}
          </Text>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.muted, lineHeight: 21 }}>
            {survey.description}
          </Text>
        </Card>

        {(survey.hasVoted || votedSuccess) && (
          <Card style={{ backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <CheckCircle2 size={18} color="#14532D" style={{ marginTop: 2 }} />
              <Text style={{ flex: 1, fontFamily: theme.fonts.body, fontSize: 14, color: '#14532D', lineHeight: 20 }}>
                Participação registrada com anonimato. Sua resposta entrou na fila embaralhada sem vínculo com sua conta.
              </Text>
            </View>
          </Card>
        )}

        {inelig && (
          <Card style={{ backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }}>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: '#78350F', lineHeight: 20 }}>
              {inelig.text}
            </Text>
            {inelig.route && inelig.cta && (
              <Button secondary title={inelig.cta} onPress={() => router.push(inelig.route!)} />
            )}
          </Card>
        )}

        {canVote && (
          <>
            {survey.questions.map((q, idx) => {
              const selected = answers[q.id] ?? []
              const isMulti = q.type === 'MULTIPLE_CHOICE'
              return (
                <Card key={q.id}>
                  <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: theme.colors.primary }}>
                    {idx + 1}. {q.prompt}
                  </Text>
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: theme.colors.muted }}>
                    {q.helpText || (isMulti ? `Escolha até ${q.maxSelections} opções.` : 'Escolha uma opção.')}
                  </Text>

                  <View style={{ gap: 8 }}>
                    {q.options.map((opt) => {
                      const isSel = selected.includes(opt.id)
                      return (
                        <Pressable
                          key={opt.id}
                          accessibilityRole={isMulti ? 'checkbox' : 'radio'}
                          accessibilityState={{ checked: isSel }}
                          onPress={() => toggleOption(q.id, opt.id, q.maxSelections, isMulti)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: 12,
                            borderRadius: 10,
                            borderWidth: 1.5,
                            borderColor: isSel ? theme.colors.primary : theme.colors.border,
                            backgroundColor: isSel ? '#F0F1F8' : theme.colors.surface,
                          }}
                        >
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 15, color: theme.colors.text }}>
                              {opt.label}
                            </Text>
                            {opt.subtitle ? (
                              <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: theme.colors.muted }}>
                                {opt.subtitle}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={{ fontSize: 16, color: theme.colors.primary }}>{isSel ? '●' : '○'}</Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </Card>
              )
            })}

            <Button
              title="Revisar e confirmar voto"
              disabled={!allRequiredAnswered}
              onPress={() => setConfirmOpen(true)}
            />
          </>
        )}

        {showResults && results && (
          <Card>
            <Text style={{ fontFamily: theme.fonts.heading, fontSize: 17, color: theme.colors.primary }}>
              {survey.status === 'OPEN' ? 'Resultados parciais' : 'Resultados oficiais'}
            </Text>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: theme.colors.muted }}>
              {results.totalBallots.toLocaleString('pt-BR')} cédulas apuradas
            </Text>

            {results.availableSegments.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {results.availableSegments.map((seg) => (
                  <Pressable
                    key={seg}
                    onPress={() => setSegment(seg)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 99,
                      backgroundColor: segment === seg ? theme.colors.primary : theme.colors.soft,
                    }}
                  >
                    <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: segment === seg ? theme.colors.surface : theme.colors.text }}>
                      {formatSegmentLabel(seg)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {!results.quorumReached ? (
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.muted }}>
                Os percentuais serão exibidos ao atingir o quórum mínimo de {survey.minQuorumToPublish} participações.
              </Text>
            ) : results.kAnonymitySuppressed ? (
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.muted }}>
                Este recorte tem menos de {results.kAnonymityThreshold} respostas e foi ocultado para preservar o anonimato.
              </Text>
            ) : (
              results.questions.map((q) => (
                <View key={q.questionId} style={{ gap: 8, marginTop: 6 }}>
                  <Text style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: theme.colors.text }}>{q.prompt}</Text>
                  {q.options.map((opt) => (
                    <View key={opt.optionId} style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.text, flex: 1 }}>
                          {opt.label}
                        </Text>
                        <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: theme.colors.primary }}>
                          {opt.percentage.toFixed(1).replace('.', ',')}%
                        </Text>
                      </View>
                      <View style={{ height: 8, borderRadius: 99, backgroundColor: theme.colors.soft, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${Math.min(100, opt.percentage)}%`, backgroundColor: theme.colors.primary }} />
                      </View>
                    </View>
                  ))}
                </View>
              ))
            )}
          </Card>
        )}

        <Card>
          <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: theme.colors.primary }}>
            Ficha técnica e transparência
          </Text>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.muted, lineHeight: 19 }}>
            {survey.methodologyNote}
          </Text>
          <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: theme.colors.text }}>
            Metodologia: {SURVEY_METHODOLOGY_LABELS[survey.methodologyType]}
          </Text>
          {survey.tseRegistrationCode ? (
            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: theme.colors.text }}>
              Registro TSE: {survey.tseRegistrationCode}
            </Text>
          ) : null}
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: theme.colors.muted, lineHeight: 18 }}>
            {survey.disclaimerText}
          </Text>
        </Card>
      </ScrollView>

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 20 }}>
          <Card style={{ padding: 20, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Lock size={18} color={theme.colors.positive} />
              <Text style={{ fontFamily: theme.fonts.heading, fontSize: 18, color: theme.colors.primary }}>
                Confirmar voto anônimo
              </Text>
            </View>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.muted, lineHeight: 20 }}>
              {SURVEY_ANONYMITY_NOTICE}
            </Text>
            <View style={{ backgroundColor: theme.colors.soft, borderRadius: 10, padding: 12, gap: 6 }}>
              {survey.questions.map((q) => {
                const chosen = (answers[q.id] ?? [])
                  .map((id) => q.options.find((o) => o.id === id)?.label)
                  .filter(Boolean)
                  .join(', ')
                return (
                  <View key={q.id}>
                    <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: theme.colors.text }}>{q.prompt}</Text>
                    <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.primary }}>{chosen || 'Sem resposta'}</Text>
                  </View>
                )
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
              <Button secondary title="Revisar" onPress={() => setConfirmOpen(false)} disabled={submitMut.isPending} />
              <Button title="Confirmar voto" loading={submitMut.isPending} onPress={confirmVote} />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  )
}
