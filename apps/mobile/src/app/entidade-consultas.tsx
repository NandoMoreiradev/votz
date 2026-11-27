import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { router, type Href } from 'expo-router'
import { SURVEY_REVIEW_LABELS, type SurveyQuestionType } from '@votz/shared-types'
import { Screen, Toolbar } from '../components/screen'
import { Button, Card, ErrorText, Field, State } from '../components/ui'
import { useEntitySurveys, useSubmitEntitySurvey } from '../hooks/use-entity-company-tools'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'

export default function EntidadeConsultasScreen() {
  const { colors, theme } = useAppTheme()
  const activeContext = useSession((s) => s.activeContext)
  const entityId = activeContext?.type === 'ENTITY' ? activeContext.id : undefined
  const query = useEntitySurveys(entityId)
  const submitMut = useSubmitEntitySurvey(entityId ?? '')

  const [openForm, setOpenForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [optionsText, setOptionsText] = useState('Saúde\nMobilidade e transporte\nSegurança\nEducação')
  const [feedback, setFeedback] = useState('')

  if (!entityId) {
    return (
      <Screen>
        <Toolbar title="Consultas públicas" back />
        <State
          title="Perfil de entidade necessário"
          description="Ative o perfil da sua entidade pública em Perfil → Atuar como para gerenciar consultas públicas."
        />
      </Screen>
    )
  }

  const handleSubmit = () => {
    setFeedback('')
    const options = optionsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((label) => ({ label, isPinnedBottom: false }))

    if (options.length < 2) {
      setFeedback('Informe pelo menos 2 opções (uma por linha).')
      return
    }

    submitMut.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        questions: [
          {
            prompt: prompt.trim(),
            type: 'SINGLE_CHOICE' as SurveyQuestionType,
            required: true,
            maxSelections: 1,
            randomizeOptions: true,
            options,
          },
        ],
      },
      {
        onSuccess: () => {
          setFeedback('Consulta enviada para revisão editorial do Votz. Assim que aprovada, entrará no ar.')
          setOpenForm(false)
          setTitle('')
          setDescription('')
          setPrompt('')
        },
      },
    )
  }

  return (
    <Screen>
      <Toolbar title="Consultas públicas" back />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.soft }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <Button
          title={openForm ? 'Fechar formulário' : '+ Propor consulta pública'}
          secondary={openForm}
          onPress={() => setOpenForm((v) => !v)}
        />

        {!!feedback && (
          <Card>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.positive }}>{feedback}</Text>
          </Card>
        )}

        {openForm && (
          <Card>
            <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary }}>
              Nova consulta pública
            </Text>
            <Field label="Título *" value={title} onChangeText={setTitle} placeholder="Ex.: Prioridades para o orçamento 2027" />
            <Field label="Descrição *" value={description} onChangeText={setDescription} multiline placeholder="Contexto da consulta para os moradores" />
            <Field label="Pergunta principal *" value={prompt} onChangeText={setPrompt} placeholder="Ex.: Qual área deve receber prioridade?" />
            <Field label="Opções (uma por linha, mín. 2) *" value={optionsText} onChangeText={setOptionsText} multiline />
            <ErrorText message={submitMut.isError ? errorMessage(submitMut.error) : undefined} />
            <Button
              title="Enviar para revisão"
              loading={submitMut.isPending}
              disabled={title.trim().length < 5 || description.trim().length < 10 || prompt.trim().length < 5}
              onPress={handleSubmit}
            />
          </Card>
        )}

        {query.isPending ? (
          <State loading title="Carregando consultas…" />
        ) : query.isError ? (
          <State title="Não foi possível carregar" description={errorMessage(query.error)} retry={() => { void query.refetch() }} />
        ) : (query.data ?? []).length === 0 ? (
          <State title="Nenhuma consulta enviada" description="Proponha uma consulta cívica anônima para ouvir os moradores." />
        ) : (
          (query.data ?? []).map((s) => (
            <Pressable key={s.id} onPress={() => router.push(`/pesquisas/${s.slug}` as Href)}>
              <Card>
                <Text style={{ fontFamily: theme.fonts.medium, fontSize: 11, color: colors.action, textTransform: 'uppercase' }}>
                  {SURVEY_REVIEW_LABELS[s.reviewStatus] ?? s.reviewStatus} · {s.status}
                </Text>
                <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary }}>{s.title}</Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                  {s.totalBallots.toLocaleString('pt-BR')} participações · criada em {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                </Text>
                {!!s.reviewNote && (
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.action }}>
                    Nota editorial: {s.reviewNote}
                  </Text>
                )}
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </Screen>
  )
}
