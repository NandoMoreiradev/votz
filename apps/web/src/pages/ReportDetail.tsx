import styled from 'styled-components'
import { useParams, Link } from 'react-router-dom'
import { VoteType, EventType } from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import { CategoryBadge, StatusBadge } from '../components/ui/Badge'
import { PressureBar } from '../components/ui/PressureBar'
import { Button } from '../components/ui/Button'
import { useReport } from '../hooks/useReport'
import { useVote } from '../hooks/useVote'
import { useAuthStore } from '../store/auth.store'
import { TimelineEvent } from '../types/api'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 1040px;
  margin: 0 auto;
  padding: 32px 16px 80px;
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

const Layout = styled.div`
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
  align-items: start;

  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    grid-template-columns: 1fr;
  }
`

const Main = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`

const Card = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 28px;
`

const Badges = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  line-height: 1.25;
  margin-bottom: 12px;
`

const Location = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 20px;
`

const Description = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.md};
  line-height: 1.75;
  color: ${({ theme }) => theme.colors.text};
  white-space: pre-wrap;
`

const Sidebar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: 76px;
`

const SideCard = styled(Card)`
  padding: 20px;
`

const SideTitle = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 16px;
`

const VoteButtons = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const VoteBtn = styled(Button)<{ $active?: boolean }>`
  width: 100%;
  justify-content: space-between;
  font-size: 0.9375rem;
  ${({ $active, theme }) => $active && `border-color: ${theme.colors.action}; background: ${theme.colors.action}18;`}
`

const TimelineList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`

const TimelineItem = styled.div`
  display: flex;
  gap: 12px;
  padding-bottom: 20px;
  position: relative;

  &:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 7px;
    top: 16px;
    bottom: 0;
    width: 2px;
    background: ${({ theme }) => theme.colors.border};
  }
`

const TimelineDot = styled.div<{ $color?: string }>`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: ${({ $color, theme }) => $color || theme.colors.border};
  border: 2px solid ${({ theme }) => theme.colors.white};
  box-shadow: 0 0 0 2px ${({ $color, theme }) => $color || theme.colors.border};
  flex-shrink: 0;
  margin-top: 2px;
`

const TimelineContent = styled.div`
  flex: 1;
  min-width: 0;
`

const TimelineText = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.5;
`

const TimelineDate = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
`

const Skeleton = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  height: 300px;
  animation: pulse 1.5s ease-in-out infinite;

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`

const EVENT_COLORS: Record<EventType, string> = {
  [EventType.CREATED]:       '#9CA3AF',
  [EventType.RESPONDED]:     '#3B82F6',
  [EventType.STATUS_CHANGED]:'#F59E0B',
  [EventType.DISPUTED]:      '#F97316',
  [EventType.RESOLVED]:      '#2DC653',
  [EventType.ARCHIVED]:      '#6B7280',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  return (
    <TimelineItem>
      <TimelineDot $color={EVENT_COLORS[event.type]} />
      <TimelineContent>
        <TimelineText>{event.content}</TimelineText>
        <TimelineDate>{formatDate(event.createdAt)}</TimelineDate>
      </TimelineContent>
    </TimelineItem>
  )
}

export function ReportDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: report, isLoading } = useReport(id!)
  const { mutate: vote } = useVote(id!)
  const user = useAuthStore((s) => s.user)

  if (isLoading) {
    return (
      <Page>
        <Navbar />
        <Content>
          <BackLink to="/">← Voltar</BackLink>
          <Layout>
            <Skeleton />
            <Skeleton style={{ height: 200 }} />
          </Layout>
        </Content>
      </Page>
    )
  }

  if (!report) return null

  const location = [report.neighborhood, report.city, report.state].filter(Boolean).join(', ')

  function handleVote(type: VoteType) {
    if (!user) {
      window.location.href = '/entrar'
      return
    }
    vote(type)
  }

  return (
    <Page>
      <Navbar />
      <Content>
        <BackLink to="/">← Voltar</BackLink>

        <Layout>
          <Main>
            <Card>
              <Badges>
                <CategoryBadge category={report.category} />
                <StatusBadge status={report.status} />
              </Badges>

              <Title>{report.title}</Title>
              {location && <Location>📍 {location}</Location>}

              <PressureBar score={report.pressureScore} />

              <Description style={{ marginTop: 24 }}>
                {report.description}
              </Description>
            </Card>
          </Main>

          <Sidebar>
            <SideCard>
              <SideTitle>Pressão coletiva</SideTitle>
              <VoteButtons>
                <VoteBtn
                  variant="outline"
                  onClick={() => handleVote(VoteType.SUPPORT)}
                >
                  <span>▲ Apoio</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                    {report._count.votes}
                  </span>
                </VoteBtn>
                <VoteBtn
                  variant="outline"
                  onClick={() => handleVote(VoteType.ME_TOO)}
                  style={{ fontSize: '0.875rem', color: '#6B7280' }}
                >
                  <span>⚠ Também sofro isso</span>
                </VoteBtn>
              </VoteButtons>
            </SideCard>

            {report.timeline && report.timeline.length > 0 && (
              <SideCard>
                <SideTitle>Linha do tempo</SideTitle>
                <TimelineList>
                  {report.timeline.map((event) => (
                    <TimelineRow key={event.id} event={event} />
                  ))}
                </TimelineList>
              </SideCard>
            )}
          </Sidebar>
        </Layout>
      </Content>
    </Page>
  )
}
