import { useState } from 'react'
import styled from 'styled-components'
import { useParams, Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { CategoryBadge, StatusBadge } from '../components/ui/Badge'
import { PressureBar } from '../components/ui/PressureBar'
import { usePolitician, usePoliticianReports } from '../hooks/usePoliticians'
import { useAuthStore } from '../store/auth.store'
import { TeamPanel } from '../components/org/TeamPanel'

// ── Styled ─────────────────────────────────────────────────────────────────

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

// ── Header ────────────────────────────────────────────────────────────────

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
  margin-bottom: 28px;

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
`

const Avatar = styled(Link)<{ $src: string | null }>`
  width: 80px;
  height: 80px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover` : theme.colors.border};
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  color: ${({ theme }) => theme.colors.muted};
  border: 2px solid ${({ theme }) => theme.colors.border};
  text-decoration: none;
`

const Info = styled.div`
  flex: 1;
`

const Name = styled.h1`
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
  margin-bottom: 4px;
`

const Tag = styled.span<{ $variant?: 'party' | 'office' | 'verified' }>`
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ $variant, theme }) =>
    $variant === 'party' ? theme.colors.action + '18' :
    $variant === 'office' ? theme.colors.primary + '12' :
    theme.colors.positive + '18'};
  color: ${({ $variant, theme }) =>
    $variant === 'party' ? theme.colors.action :
    $variant === 'office' ? theme.colors.primary :
    theme.colors.positive};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

const Location = styled.span`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
`

const Term = styled.p`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 4px;
  font-family: ${({ theme }) => theme.fonts.mono};
`

// ── Mandatômetro ────────────────────────────────────────────────────────────

const MandatometerGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 16px;
  padding-top: 20px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const MCard = styled.div<{ $color: string }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ $color }) => $color + '10'};
  border: 1px solid ${({ $color }) => $color + '30'};
`

const MValue = styled.span<{ $color: string }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ $color }) => $color};
`

const MLabel = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

const ResolutionBar = styled.div<{ $pct: number; $color: string }>`
  height: 6px;
  border-radius: 3px;
  background: ${({ theme }) => theme.colors.border};
  overflow: hidden;
  margin-top: 4px;
  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${({ $pct }) => Math.min($pct, 100)}%;
    background: ${({ $color }) => $color};
    border-radius: 3px;
    transition: width 0.6s ease;
  }
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
const RBadges = styled.div`display: flex; gap: 8px; flex-wrap: wrap;`
const RLocation = styled.span`font-size: 0.8125rem; color: ${({ theme }) => theme.colors.muted}; flex-shrink: 0;`
const RTitle = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 14px;
`
const RFooter = styled.div`display: flex; align-items: center; gap: 16px; margin-top: 12px;`
const RStat = styled.span`font-size: 0.8125rem; color: ${({ theme }) => theme.colors.muted}; font-family: ${({ theme }) => theme.fonts.mono};`
const Dot = styled.span`color: ${({ theme }) => theme.colors.border};`
const RAgo = styled.span`margin-left: auto; font-size: 0.8125rem; color: ${({ theme }) => theme.colors.muted};`

// ── Paginação ──────────────────────────────────────────────────────────────

const Pagination = styled.div`
  display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 24px;
`
const PageBtn = styled.button<{ $active?: boolean }>`
  min-width: 36px; height: 36px; padding: 0 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.border};
  background: ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.white};
  color: ${({ theme, $active }) => $active ? '#fff' : theme.colors.text};
  font-size: 0.875rem; cursor: pointer; transition: all 0.15s;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`

// ── Skeleton / Empty ───────────────────────────────────────────────────────

const Skeleton = styled.div`
  background: ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  animation: pulse 1.4s ease-in-out infinite;
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
`
const Empty = styled.p`
  text-align: center; color: ${({ theme }) => theme.colors.muted}; padding: 40px 0;
`

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d === 0) return 'hoje'
  if (d === 1) return 'ontem'
  if (d < 30) return `${d}d`
  return `${Math.floor(d / 30)}m`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
}

// ── Componente ─────────────────────────────────────────────────────────────

export function PoliticianProfile() {
  const { id } = useParams<{ id: string }>()
  const [page, setPage] = useState(1)
  const { data: politician, isLoading } = usePolitician(id!)
  const { data: reports, isLoading: loadingReports } = usePoliticianReports(id!, page)
  const currentUser = useAuthStore((s) => s.user)

  const m = politician?.mandatometer
  const resolutionPct = m && m.total > 0 ? Math.round((m.resolved / m.total) * 100) : 0
  const ignoredPct = m && m.total > 0 ? Math.round((m.ignored / m.total) * 100) : 0

  return (
    <Page>
      <Navbar />
      <Content>
        <BackLink to="/">← Início</BackLink>

        {isLoading ? (
          <HeaderCard>
            <div style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
              <Skeleton style={{ width: 80, height: 80, borderRadius: '50%' }} />
              <div style={{ flex: 1 }}>
                <Skeleton style={{ width: '50%', height: 28, marginBottom: 8 }} />
                <Skeleton style={{ width: '30%', height: 18 }} />
              </div>
            </div>
            <Skeleton style={{ height: 80 }} />
          </HeaderCard>
        ) : politician ? (
          <HeaderCard>
            <HeaderTop>
              <Avatar
                to={`/perfil/${politician.user.id}`}
                $src={politician.user.avatarUrl}
              >
                {!politician.user.avatarUrl && politician.user.name.charAt(0)}
              </Avatar>
              <Info>
                <Name>{politician.user.name}</Name>
                <MetaRow>
                  <Tag $variant="office">{politician.office}</Tag>
                  <Tag $variant="party">{politician.party}</Tag>
                  {politician.verified && <Tag $variant="verified">✓ Verificado</Tag>}
                </MetaRow>
                <MetaRow>
                  <Location>
                    📍 {politician.electoralZone} — {[politician.city, politician.state].filter(Boolean).join(', ')}
                  </Location>
                </MetaRow>
                <Term>
                  Mandato: {formatDate(politician.termStart)} → {formatDate(politician.termEnd)}
                </Term>
              </Info>
            </HeaderTop>

            {/* Mandatômetro */}
            <MandatometerGrid>
              <MCard $color="#6B7280">
                <MValue $color="#6B7280">{m?.total ?? 0}</MValue>
                <MLabel>Total</MLabel>
              </MCard>
              <MCard $color="#2DC653">
                <MValue $color="#2DC653">{m?.resolved ?? 0}</MValue>
                <MLabel>Resolvidos</MLabel>
                <ResolutionBar $pct={resolutionPct} $color="#2DC653" />
              </MCard>
              <MCard $color="#3B82F6">
                <MValue $color="#3B82F6">{m?.inProgress ?? 0}</MValue>
                <MLabel>Em andamento</MLabel>
              </MCard>
              <MCard $color="#E63946">
                <MValue $color="#E63946">{m?.ignored ?? 0}</MValue>
                <MLabel>Sem resposta</MLabel>
                <ResolutionBar $pct={ignoredPct} $color="#E63946" />
              </MCard>
            </MandatometerGrid>
          </HeaderCard>
        ) : (
          <Empty>Político não encontrado.</Empty>
        )}

        {currentUser && politician && (
          <TeamPanel orgType="POLITICIAN" orgId={politician.id} currentUserId={currentUser.id} />
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
          <Empty>Nenhum relato direcionado a este político ainda.</Empty>
        )}
      </Content>
    </Page>
  )
}
