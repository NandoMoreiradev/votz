import { useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { SURVEY_REVIEW_LABELS, type SurveyQuestionType } from '@votz/shared-types'
import { useAuthStore } from '../store/auth.store'
import { useEntitySurveys, useSubmitEntitySurvey } from '../hooks/useSurveys'
import { CtaButton, GhostButton, PageHeader, Panel, PanelBody, PanelHead, StudioPage } from '../components/studio/studio-ui'

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 12px;
`

const Label = styled.label`
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`

const Input = styled.input`
  height: 38px;
  padding: 0 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  background: ${({ theme }) => theme.colors.white};
`

const Textarea = styled.textarea`
  padding: 10px 12px;
  min-height: 80px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: inherit;
  font-size: 0.875rem;
  background: ${({ theme }) => theme.colors.white};
`

const Row = styled.div`
  padding: 14px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  &:last-child { border-bottom: none; }
`

export function EntitySurveys() {
  const { activeContext } = useAuthStore()
  const entityId = activeContext?.type === 'ENTITY' ? activeContext.id : undefined
  const { data: surveys, isLoading } = useEntitySurveys(entityId)
  const submitMut = useSubmitEntitySurvey(entityId ?? '')

  const [openForm, setOpenForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [optionsText, setOptionsText] = useState('Saúde\nMobilidade e transporte\nSegurança\nEducação')
  const [feedback, setFeedback] = useState('')

  if (!entityId) {
    return (
      <StudioPage>
        <PageHeader title="Consultas Públicas" description="Disponível apenas no contexto de uma Entidade Pública." />
      </StudioPage>
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFeedback('')
    const options = optionsText
      .split('\n')
      .map((line) => line.trim())
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
          setFeedback('Consulta pública enviada para revisão editorial do Votz. Assim que aprovada, entrará no ar.')
          setOpenForm(false)
          setTitle('')
          setDescription('')
          setPrompt('')
        },
        onError: () => setFeedback('Não foi possível enviar a consulta. Revise os campos e tente novamente.'),
      },
    )
  }

  return (
    <StudioPage>
      <PageHeader
        crumbs={[{ label: 'Atendimento' }, { label: 'Consultas Públicas' }]}
        title="Consultas Públicas"
        description="Proponha consultas cívicas anônimas para ouvir os moradores da sua região. Todas passam por revisão editorial de neutralidade antes de ir ao ar."
        actions={
          <CtaButton type="button" onClick={() => setOpenForm((v) => !v)}>
            {openForm ? 'Fechar formulário' : '+ Propor consulta pública'}
          </CtaButton>
        }
      />

      {feedback && (
        <Panel style={{ marginBottom: 16 }}>
          <PanelBody>{feedback}</PanelBody>
        </Panel>
      )}

      {openForm && (
        <Panel style={{ marginBottom: 18 }}>
          <PanelHead title="Nova Consulta Pública" hint="Perguntas devem ser neutras e voltadas a serviços/prioridades públicas (nunca intenção de voto)." />
          <PanelBody>
            <form onSubmit={handleSubmit}>
              <Field>
                <Label>Título da consulta *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={5} maxLength={180} placeholder="Ex.: Prioridades para o Orçamento Participativo 2027" />
              </Field>
              <Field>
                <Label>Descrição e contexto *</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} required minLength={10} placeholder="Explique aos cidadãos como o resultado será usado pela entidade." />
              </Field>
              <Field>
                <Label>Pergunta principal *</Label>
                <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} required minLength={5} maxLength={300} placeholder="Ex.: Qual área deve receber prioridade de investimento neste ano?" />
              </Field>
              <Field>
                <Label>Opções de resposta (uma por linha, mín. 2) *</Label>
                <Textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} required />
              </Field>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <GhostButton type="button" onClick={() => setOpenForm(false)}>Cancelar</GhostButton>
                <CtaButton type="submit" disabled={submitMut.isPending}>
                  {submitMut.isPending ? 'Enviando…' : 'Enviar para revisão'}
                </CtaButton>
              </div>
            </form>
          </PanelBody>
        </Panel>
      )}

      <Panel>
        <PanelHead title="Consultas da entidade" hint="Acompanhe o status da revisão e acesse os resultados agregados." />
        <PanelBody>
          {isLoading ? (
            <p>Carregando…</p>
          ) : !surveys?.length ? (
            <p style={{ color: '#6B7280', fontSize: '0.875rem' }}>Nenhuma consulta pública enviada ainda.</p>
          ) : (
            surveys.map((s) => (
              <Row key={s.id}>
                <div>
                  <strong>{s.title}</strong>
                  <div style={{ fontSize: '0.8125rem', color: '#6B7280', marginTop: 4 }}>
                    Status: <strong>{s.status}</strong> · Revisão: <strong>{SURVEY_REVIEW_LABELS[s.reviewStatus]}</strong> · {s.totalBallots} cédulas apuradas
                  </div>
                  {s.reviewNote && (
                    <div style={{ fontSize: '0.8125rem', color: '#B45309', marginTop: 4 }}>
                      Parecer da revisão: {s.reviewNote}
                    </div>
                  )}
                </div>
                {(s.status === 'OPEN' || s.status === 'CLOSED') && (
                  <Link to={`/pesquisas/${s.slug}`} style={{ fontSize: '0.875rem', fontWeight: 600, textDecoration: 'underline' }}>
                    Abrir consulta →
                  </Link>
                )}
              </Row>
            ))
          )}
        </PanelBody>
      </Panel>
    </StudioPage>
  )
}
