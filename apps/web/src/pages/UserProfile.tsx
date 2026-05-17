import { useState } from 'react'
import styled from 'styled-components'
import { useParams, Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { CategoryBadge, StatusBadge } from '../components/ui/Badge'
import { PressureBar } from '../components/ui/PressureBar'
import { useUser, useUserReports } from '../hooks/useUser'
import { UserType } from '@votz/shared-types'

// ── Layout ────────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 1120px;
  margin: 0 auto;
  padding: 24px 32px 64px;

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

// ── Perfil ─────────────────────────────────────────────────────────────────

const ProfileCard = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 32px;
  margin-bottom: 24px;
  display: flex;
  gap: 24px;
  align-items: flex-start;

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
`

const Avatar = styled.div<{ $src: string | null }>`
  width: 88px;
  height: 88px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover` : theme.colors.border};
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  color: ${({ theme }) => theme.colors.muted};
`

const ProfileInfo = styled.div`
  flex: 1;
`

const ProfileName = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`

const ProfileMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
`

const TypeBadge = styled.span`
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

const VerifiedBadge = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.positive};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`

const Bio = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.6;
  margin-bottom: 16px;
`

const StatsRow = styled.div`
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
`

const Stat = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const StatValue = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const StatLabel = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

// ── Relatos ────────────────────────────────────────────────────────────────

const SectionTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 16px;
`

const ReportList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const ReportCard = styled(Link)`
  display: block;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px 24px;
  transition: all 0.15s ease;

  &:hover {
    border-color: #c4c4c4;
    box-shadow: ${({ theme }) => theme.shadows.md};
    transform: translateY(-1px);
  }
`

const ReportHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
`

const ReportBadges = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`

const ReportLocation = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  flex-shrink: 0;
`

const ReportTitle = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.3;
  margin-bottom: 14px;
`

const ReportFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
`

const FooterStat = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
`

const Dot = styled.span`
  color: ${({ theme }) => theme.colors.border};
`

const InstitutionalLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  padding: 7px 14px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  font-size: 0.875rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.primary};
  transition: all 0.15s;
  width: fit-content;
  &:hover {
    background: ${({ theme }) => theme.colors.primary};
    color: #fff;
  }
`

const ReportAgo = styled.span`
  margin-left: auto;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
`

// ── Paginação ──────────────────────────────────────────────────────────────

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 24px;
`

const PageButton = styled.button<{ $active?: boolean }>`
  min-width: 36px;
  height: 36px;
  padding: 0 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.white)};
  color: ${({ theme, $active }) => ($active ? theme.colors.white : theme.colors.text)};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
  transition: all 0.15s;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &:not(:disabled):hover {
    background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.surfaceHover)};
  }
`

// ── Estado vazio / loading ─────────────────────────────────────────────────

const Empty = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  padding: 40px 0;
`

const Skeleton = styled.div`
  background: ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  animation: pulse 1.4s ease-in-out infinite;

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }
`

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.floor(days / 7)}sem`
  return `${Math.floor(days / 30)}m`
}

const USER_TYPE_LABELS: Record<UserType, string> = {
  CITIZEN: 'Cidadão',
  ENTITY: 'Entidade',
  POLITICIAN: 'Político',
  PRESS: 'Imprensa',
  NGO: 'ONG',
  RESEARCHER: 'Pesquisador',
  MODERATOR: 'Moderador',
  ADMIN: 'Admin',
}

// ── Componente ─────────────────────────────────────────────────────────────

export function UserProfile() {
  const { id } = useParams<{ id: string }>()
  const [page, setPage] = useState(1)

  const { data: user, isLoading: loadingUser } = useUser(id!)
  const { data: reports, isLoading: loadingReports } = useUserReports(id!, page)

  return (
    <Page>
      <Navbar />
      <Content>
        <BackLink to="/">← Início</BackLink>

        {loadingUser ? (
          <ProfileCard>
            <Skeleton style={{ width: 88, height: 88, borderRadius: '9999px' }} />
            <ProfileInfo>
              <Skeleton style={{ width: 200, height: 28, marginBottom: 8 }} />
              <Skeleton style={{ width: 120, height: 18, marginBottom: 12 }} />
              <Skeleton style={{ width: '80%', height: 16 }} />
            </ProfileInfo>
          </ProfileCard>
        ) : user ? (
          <ProfileCard>
            <Avatar $src={user.avatarUrl}>
              {!user.avatarUrl && user.name.charAt(0).toUpperCase()}
            </Avatar>
            <ProfileInfo>
              <ProfileName>{user.name}</ProfileName>
              <ProfileMeta>
                <TypeBadge>{USER_TYPE_LABELS[user.type] ?? user.type}</TypeBadge>
                {user.verified && <VerifiedBadge>✓ Verificado</VerifiedBadge>}
              </ProfileMeta>
              {user.bio && <Bio>{user.bio}</Bio>}
              <StatsRow>
                <Stat>
                  <StatValue>{user._count.reports}</StatValue>
                  <StatLabel>Relatos</StatLabel>
                </Stat>
                <Stat>
                  <StatValue>{user._count.votes}</StatValue>
                  <StatLabel>Apoios</StatLabel>
                </Stat>
                <Stat>
                  <StatValue>{Math.round(user.reputation)}</StatValue>
                  <StatLabel>Reputação</StatLabel>
                </Stat>
              </StatsRow>

              {user.entity && (
                <InstitutionalLink to={`/entidade/${user.entity.id}`}>
                  Ver perfil da entidade →
                </InstitutionalLink>
              )}
              {user.politician && (
                <InstitutionalLink to={`/politico/${user.politician.id}`}>
                  Ver perfil do político →
                </InstitutionalLink>
              )}
            </ProfileInfo>
          </ProfileCard>
        ) : (
          <Empty>Usuário não encontrado.</Empty>
        )}

        <SectionTitle>Relatos públicos</SectionTitle>

        {loadingReports ? (
          <ReportList>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} style={{ height: 130 }} />
            ))}
          </ReportList>
        ) : reports && reports.data.length > 0 ? (
          <>
            <ReportList>
              {reports.data.map((r) => {
                const location = [r.city, r.state].filter(Boolean).join(', ')
                return (
                  <ReportCard key={r.id} to={`/relatos/${r.id}`}>
                    <ReportHeader>
                      <ReportBadges>
                        <CategoryBadge category={r.category} />
                        <StatusBadge status={r.status} />
                      </ReportBadges>
                      {location && <ReportLocation>{location}</ReportLocation>}
                    </ReportHeader>
                    <ReportTitle>{r.title}</ReportTitle>
                    <PressureBar score={r.pressureScore} />
                    <ReportFooter>
                      <FooterStat>▲ {r._count.votes}</FooterStat>
                      <Dot>·</Dot>
                      <FooterStat>💬 {r._count.comments}</FooterStat>
                      <ReportAgo>{timeAgo(r.createdAt)}</ReportAgo>
                    </ReportFooter>
                  </ReportCard>
                )
              })}
            </ReportList>

            {reports.meta.totalPages > 1 && (
              <Pagination>
                <PageButton disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  ←
                </PageButton>
                {Array.from({ length: reports.meta.totalPages }, (_, i) => i + 1).map((p) => (
                  <PageButton key={p} $active={p === page} onClick={() => setPage(p)}>
                    {p}
                  </PageButton>
                ))}
                <PageButton
                  disabled={page === reports.meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  →
                </PageButton>
              </Pagination>
            )}
          </>
        ) : (
          <Empty>Este usuário ainda não tem relatos públicos.</Empty>
        )}
      </Content>
    </Page>
  )
}
