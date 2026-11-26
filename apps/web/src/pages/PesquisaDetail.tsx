import { useState } from 'react'
import styled from 'styled-components'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, LockSimple, ShieldCheck, WarningCircle } from '@phosphor-icons/react'
import {
  SURVEY_ANONYMITY_NOTICE,
  SURVEY_KIND_LABELS,
  SURVEY_METHODOLOGY_LABELS,
  SURVEY_ORIGIN_LABELS,
  type SurveyIneligibleReason,
} from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import { useSubmitSurveyVote, useSurveyComparison, useSurveyDetail, useSurveyResults } from '../hooks/useSurveys'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.main`
  max-width: 760px;
  margin: 0 auto;
  padding: 24px 20px 80px;
`

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 18px;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`

const Card = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 24px;
  margin-bottom: 18px;
`

const BadgeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
`

const OriginBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 8px;
`

const Desc = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.55;
`

const AlertBox = styled.div<{ $tone: 'info' | 'warn' | 'ok' }>`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  border-radius: ${({ theme }) => theme.radii.md};
  margin-bottom: 18px;
  font-size: 0.875rem;
  line-height: 1.45;
  background: ${({ $tone }) => ($tone === 'ok' ? '#DCFCE7' : $tone === 'warn' ? '#FEF3C7' : '#EFF6FF')};
  color: ${({ $tone }) => ($tone === 'ok' ? '#14532D' : $tone === 'warn' ? '#78350F' : '#1E3A8A')};
  border: 1px solid ${({ $tone }) => ($tone === 'ok' ? '#86EFAC' : $tone === 'warn' ? '#FCD34D' : '#BFDBFE')};

  svg { flex-shrink: 0; margin-top: 2px; }
`

const QuestionTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.0625rem;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`

const HelpText = styled.p`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 12px;
`

const OptionBtn = styled.button<{ $selected: boolean }>`
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 8px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1.5px solid ${({ $selected, theme }) => ($selected ? theme.colors.primary : theme.colors.border)};
  background: ${({ $selected, theme }) => ($selected ? `${theme.colors.primary}0D` : theme.colors.white)};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;

  &:hover { border-color: ${({ theme }) => theme.colors.primary}; }
`

const PrimaryBtn = styled.button`
  padding: 11px 22px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: none;
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  font-size: 0.9375rem;
  font-weight: 700;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const GhostBtn = styled.button`
  padding: 10px 18px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
`

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 120;
`

const ModalCard = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border-radius: ${({ theme }) => theme.radii.lg};
  max-width: 480px;
  width: 100%;
  padding: 24px;
  box-shadow: ${({ theme }) => theme.shadows.lg};
`

const BarTrack = styled.div`
  height: 10px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.neutral};
  overflow: hidden;
  margin-top: 6px;
`

const BarFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => Math.min(100, Math.max(0, $pct))}%;
  background: ${({ theme }) => theme.colors.primary};
  border-radius: 999px;
`

const SegSelect = styled.select`
  height: 36px;
  padding: 0 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.white};
  font-size: 0.875rem;
`

const TechGrid = styled.dl`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
  font-size: 0.8125rem;
  @media (max-width: 600px) { grid-template-columns: 1fr; }

  dt { color: ${({ theme }) => theme.colors.muted}; font-weight: 600; }
  dd { color: ${({ theme }) => theme.colors.text}; margin-top: 2px; }
`

function formatSegmentLabel(seg: string): string {
  if (seg === 'ALL') return 'Todos os participantes'
  if (seg.startsWith('STATE:')) return `Estado: ${seg.slice(6)}`
  if (seg.startsWith('AGE:')) return `Faixa etária: ${seg.slice(4)}`
  if (seg === 'GENDER:FEMALE') return 'Gênero: Mulher'
  if (seg === 'GENDER:MALE') return 'Gênero: Homem'
  if (seg === 'GENDER:OTHER') return 'Gênero: Outro'
  return seg
}

function ineligibleCopy(reason: SurveyIneligibleReason | null): { text: string; ctaTo?: string; ctaLabel?: string } {
  switch (reason) {
    case 'UNAUTHENTICATED':
      return { text: 'Entre na sua conta para participar desta pesquisa com anonimato garantido.', ctaTo: '/entrar', ctaLabel: 'Entrar' }
    case 'EMAIL_NOT_VERIFIED':
      return { text: 'Confirme seu e-mail cadastrado para poder participar desta pesquisa.' }
    case 'ACCOUNT_TOO_NEW':
      return { text: 'Esta pesquisa exige um tempo mínimo de conta para evitar fraudes.' }
    case 'CPF_REQUIRED':
      return {
        text: 'Esta pesquisa oficial exige CPF cadastrado na sua conta (usado apenas para garantir 1 voto por pessoa, nunca ligado à sua resposta).',
        ctaTo: '/meu-perfil',
        ctaLabel: 'Completar meu perfil',
      }
    case 'OUT_OF_TERRITORY':
      return { text: 'Esta pesquisa é restrita a moradores do território informado no seu perfil.', ctaTo: '/meu-perfil', ctaLabel: 'Ver localização no perfil' }
    case 'INVITE_REQUIRED':
      return { text: 'Esta pesquisa é conduzida por amostra sorteada. Os resultados ficarão públicos para todos ao encerrar.' }
    default:
      return { text: 'Você não pode votar nesta pesquisa neste momento.' }
  }
}

export function PesquisaDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { data: survey, isLoading, isError } = useSurveyDetail(slug)
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [votedSuccess, setVotedSuccess] = useState(false)
  const [voteError, setVoteError] = useState('')
  const [segment, setSegment] = useState('ALL')

  const showResults =
    !!survey &&
    (survey.status === 'CLOSED' ||
      survey.status === 'ARCHIVED' ||
      (survey.resultsVisibility === 'AFTER_VOTE' && (survey.hasVoted || votedSuccess || survey.quorumReached)))

  const { data: results } = useSurveyResults(slug, segment, showResults)
  const { data: comparison } = useSurveyComparison(survey?.topicKey)
  const [embedCopied, setEmbedCopied] = useState(false)
  const submitMut = useSubmitSurveyVote(survey?.id ?? '')

  if (isLoading) {
    return (
      <Page>
        <Navbar />
        <Content><Card>Carregando pesquisa…</Card></Content>
      </Page>
    )
  }

  if (isError || !survey) {
    return (
      <Page>
        <Navbar />
        <Content>
          <BackLink to="/pesquisas"><ArrowLeft size={16} /> Voltar para Pesquisas</BackLink>
          <Card>Pesquisa não encontrada ou indisponível.</Card>
        </Content>
      </Page>
    )
  }

  const canVote = survey.status === 'OPEN' && survey.eligible === true && !survey.hasVoted && !votedSuccess

  function toggleOption(questionId: string, optionId: string, maxSelections: number, isMulti: boolean) {
    setAnswers((prev) => {
      const current = prev[questionId] ?? []
      if (!isMulti) {
        return { ...prev, [questionId]: [optionId] }
      }
      if (current.includes(optionId)) {
        return { ...prev, [questionId]: current.filter((id) => id !== optionId) }
      }
      if (current.length >= maxSelections) return prev
      return { ...prev, [questionId]: [...current, optionId] }
    })
  }

  const allRequiredAnswered = survey.questions.every(
    (q) => !q.required || (answers[q.id]?.length ?? 0) > 0,
  )

  function handleConfirmVote() {
    setVoteError('')
    submitMut.mutate(answers, {
      onSuccess: () => {
        setConfirmOpen(false)
        setVotedSuccess(true)
      },
      onError: (err) => {
        const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
        setVoteError(Array.isArray(msg) ? msg[0] : msg || 'Não foi possível registrar sua participação.')
      },
    })
  }

  const inelig = !canVote && survey.status === 'OPEN' && !survey.hasVoted && !votedSuccess
    ? ineligibleCopy(survey.ineligibleReason)
    : null

  return (
    <Page>
      <Navbar />
      <Content>
        <BackLink to="/pesquisas"><ArrowLeft size={16} /> Todas as Pesquisas Votz</BackLink>

        <Card>
          <BadgeRow>
            <OriginBadge>
              <ShieldCheck size={14} weight="fill" />
              {survey.partnerName ? `${SURVEY_ORIGIN_LABELS[survey.origin]} · ${survey.partnerName}` : SURVEY_ORIGIN_LABELS[survey.origin]}
            </OriginBadge>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#6B7280' }}>
              {SURVEY_KIND_LABELS[survey.kind]} ·{' '}
              {survey.scope === 'NATIONAL' ? 'Nacional' : survey.scope === 'STATE' ? survey.targetState : `${survey.targetCity}/${survey.targetState}`}
            </span>
          </BadgeRow>

          <Title>{survey.title}</Title>
          <Desc>{survey.description}</Desc>
        </Card>

        {(survey.hasVoted || votedSuccess) && (
          <AlertBox $tone="ok">
            <CheckCircle size={20} weight="fill" />
            <div>
              <strong>Participação registrada com anonimato.</strong>{' '}
              Sua resposta entrou na fila embaralhada (Mix Pool) sem vínculo com sua conta.
              {survey.status === 'OPEN' && survey.resultsVisibility === 'AFTER_CLOSE'
                ? ' Os resultados serão divulgados assim que a coleta encerrar.'
                : ''}
            </div>
          </AlertBox>
        )}

        {inelig && (
          <AlertBox $tone="warn">
            <WarningCircle size={20} weight="fill" />
            <div style={{ flex: 1 }}>
              {inelig.text}
              {inelig.ctaTo && (
                <div style={{ marginTop: 8 }}>
                  <Link to={inelig.ctaTo} style={{ fontWeight: 700, textDecoration: 'underline' }}>
                    {inelig.ctaLabel} →
                  </Link>
                </div>
              )}
            </div>
          </AlertBox>
        )}

        {canVote && (
          <>
            {survey.questions.map((q, idx) => {
              const selected = answers[q.id] ?? []
              const isMulti = q.type === 'MULTIPLE_CHOICE'
              return (
                <Card key={q.id}>
                  <QuestionTitle>
                    {idx + 1}. {q.prompt} {q.required ? '' : '(opcional)'}
                  </QuestionTitle>
                  <HelpText>
                    {q.helpText || (isMulti ? `Escolha até ${q.maxSelections} opções.` : 'Escolha uma opção.')}
                  </HelpText>

                  {q.options.map((opt) => {
                    const isSel = selected.includes(opt.id)
                    return (
                      <OptionBtn
                        key={opt.id}
                        type="button"
                        $selected={isSel}
                        onClick={() => toggleOption(q.id, opt.id, q.maxSelections, isMulti)}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{opt.label}</div>
                          {opt.subtitle && <div style={{ fontSize: '0.8125rem', color: '#6B7280' }}>{opt.subtitle}</div>}
                        </div>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>
                          {isSel ? '●' : '○'}
                        </span>
                      </OptionBtn>
                    )
                  })}
                </Card>
              )
            })}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: '#15803D', fontWeight: 600 }}>
                <LockSimple size={15} weight="bold" /> Voto anônimo, definitivo e fora dos anúncios
              </span>
              <PrimaryBtn type="button" disabled={!allRequiredAnswered} onClick={() => setConfirmOpen(true)}>
                Revisar e confirmar voto
              </PrimaryBtn>
            </div>
          </>
        )}

        {/* Resultados */}
        {showResults && results && (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.125rem' }}>
                  {survey.status === 'OPEN' ? 'Resultados parciais' : 'Resultados oficiais'}
                </h2>
                <span style={{ fontSize: '0.8125rem', color: '#6B7280', fontFamily: 'JetBrains Mono, monospace' }}>
                  {results.totalBallots.toLocaleString('pt-BR')} cédulas apuradas
                </span>
              </div>

              {results.availableSegments.length > 1 && (
                <SegSelect value={segment} onChange={(e) => setSegment(e.target.value)} aria-label="Recorte dos resultados">
                  {results.availableSegments.map((seg) => (
                    <option key={seg} value={seg}>{formatSegmentLabel(seg)}</option>
                  ))}
                </SegSelect>
              )}
              {results.quorumReached && !results.kAnonymitySuppressed && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a
                    href={`${import.meta.env.VITE_API_URL ?? '/api'}/surveys/${survey.slug}/export?format=csv&segment=${encodeURIComponent(segment)}`}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid #D1D5DB',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                    }}
                  >
                    Exportar CSV
                  </a>
                  <GhostBtn
                    type="button"
                    style={{ padding: '6px 12px', fontSize: '0.8125rem' }}
                    onClick={() => {
                      const snippet = `<iframe src="${window.location.origin}/pesquisas/${survey.slug}" width="100%" height="560" frameborder="0" title="${survey.title}"></iframe>`
                      void navigator.clipboard?.writeText(snippet)
                      setEmbedCopied(true)
                      setTimeout(() => setEmbedCopied(false), 2500)
                    }}
                  >
                    {embedCopied ? 'Embed copiado!' : 'Copiar Embed'}
                  </GhostBtn>
                </div>
              )}
            </div>

            {!results.quorumReached ? (
              <AlertBox $tone="info">
                <LockSimple size={18} />
                <div>
                  Os percentuais só são exibidos quando a pesquisa atingir o quórum mínimo de{' '}
                  <strong>{survey.minQuorumToPublish}</strong> participações (proteção de anonimato).
                </div>
              </AlertBox>
            ) : results.kAnonymitySuppressed ? (
              <AlertBox $tone="info">
                <LockSimple size={18} />
                <div>
                  Este recorte tem menos de <strong>{results.kAnonymityThreshold}</strong> respostas e foi ocultado para preservar o anonimato dos participantes.
                </div>
              </AlertBox>
            ) : (
              results.questions.map((q) => (
                <div key={q.questionId} style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: '0.9375rem', marginBottom: 10 }}>{q.prompt}</h3>
                  {q.options.map((opt) => (
                    <div key={opt.optionId} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                        <span>
                          <strong>{opt.label}</strong>
                          {opt.subtitle ? ` (${opt.subtitle})` : ''}
                        </span>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                          {opt.percentage.toFixed(1).replace('.', ',')}%
                        </span>
                      </div>
                      <BarTrack>
                        <BarFill $pct={opt.percentage} />
                      </BarTrack>
                    </div>
                  ))}
                </div>
              ))
            )}
          </Card>
        )}

        {/* Comparador de Pesquisas (mesmo topicKey) */}
        {comparison && comparison.length > 1 && (
          <Card>
            <h2 style={{ fontSize: '1rem', marginBottom: 10 }}>
              Comparador histórico ({survey.topicKey})
            </h2>
            {comparison.map((item) => (
              <div
                key={item.surveyId}
                style={{
                  padding: '10px 0',
                  borderBottom: '1px solid #E5E5E5',
                  fontSize: '0.875rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <Link to={`/pesquisas/${item.slug}`} style={{ fontWeight: 700, textDecoration: 'underline' }}>
                    {item.title}
                  </Link>
                  <span style={{ color: '#6B7280', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem' }}>
                    {item.partnerName ?? 'Pesquisa Votz'} · {item.totalBallots.toLocaleString('pt-BR')} cédulas
                  </span>
                </div>
                {item.options.length > 0 && (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: '0.8125rem', color: '#374151' }}>
                    {item.options.slice(0, 4).map((o) => (
                      <span key={o.label}>
                        {o.label}: <strong style={{ fontFamily: 'JetBrains Mono, monospace' }}>{o.percentage.toFixed(1).replace('.', ',')}%</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </Card>
        )}

        {/* Ficha Técnica e Transparência */}
        <Card>
          <h2 style={{ fontSize: '1rem', marginBottom: 6 }}>Ficha técnica e transparência</h2>
          {survey.instituteSlug && survey.partnerName && (
            <p style={{ fontSize: '0.875rem', marginBottom: 8 }}>
              Instituto responsável:{' '}
              <Link to={`/pesquisas/institutos/${survey.instituteSlug}`} style={{ fontWeight: 700, textDecoration: 'underline' }}>
                {survey.partnerName} →
              </Link>
            </p>
          )}
          <p style={{ fontSize: '0.875rem', color: '#6B7280', lineHeight: 1.5 }}>{survey.methodologyNote}</p>
          <TechGrid>
            <div>
              <dt>Metodologia</dt>
              <dd>{SURVEY_METHODOLOGY_LABELS[survey.methodologyType]}</dd>
            </div>
            <div>
              <dt>Verificação exigida</dt>
              <dd>{survey.verificationLevel === 'VERIFIED_CPF' ? 'CPF verificado (1 voto por CPF)' : 'Conta com e-mail verificado'}</dd>
            </div>
            {survey.contractorName && (
              <div>
                <dt>Contratante / Financiador</dt>
                <dd>{survey.contractorName}</dd>
              </div>
            )}
            {survey.tseRegistrationCode && (
              <div>
                <dt>Registro TSE (PesqEle)</dt>
                <dd style={{ fontFamily: 'JetBrains Mono, monospace' }}>{survey.tseRegistrationCode}</dd>
              </div>
            )}
            {survey.statisticianName && (
              <div>
                <dt>Estatístico responsável</dt>
                <dd>{survey.statisticianName}{survey.statisticianConre ? ` (${survey.statisticianConre})` : ''}</dd>
              </div>
            )}
            <div>
              <dt>Proteção de recortes (k-anonimato)</dt>
              <dd>Mínimo de {survey.kAnonymityThreshold} respostas por recorte</dd>
            </div>
          </TechGrid>
          <p style={{ fontSize: '0.8125rem', color: '#6B7280', marginTop: 14, borderTop: '1px solid #E5E5E5', paddingTop: 12 }}>
            {survey.disclaimerText}
          </p>
        </Card>

        {/* Modal de confirmação definitiva */}
        {confirmOpen && (
          <ModalOverlay onClick={() => setConfirmOpen(false)}>
            <ModalCard onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginBottom: 8 }}>Confirmar voto anônimo</h3>
              <p style={{ fontSize: '0.875rem', color: '#6B7280', lineHeight: 1.5, marginBottom: 14 }}>
                {SURVEY_ANONYMITY_NOTICE}
              </p>

              <div style={{ background: '#F4F4F4', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: '0.875rem' }}>
                {survey.questions.map((q) => {
                  const chosen = (answers[q.id] ?? [])
                    .map((id) => q.options.find((o) => o.id === id)?.label)
                    .filter(Boolean)
                    .join(', ')
                  return (
                    <div key={q.id} style={{ marginBottom: 6 }}>
                      <strong>{q.prompt}</strong>
                      <div style={{ color: '#1A1A2E' }}>{chosen || 'Sem resposta'}</div>
                    </div>
                  )
                })}
              </div>

              {voteError && <p style={{ color: '#E63946', fontSize: '0.875rem', marginBottom: 10 }}>{voteError}</p>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <GhostBtn type="button" onClick={() => setConfirmOpen(false)} disabled={submitMut.isPending}>
                  Revisar
                </GhostBtn>
                <PrimaryBtn type="button" onClick={handleConfirmVote} disabled={submitMut.isPending}>
                  {submitMut.isPending ? 'Registrando…' : 'Confirmar voto anônimo'}
                </PrimaryBtn>
              </div>
            </ModalCard>
          </ModalOverlay>
        )}
      </Content>
    </Page>
  )
}
