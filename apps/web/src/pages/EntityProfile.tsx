import { useState } from 'react'
import styled from 'styled-components'
import { useParams, Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { CategoryBadge, StatusBadge } from '../components/ui/Badge'
import { PressureBar } from '../components/ui/PressureBar'
import { useEntity, useEntityReports } from '../hooks/useEntities'
import { EntityType, ReportStatus } from '@votz/shared-types'

// ── Styled ─────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 960px;
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

// ── Header da entidade ─────────────────────────────────────────────────────

const HeaderCard = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 32px;
  margin-bottom: 24px;
`

const HeaderTop = styled.div`
  display: flex;
  gap: 20px;
  align-items: flex-start;
  margin-bottom: 24px;

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
`

const Logo = styled.div<{ $src: string | null }>`
  width: 72px;
  height: 72px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover` : theme.colors.border};
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  color: ${({ theme }) => theme.colors.muted};
  border: 1px solid ${({ theme }) => theme.colors.border};
`

const HeaderInfo = styled.div`
  flex: 1;
`

const EntityName = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 8px;
`

const TypeBadge = styled.span`
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

const VerifiedBadge = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.positive};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`

const Location = styled.span`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
`

const Website = styled.a`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.primary};
  &:hover { text-decoration: underline; }
`

// ── Scores / Stats ─────────────────────────────────────────────────────────

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 16px;
  padding-top: 20px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const StatBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const StatValue = styled.span<{ $color?: string }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ $color, theme }) => $color ?? theme.colors.text};
`

const StatLabel = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

const VotzScoreBar = styled.div<{ $pct: number }>`
  height: 6px;
  border-radius: 3px;
  background: ${({ theme }) => theme.colors.border};
  overflow: hidden;
  margin-top: 4px;

  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${({ $pct }) => $pct}%;
    background: ${({ theme }) => theme.colors.positive};
    border-radius: 3px;
    transition: width 0.6s ease;
  }
`

// ── Relatos ─────────────────────────────────────────────────────────────────

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
  transition: all 0.15s;
  &:hover {
    border-color: #c4c4c4;
    box-shadow: ${({ theme }) => theme.shadows.md};
    transform: translateY(-1px);
  }
`

const RHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
`

const RBadges = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`

const RLocation = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  flex-shrink: 0;
`

const RTitle = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 14px;
`

const RFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
`

const RStat = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
`

const Dot = styled.span` color: ${({ theme }) => theme.colors.border}; `

const RAgo = styled.span`
  margin-left: auto;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
`

// ── Paginação ──────────────────────────────────────────────────────────────

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 24px;
`

const PageBtn = styled.button<{ $active?: boolean }>`
  min-width: 36px;
  height: 36px;
  padding: 0 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.white)};
  color: ${({ theme, $active }) => ($active ? '#fff' : theme.colors.text)};
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.15s;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`

// ── Skeleton / Empty ───────────────────────────────────────────────────────

const Skeleton = styled.div`
  background: ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  animation: pulse 1.4s ease-in-out infinite;
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
`

const Empty = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  padding: 40px 0;
`

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d === 0) return 'hoje'
  if (d === 1) return 'ontem'
  if (d < 30) return `${d}d`
  return `${Math.floor(d / 30)}m`
}

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  CITY_HALL: 'Prefeitura',
  HOSPITAL: 'Hospital',
  CONCESSIONAIRE: 'Concessionária',
  AUTARCHY: 'Autarquia',
  SECRETARIAT: 'Secretaria',
  OTHER: 'Outro',
}

const STATUS_COLORS: Partial<Record<ReportStatus, string>> = {
  [ReportStatus.RESOLVED]: '#2DC653',
  [ReportStatus.IN_PROGRESS]: '#3B82F6',
  [ReportStatus.OPEN]: '#6B7280',
  [ReportStatus.DISPUTED]: '#F97316',
}

// ── Componente ─────────────────────────────────────────────────────────────

export function EntityProfile() {
  const { id } = useParams<{ id: string }>()
  const [page, setPage] = useState(1)
  const { data: entity, isLoading } = useEntity(id!)
  const { data: reports, isLoading: loadingReports } = useEntityReports(id!, page)

  const resolutionRate =
    entity?.stats && entity.stats.total > 0
      ? Math.round((entity.stats.resolved / entity.stats.total) * 100)
      : 0

  return (
    <Page>
      <Navbar />
      <Content>
        <BackLink to="/">← Início</BackLink>

        {isLoading ? (
          <HeaderCard>
            <div style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
              <Skeleton style={{ width: 72, height: 72, borderRadius: 8 }} />
              <div style={{ flex: 1 }}>
                <Skeleton style={{ width: '60%', height: 28, marginBottom: 8 }} />
                <Skeleton style={{ width: '30%', height: 18 }} />
              </div>
            </div>
            <Skeleton style={{ height: 60 }} />
          </HeaderCard>
        ) : entity ? (
          <HeaderCard>
            <HeaderTop>
              <Logo $src={entity.logoUrl}>
                {!entity.logoUrl && entity.legalName.charAt(0)}
              </Logo>
              <HeaderInfo>
                <EntityName>{entity.legalName}</EntityName>
                <MetaRow>
                  <TypeBadge>{ENTITY_TYPE_LABELS[entity.type] ?? entity.type}</TypeBadge>
                  {entity.verified && <VerifiedBadge>✓ Verificada</VerifiedBadge>}
                  {entity.city && (
                    <Location>📍 {[entity.city, entity.state].filter(Boolean).join(', ')}</Location>
                  )}
                </MetaRow>
                {entity.website && (
                  <Website href={entity.website} target="_blank" rel="noopener noreferrer">
                    {entity.website.replace(/^https?:\/\//, '')}
                  </Website>
                )}
              </HeaderInfo>
            </HeaderTop>

            <StatsGrid>
              <StatBox>
                <StatValue>{entity.stats?.total ?? 0}</StatValue>
                <StatLabel>Relatos recebidos</StatLabel>
              </StatBox>
              <StatBox>
                <StatValue $color="#2DC653">{entity.stats?.resolved ?? 0}</StatValue>
                <StatLabel>Resolvidos</StatLabel>
              </StatBox>
              <StatBox>
                <StatValue>{resolutionRate}%</StatValue>
                <StatLabel>Taxa de resolução</StatLabel>
                <VotzScoreBar $pct={resolutionRate} />
              </StatBox>
              <StatBox>
                <StatValue $color={entity.votzScore >= 70 ? '#2DC653' : entity.votzScore >= 40 ? '#F59E0B' : '#E63946'}>
                  {Math.round(entity.votzScore)}
                </StatValue>
                <StatLabel>Votz Score</StatLabel>
                <VotzScoreBar $pct={entity.votzScore} />
              </StatBox>
            </StatsGrid>
          </HeaderCard>
        ) : (
          <Empty>Entidade não encontrada.</Empty>
        )}

        <SectionTitle>Relatos direcionados</SectionTitle>

        {loadingReports ? (
          <ReportList>
            {[1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 130 }} />)}
          </ReportList>
        ) : reports && reports.data.length > 0 ? (
          <>
            <ReportList>
              {reports.data.map((r) => {
                const location = [r.city, r.state].filter(Boolean).join(', ')
                return (
                  <ReportCard key={r.id} to={`/relatos/${r.id}`}>
                    <RHeader>
                      <RBadges>
                        <CategoryBadge category={r.category} />
                        <StatusBadge status={r.status} />
                      </RBadges>
                      {location && <RLocation>{location}</RLocation>}
                    </RHeader>
                    <RTitle>{r.title}</RTitle>
                    <PressureBar score={r.pressureScore} />
                    <RFooter>
                      <RStat>▲ {r._count.votes}</RStat>
                      <Dot>·</Dot>
                      <RStat>💬 {r._count.comments}</RStat>
                      <RAgo>{timeAgo(r.createdAt)}</RAgo>
                    </RFooter>
                  </ReportCard>
                )
              })}
            </ReportList>

            {reports.meta.totalPages > 1 && (
              <Pagination>
                <PageBtn disabled={page === 1} onClick={() => setPage((p) => p - 1)}>←</PageBtn>
                {Array.from({ length: reports.meta.totalPages }, (_, i) => i + 1).map((p) => (
                  <PageBtn key={p} $active={p === page} onClick={() => setPage(p)}>{p}</PageBtn>
                ))}
                <PageBtn disabled={page === reports.meta.totalPages} onClick={() => setPage((p) => p + 1)}>→</PageBtn>
              </Pagination>
            )}
          </>
        ) : (
          <Empty>Nenhum relato direcionado a esta entidade ainda.</Empty>
        )}
      </Content>
    </Page>
  )
}
