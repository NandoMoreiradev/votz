import styled from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Navbar } from '../components/layout/Navbar'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RegistrationRequest {
  id: string
  type: 'ENTITY' | 'POLITICIAN' | 'COMPANY'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  payload: Record<string, unknown>
  claimTargetId: string | null
  reviewNote: string | null
  approvedOrgId: string | null
  approvedOrgType: 'ENTITY' | 'POLITICIAN' | 'COMPANY' | null
  createdAt: string
  updatedAt: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  ENTITY:    'Entidade Pública',
  POLITICIAN: 'Político',
  COMPANY:   'Empresa',
}

const TYPE_LABEL_CLAIM: Record<string, string> = {
  ENTITY:    'Reivindicação de Entidade',
  POLITICIAN: 'Reivindicação de Político',
  COMPANY:   'Reivindicação de Empresa',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING:  'Em análise',
  APPROVED: 'Aprovado',
  REJECTED: 'Não aprovado',
}

function orgName(req: RegistrationRequest): string {
  const p = req.payload
  if (req.type === 'POLITICIAN') return (p['name'] as string) ?? '—'
  return (p['legalName'] as string) ?? '—'
}

function orgLink(req: RegistrationRequest): string | null {
  if (!req.approvedOrgId || !req.approvedOrgType) return null
  const map: Record<string, string> = {
    ENTITY:    '/entidade',
    POLITICIAN: '/politico',
    COMPANY:   '/empresa',
  }
  return `${map[req.approvedOrgType]}/${req.approvedOrgId}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Styled ─────────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 680px;
  margin: 0 auto;
  padding: 32px 24px 80px;

  @media (max-width: 640px) { padding: 16px 16px 64px; }
`

const BackLink = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  margin-bottom: 24px;
  transition: color 0.15s;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 8px;
`

const Subtitle = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 32px;
  line-height: 1.5;
`

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const Card = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 24px;
`

const CardHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`

const CardTitle = styled.div`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: 1rem;
  color: ${({ theme }) => theme.colors.text};
`

const CardMeta = styled.div`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 2px;
`

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-block;
  padding: 3px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  flex-shrink: 0;
  background: ${({ $status }) =>
    $status === 'APPROVED' ? '#dcfce7' :
    $status === 'REJECTED' ? '#fee2e2' :
    '#fef9c3'};
  color: ${({ $status }) =>
    $status === 'APPROVED' ? '#14532d' :
    $status === 'REJECTED' ? '#7f1d1d' :
    '#713f12'};
`

const ReviewNote = styled.div`
  margin-top: 16px;
  padding: 12px 16px;
  border-left: 3px solid ${({ theme }) => theme.colors.action};
  background: #fff5f5;
  border-radius: 0 ${({ theme }) => theme.radii.md} ${({ theme }) => theme.radii.md} 0;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.5;
`

const ReviewNoteLabel = styled.span`
  display: block;
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.action};
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

const ApprovedLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.primary};
  text-decoration: none;
  transition: opacity 0.15s;

  &:hover { opacity: 0.8; }
`

const NewRequestBtn = styled(Link)`
  display: inline-block;
  margin-bottom: 28px;
  padding: 10px 20px;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-decoration: none;
  transition: opacity 0.15s;

  &:hover { opacity: 0.88; }
`

const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
`

const EmptyTitle = styled.p`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 8px;
`

const EmptyDesc = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 24px;
`

const PendingNote = styled.p`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 12px;
  line-height: 1.5;
`

// ── Component ──────────────────────────────────────────────────────────────────

export function MyRequests() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  const { data: requests = [], isLoading } = useQuery<RegistrationRequest[]>({
    queryKey: ['my-requests'],
    queryFn: () => api.get('/registration-requests/mine').then((r) => r.data),
    enabled: !!user,
    staleTime: 60_000,
  })

  if (!user) {
    return (
      <Page>
        <Navbar />
        <Content>
          <EmptyState>
            <EmptyTitle>Você precisa estar logado</EmptyTitle>
            <EmptyDesc>Entre na sua conta para ver suas solicitações.</EmptyDesc>
            <NewRequestBtn to="/entrar">Entrar</NewRequestBtn>
          </EmptyState>
        </Content>
      </Page>
    )
  }

  return (
    <Page>
      <Navbar />
      <Content>
        <BackLink onClick={() => navigate(-1)}>← Voltar</BackLink>
        <Title>Minhas solicitações</Title>
        <Subtitle>
          Acompanhe o status das suas solicitações de cadastro de entidade, político ou empresa.
          Nossa equipe revisa em até 48 horas.
        </Subtitle>

        <NewRequestBtn to="/solicitar-cadastro">+ Nova solicitação</NewRequestBtn>

        {isLoading ? (
          <EmptyState>
            <EmptyDesc>Carregando...</EmptyDesc>
          </EmptyState>
        ) : requests.length === 0 ? (
          <EmptyState>
            <EmptyTitle>Nenhuma solicitação ainda</EmptyTitle>
            <EmptyDesc>
              Não encontrou a entidade, político ou empresa que procura?
              Envie uma solicitação e nossa equipe cadastra em até 48 horas.
            </EmptyDesc>
          </EmptyState>
        ) : (
          <List>
            {requests.map((req) => {
              const link = orgLink(req)
              return (
                <Card key={req.id}>
                  <CardHeader>
                    <div>
                      <CardTitle>{orgName(req)}</CardTitle>
                      <CardMeta>
                        {req.claimTargetId ? TYPE_LABEL_CLAIM[req.type] : TYPE_LABEL[req.type]} · Enviada em {formatDate(req.createdAt)}
                        {req.status !== 'PENDING' && ` · Revisada em ${formatDate(req.updatedAt)}`}
                      </CardMeta>
                    </div>
                    <StatusBadge $status={req.status}>
                      {STATUS_LABEL[req.status]}
                    </StatusBadge>
                  </CardHeader>

                  {req.status === 'PENDING' && (
                    <PendingNote>
                      Sua solicitação está sendo analisada pela equipe de moderação. Você receberá um e-mail com o resultado.
                    </PendingNote>
                  )}

                  {req.status === 'REJECTED' && req.reviewNote && (
                    <ReviewNote>
                      <ReviewNoteLabel>Motivo informado</ReviewNoteLabel>
                      {req.reviewNote}
                    </ReviewNote>
                  )}

                  {req.status === 'REJECTED' && (
                    <PendingNote>
                      Você pode enviar uma nova solicitação com as correções necessárias.
                    </PendingNote>
                  )}

                  {req.status === 'APPROVED' && link && (
                    <ApprovedLink to={link}>
                      Ver perfil aprovado →
                    </ApprovedLink>
                  )}
                </Card>
              )
            })}
          </List>
        )}
      </Content>
    </Page>
  )
}
