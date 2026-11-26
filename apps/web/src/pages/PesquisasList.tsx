import { useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { CheckCircle, LockSimple, ShieldCheck } from '@phosphor-icons/react'
import {
  SURVEY_KIND_LABELS,
  SURVEY_ORIGIN_LABELS,
  type SurveyKind,
  type SurveyStatus,
} from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import { useDeclineInvitation, useMySurveyInvitations, usePublicSurveys, useSurveysEnabled } from '../hooks/useSurveys'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.main`
  max-width: 1480px;
  margin: 0 auto;
  padding: 24px 32px 64px;

  @media (max-width: 720px) { padding: 16px 16px 48px; }
`

const Header = styled.div`
  margin-bottom: 20px;
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const Subtitle = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
`

const TrustBox = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  margin-bottom: 20px;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.45;

  svg { flex-shrink: 0; color: ${({ theme }) => theme.colors.positiveText}; margin-top: 2px; }
`

const Controls = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
`

const TabRow = styled.div`
  display: flex;
  gap: 8px;
`

const PillBtn = styled.button<{ $active: boolean }>`
  padding: 7px 14px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.borderStrong)};
  background: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.white)};
  color: ${({ $active, theme }) => ($active ? theme.colors.white : theme.colors.text)};
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
`

const Select = styled.select`
  height: 36px;
  padding: 0 12px;
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.875rem;
`

const List = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 16px;

  @media (max-width: 520px) { grid-template-columns: 1fr; }
`

const SurveyCard = styled(Link)`
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px 22px;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    box-shadow: ${({ theme }) => theme.shadows.md};
  }
`

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
`

const OriginBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

const MetaTag = styled.span`
  font-size: 0.75rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.muted};
`

const VotedTag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.positiveText};
`

const CardTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.125rem;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const CardDesc = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.45;
  margin-bottom: 12px;
`

const CardFoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: auto;
  padding-top: 8px;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  flex-wrap: wrap;
`

const EmptyBox = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 40px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
`

export function PesquisasList() {
  const enabled = useSurveysEnabled()
  const [status, setStatus] = useState<SurveyStatus>('OPEN')
  const [kind, setKind] = useState<SurveyKind | ''>('')

  const { data: surveys, isLoading } = usePublicSurveys({
    status,
    ...(kind ? { kind } : {}),
  })
  const { data: invitations } = useMySurveyInvitations()
  const declineMut = useDeclineInvitation()

  return (
    <Page>
      <Navbar />
      <Content>
        <Header>
          <Title>Pesquisa Votz</Title>
          <Subtitle>
            Pesquisas oficiais de intenção de voto, avaliação de gestão e consultas cívicas com participação anonimizada.
          </Subtitle>
        </Header>

        <TrustBox>
          <LockSimple size={20} weight="bold" />
          <div>
            <strong>Como protegemos o seu voto:</strong> o Votz verifica se você tem direito a participar (1 voto por pessoa),
            mas separa criptograficamente a sua identidade da sua cédula e embaralha os envios em lotes. Nem você nem o sistema
            conseguem consultar em quem você votou, e esses dados nunca são usados para anúncios.
          </div>
        </TrustBox>

        {!enabled ? (
          <EmptyBox>As Pesquisas Votz ainda não estão disponíveis neste ambiente.</EmptyBox>
        ) : (
          <>
            {invitations && invitations.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <h2 style={{ fontSize: '1rem', marginBottom: 10 }}>
                  Convites exclusivos para você ({invitations.length})
                </h2>
                <List>
                  {invitations.map((inv) => (
                    <div
                      key={inv.invitationId}
                      style={{
                        background: '#FFFFFF',
                        border: '1.5px solid #1A1A2E',
                        borderRadius: 12,
                        padding: 18,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1A1A2E', marginBottom: 4 }}>
                          AMOSTRA SORTEADA · CONVITE EXCLUSIVO
                        </div>
                        <strong style={{ display: 'block', fontSize: '1rem' }}>{inv.survey.title}</strong>
                        <span style={{ fontSize: '0.8125rem', color: '#6B7280' }}>
                          Você foi sorteado para uma amostra estatística independente. Seu voto segue 100% anônimo.
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <PillBtn type="button" $active={false} onClick={() => declineMut.mutate(inv.invitationId)}>
                          Recusar
                        </PillBtn>
                        <Link
                          to={`/pesquisas/${inv.survey.slug}`}
                          style={{
                            padding: '7px 14px',
                            borderRadius: 999,
                            background: '#1A1A2E',
                            color: '#FFFFFF',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                          }}
                        >
                          Participar
                        </Link>
                      </div>
                    </div>
                  ))}
                </List>
              </div>
            )}

            <Controls>
              <TabRow>
                <PillBtn type="button" $active={status === 'OPEN'} onClick={() => setStatus('OPEN')}>
                  Abertas
                </PillBtn>
                <PillBtn type="button" $active={status === 'CLOSED'} onClick={() => setStatus('CLOSED')}>
                  Encerradas
                </PillBtn>
              </TabRow>

              <Select
                value={kind}
                onChange={(e) => setKind(e.target.value as SurveyKind | '')}
                aria-label="Filtrar por modalidade"
              >
                <option value="">Todas as modalidades</option>
                <option value="VOTING_INTENTION">Intenção de voto</option>
                <option value="APPROVAL_RATING">Avaliação de gestão</option>
                <option value="CIVIC_TOPIC">Pesquisa cívica</option>
              </Select>
            </Controls>

            {isLoading ? (
              <EmptyBox>Carregando pesquisas…</EmptyBox>
            ) : !surveys?.length ? (
              <EmptyBox>
                {status === 'OPEN'
                  ? 'Não há pesquisas abertas com este filtro no momento.'
                  : 'Nenhuma pesquisa encerrada encontrada com este filtro.'}
              </EmptyBox>
            ) : (
              <List>
                {surveys.map((s) => (
                  <SurveyCard key={s.id} to={`/pesquisas/${s.slug}`}>
                    <MetaRow>
                      <OriginBadge>
                        <ShieldCheck size={12} weight="fill" />
                        {s.partnerName ? `${SURVEY_ORIGIN_LABELS[s.origin]} · ${s.partnerName}` : SURVEY_ORIGIN_LABELS[s.origin]}
                      </OriginBadge>
                      <MetaTag>{SURVEY_KIND_LABELS[s.kind]}</MetaTag>
                      <MetaTag>
                        · {s.scope === 'NATIONAL' ? 'Nacional' : s.scope === 'STATE' ? s.targetState : `${s.targetCity}/${s.targetState}`}
                      </MetaTag>
                      {s.hasVoted && (
                        <VotedTag>
                          <CheckCircle size={14} weight="fill" /> Você participou
                        </VotedTag>
                      )}
                    </MetaRow>

                    <CardTitle>{s.title}</CardTitle>
                    {s.subtitle && <CardDesc>{s.subtitle}</CardDesc>}

                    <CardFoot>
                      <span>
                        {s.verificationLevel === 'VERIFIED_CPF' ? 'Exige CPF verificado' : 'Conta verificada'}
                        {s.tseRegistrationCode ? ` · TSE ${s.tseRegistrationCode}` : ''}
                      </span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {s.totalBallots.toLocaleString('pt-BR')} participações
                      </span>
                    </CardFoot>
                  </SurveyCard>
                ))}
              </List>
            )}
          </>
        )}
      </Content>
    </Page>
  )
}
