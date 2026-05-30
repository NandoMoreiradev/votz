import { useState } from 'react'
import styled from 'styled-components'
import { useParams, Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { CategoryBadge, PropostaStatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import {
  useProposta,
  useMeuVotoProposta,
  useVotarProposta,
  useRemoverVotoProposta,
  useAtualizarStatusProposta,
} from '../hooks/usePropostas'
import { useAuthStore } from '../store/auth.store'
import { Category, PropostaStatus } from '@votz/shared-types'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 860px;
  margin: 0 auto;
  padding: 24px 24px 64px;

  @media (max-width: 640px) { padding: 16px 16px 48px; }
`

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 24px;
  transition: color 0.15s;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`

const Card = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 28px 32px;
  margin-bottom: 20px;

  @media (max-width: 640px) { padding: 20px 18px; }
`

const Badges = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 18px;
  line-height: 1.35;
`

const PoliticoRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  margin-bottom: 24px;
`

const PoliticoAvatar = styled(Link)<{ $src: string | null }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover` : theme.colors.primary + '20'};
  border: 2px solid ${({ theme }) => theme.colors.border};
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.1rem;
  color: ${({ theme }) => theme.colors.primary};
`

const PoliticoInfo = styled.div``

const PoliticoName = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`

const PoliticoMeta = styled.div`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
`

const Description = styled.div`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.7;
  white-space: pre-wrap;

  h1, h2, h3 {
    font-family: ${({ theme }) => theme.fonts.heading};
    font-weight: ${({ theme }) => theme.fontWeights.bold};
    margin: 1.2em 0 0.4em;
    color: ${({ theme }) => theme.colors.text};
  }
  h2 { font-size: 1.1rem; }
  h3 { font-size: 1rem; }
  strong { font-weight: ${({ theme }) => theme.fontWeights.semibold}; }
  ul, ol { padding-left: 1.5em; margin: 0.5em 0; }
  li { margin-bottom: 0.25em; }
`

const ExternalLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 20px;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.primary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 8px 14px;
  transition: all 0.15s;
  &:hover { border-color: ${({ theme }) => theme.colors.primary}; }
`

const VoteCard = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 22px 28px;
  margin-bottom: 20px;
`

const VoteTitle = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 16px;
`

const VoteRow = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
`

const VoteBtn = styled.button<{ $variant: 'apoio' | 'rejeicao'; $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-family: ${({ theme }) => theme.fonts.heading};
  cursor: pointer;
  transition: all 0.15s;
  border: 2px solid ${({ $variant, $active, theme }) =>
    $active
      ? $variant === 'apoio' ? theme.colors.positive : theme.colors.action
      : theme.colors.border};
  background: ${({ $variant, $active, theme }) =>
    $active
      ? $variant === 'apoio' ? theme.colors.positive + '15' : theme.colors.action + '12'
      : 'transparent'};
  color: ${({ $variant, $active, theme }) =>
    $active
      ? $variant === 'apoio' ? theme.colors.positive : theme.colors.action
      : theme.colors.muted};
  &:hover:not(:disabled) {
    border-color: ${({ $variant, theme }) =>
      $variant === 'apoio' ? theme.colors.positive : theme.colors.action};
    color: ${({ $variant, theme }) =>
      $variant === 'apoio' ? theme.colors.positive : theme.colors.action};
  }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const VoteStats = styled.div`
  display: flex;
  gap: 20px;
  margin-top: 14px;
`

const VoteStat = styled.div<{ $color: string }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.9375rem;
  color: ${({ $color }) => $color};
`

const VoteBarTrack = styled.div`
  margin-top: 10px;
  height: 8px;
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.border};
  overflow: hidden;
  position: relative;
`

const VoteBarFill = styled.div<{ $pctApoio: number }>`
  height: 100%;
  width: ${({ $pctApoio }) => $pctApoio}%;
  background: ${({ theme }) => theme.colors.positive};
  border-radius: 4px;
  transition: width 0.4s ease;
`

const UpdateStatusCard = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 22px 28px;
  margin-bottom: 20px;
`

const StatusSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  margin-right: 10px;
`

const TextArea = styled.textarea`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  resize: vertical;
  min-height: 80px;
  margin-top: 10px;
  font-family: ${({ theme }) => theme.fonts.body};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`

const TimelineCard = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 22px 28px;
`

const TimelineTitle = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 18px;
`

const TimelineList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
  &::before {
    content: '';
    position: absolute;
    left: 7px;
    top: 8px;
    bottom: 8px;
    width: 2px;
    background: ${({ theme }) => theme.colors.border};
  }
`

const TimelineItem = styled.div`
  display: flex;
  gap: 16px;
  padding: 0 0 18px;
  position: relative;
`

const TimelineDot = styled.div<{ $tipo: string }>`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 2px;
  background: ${({ $tipo, theme }) =>
    $tipo === 'CREATED' ? theme.colors.primary :
    $tipo === 'STATUS_CHANGED' ? theme.colors.action :
    theme.colors.muted};
  border: 2px solid ${({ theme }) => theme.colors.white};
  box-shadow: 0 0 0 2px ${({ $tipo, theme }) =>
    $tipo === 'CREATED' ? theme.colors.primary + '40' :
    $tipo === 'STATUS_CHANGED' ? theme.colors.action + '40' :
    theme.colors.muted + '40'};
`

const TimelineBody = styled.div` flex: 1; `

const TimelineConteudo = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.5;
  margin-bottom: 4px;
`

const TimelineMeta = styled.div`
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.muted};
`

const Skeleton = styled.div`
  background: ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  animation: pulse 1.4s ease-in-out infinite;
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
`

const STATUS_OPTIONS = [
  { value: PropostaStatus.PRESENTED, label: 'Apresentada' },
  { value: PropostaStatus.IN_VOTE, label: 'Em votação' },
  { value: PropostaStatus.APPROVED, label: 'Aprovada' },
  { value: PropostaStatus.REJECTED, label: 'Rejeitada' },
  { value: PropostaStatus.ARCHIVED, label: 'Arquivada' },
]

const TIPO_LABELS: Record<string, string> = {
  CREATED: 'Criada',
  STATUS_CHANGED: 'Status alterado',
  UPDATED: 'Atualização',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function PropostaDetail() {
  const { id } = useParams<{ id: string }>()
  const { user, activeContext } = useAuthStore()
  const { data: proposta, isLoading } = useProposta(id!)
  const { data: meuVotoData } = useMeuVotoProposta(id!, !!user)
  const { mutate: votar, isPending: votando } = useVotarProposta(id!)
  const { mutate: removerVoto, isPending: removendo } = useRemoverVotoProposta(id!)
  const { mutate: atualizarStatus, isPending: atualizando } = useAtualizarStatusProposta(id!)

  const [novoStatus, setNovoStatus] = useState('')
  const [conteudoStatus, setConteudoStatus] = useState('')

  const meuVoto = meuVotoData?.apoio ?? null
  const isOwner =
    !!activeContext &&
    activeContext.type === 'POLITICIAN' &&
    proposta?.politicoId === activeContext.id

  const total = (proposta?.totalApoios ?? 0) + (proposta?.totalRejeicoes ?? 0)
  const pctApoio = total > 0 ? Math.round((proposta!.totalApoios / total) * 100) : 0

  const canVote =
    !!user &&
    proposta?.status !== PropostaStatus.DRAFT &&
    proposta?.status !== PropostaStatus.ARCHIVED

  function handleVote(apoio: boolean) {
    if (meuVoto === apoio) {
      removerVoto()
    } else {
      votar(apoio)
    }
  }

  function handleUpdateStatus() {
    if (!novoStatus || !conteudoStatus.trim()) return
    atualizarStatus(
      { status: novoStatus, conteudo: conteudoStatus },
      { onSuccess: () => { setNovoStatus(''); setConteudoStatus('') } },
    )
  }

  return (
    <Page>
      <Navbar />
      <Content>
        <BackLink to="/propostas">← Propostas</BackLink>

        {isLoading ? (
          <>
            <Skeleton style={{ height: 280, marginBottom: 16 }} />
            <Skeleton style={{ height: 120, marginBottom: 16 }} />
          </>
        ) : proposta ? (
          <>
            <Card>
              <Badges>
                <PropostaStatusBadge status={proposta.status} />
                {proposta.categorias.map(c => (
                  <CategoryBadge key={c} category={c as Category} />
                ))}
              </Badges>

              <Title>{proposta.titulo}</Title>

              {proposta.politico && (
                <PoliticoRow>
                  <PoliticoAvatar
                    to={`/politico/${proposta.politico.id}`}
                    $src={proposta.politico.avatarUrl ?? null}
                  >
                    {!proposta.politico.avatarUrl && proposta.politico.name.charAt(0)}
                  </PoliticoAvatar>
                  <PoliticoInfo>
                    <PoliticoName>
                      <Link to={`/politico/${proposta.politico.id}`} style={{ color: 'inherit' }}>
                        {proposta.politico.name}
                      </Link>
                    </PoliticoName>
                    <PoliticoMeta>
                      {proposta.politico.office} · {proposta.politico.party.abbreviation} ·{' '}
                      {formatDate(proposta.createdAt)}
                    </PoliticoMeta>
                  </PoliticoInfo>
                </PoliticoRow>
              )}

              <Description>{proposta.descricao}</Description>

              {proposta.linkExterno && (
                <ExternalLink href={proposta.linkExterno} target="_blank" rel="noopener noreferrer">
                  🔗 Ver documento oficial
                </ExternalLink>
              )}
            </Card>

            {/* Votação */}
            <VoteCard>
              <VoteTitle>Opinião dos Cidadãos</VoteTitle>
              <VoteRow>
                <VoteBtn
                  $variant="apoio"
                  $active={meuVoto === true}
                  onClick={() => handleVote(true)}
                  disabled={!canVote || votando || removendo}
                >
                  ▲ Apoiar
                </VoteBtn>
                <VoteBtn
                  $variant="rejeicao"
                  $active={meuVoto === false}
                  onClick={() => handleVote(false)}
                  disabled={!canVote || votando || removendo}
                >
                  ▼ Rejeitar
                </VoteBtn>
                {!user && (
                  <span style={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
                    <Link to="/entrar" style={{ color: '#1A1A2E' }}>Entre</Link> para votar
                  </span>
                )}
              </VoteRow>
              <VoteStats>
                <VoteStat $color="#2DC653">▲ {proposta.totalApoios} apoios</VoteStat>
                <VoteStat $color="#E63946">▼ {proposta.totalRejeicoes} rejeições</VoteStat>
              </VoteStats>
              {total > 0 && (
                <VoteBarTrack>
                  <VoteBarFill $pctApoio={pctApoio} />
                </VoteBarTrack>
              )}
            </VoteCard>

            {/* Atualizar status (só para o político autor) */}
            {isOwner && (
              <UpdateStatusCard>
                <VoteTitle>Atualizar Status</VoteTitle>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <StatusSelect value={novoStatus} onChange={e => setNovoStatus(e.target.value)}>
                    <option value="">Selecionar novo status…</option>
                    {STATUS_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </StatusSelect>
                </div>
                <TextArea
                  placeholder="Descreva o que aconteceu (ex: Proposta apresentada em plenário na sessão de 15/06)"
                  value={conteudoStatus}
                  onChange={e => setConteudoStatus(e.target.value)}
                />
                <div style={{ marginTop: 12 }}>
                  <Button
                    onClick={handleUpdateStatus}
                    disabled={!novoStatus || conteudoStatus.trim().length < 10 || atualizando}
                    size="sm"
                  >
                    {atualizando ? 'Salvando…' : 'Salvar atualização'}
                  </Button>
                </div>
              </UpdateStatusCard>
            )}

            {/* Timeline */}
            {proposta.timeline && proposta.timeline.length > 0 && (
              <TimelineCard>
                <TimelineTitle>Histórico</TimelineTitle>
                <TimelineList>
                  {proposta.timeline.map(ev => (
                    <TimelineItem key={ev.id}>
                      <TimelineDot $tipo={ev.tipo} />
                      <TimelineBody>
                        <TimelineConteudo>{ev.conteudo}</TimelineConteudo>
                        <TimelineMeta>
                          {TIPO_LABELS[ev.tipo] ?? ev.tipo}
                          {ev.autor && ` · ${ev.autor.name}`}
                          {' · '}{formatDate(ev.createdAt)}
                        </TimelineMeta>
                      </TimelineBody>
                    </TimelineItem>
                  ))}
                </TimelineList>
              </TimelineCard>
            )}
          </>
        ) : (
          <p style={{ textAlign: 'center', color: '#9CA3AF', padding: '60px 0' }}>
            Proposta não encontrada.
          </p>
        )}
      </Content>
    </Page>
  )
}
