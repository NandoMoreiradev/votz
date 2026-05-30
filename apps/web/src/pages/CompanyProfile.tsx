import { useState, useRef } from 'react'
import styled from 'styled-components'
import { useParams, Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Navbar } from '../components/layout/Navbar'
import { CategoryBadge, StatusBadge } from '../components/ui/Badge'
import { PressureBar } from '../components/ui/PressureBar'
import { useCompany, useCompanyReports } from '../hooks/useCompanies'
import { useAuthStore } from '../store/auth.store'
import { TeamPanel } from '../components/org/TeamPanel'
import { ReportStatus } from '@votz/shared-types'
import { CategoryStat } from '../types/api'
import { api } from '../lib/api'

// ── Layout ──────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 1480px;
  margin: 0 auto;
  padding: 24px 32px 64px;

  @media (max-width: 820px) { padding: 16px 16px 48px; }
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

const TwoCol = styled.div`
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
  align-items: start;

  @media (max-width: 820px) { grid-template-columns: 1fr; }
`

const MainCol = styled.div``
const SideCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

// ── Header ──────────────────────────────────────────────────────────────────

const HeaderCard = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 28px;
  margin-bottom: 20px;
`

const HeaderTop = styled.div`
  display: flex;
  gap: 18px;
  align-items: flex-start;
  margin-bottom: 20px;
`

const LogoWrapper = styled.div`
  position: relative;
  width: 72px;
  height: 72px;
  flex-shrink: 0;
`

const Logo = styled.div<{ $src: string | null }>`
  width: 72px;
  height: 72px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover` : theme.colors.primary + '14'};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
  border: 1px solid ${({ theme }) => theme.colors.border};
`

const LogoOverlay = styled.button`
  position: absolute;
  inset: 0;
  border-radius: ${({ theme }) => theme.radii.md};
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
  ${LogoWrapper}:hover & { opacity: 1; }
`

const HeaderInfo = styled.div` flex: 1; `

const CompanyName = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 2px;
`

const TradeName = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 8px;
`

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
`

const Tag = styled.span<{ $variant?: 'verified' | 'cnpj' | 'plan' }>`
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  padding: 2px 9px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ $variant, theme }) =>
    $variant === 'verified' ? theme.colors.positive + '18' :
    $variant === 'cnpj' ? theme.colors.neutral :
    $variant === 'plan' ? '#F59E0B18' :
    theme.colors.primary + '12'};
  color: ${({ $variant, theme }) =>
    $variant === 'verified' ? theme.colors.positive :
    $variant === 'cnpj' ? theme.colors.muted :
    $variant === 'plan' ? '#B45309' :
    theme.colors.primary};
  ${({ $variant }) => $variant === 'cnpj' && 'font-family: "JetBrains Mono", monospace;'}
  text-transform: ${({ $variant }) => $variant === 'cnpj' ? 'none' : 'uppercase'};
  letter-spacing: ${({ $variant }) => $variant === 'cnpj' ? '0' : '0.04em'};
`

const Website = styled.a`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.primary};
  &:hover { text-decoration: underline; }
`

const CtaRow = styled.div`
  display: flex;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
`

const ReportCta = styled(Link)`
  padding: 9px 18px;
  background: ${({ theme }) => theme.colors.action};
  color: #fff;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-family: ${({ theme }) => theme.fonts.heading};
  transition: opacity 0.15s;
  &:hover { opacity: 0.85; }
`

// ── Stats row ────────────────────────────────────────────────────────────────

const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  @media (max-width: 480px) { grid-template-columns: repeat(2, 1fr); }
`

const StatBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`

const StatValue = styled.span<{ $color?: string }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ $color, theme }) => $color ?? theme.colors.text};
`

const StatLabel = styled.span`
  font-size: 0.6875rem;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

const MiniBar = styled.div<{ $pct: number; $color: string }>`
  height: 4px;
  border-radius: 2px;
  background: ${({ theme }) => theme.colors.border};
  overflow: hidden;
  margin-top: 4px;
  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${({ $pct }) => Math.min($pct, 100)}%;
    background: ${({ $color }) => $color};
    border-radius: 2px;
    transition: width 0.5s ease;
  }
`

// ── Branches ──────────────────────────────────────────────────────────────────

const BranchGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  @media (max-width: 480px) { grid-template-columns: 1fr; }
`

const BranchItem = styled.div`
  padding: 8px 12px;
  background: ${({ theme }) => theme.colors.neutral};
  border-radius: ${({ theme }) => theme.radii.md};
`

const BranchName = styled.p`
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 2px;
`

const BranchLoc = styled.p`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
`

// ── Sidebar cards ────────────────────────────────────────────────────────────

const SideCard = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px;
`

const SideTitle = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 14px;
`

const ScoreCircle = styled.div<{ $score: number }>`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: conic-gradient(
    ${({ $score, theme }) =>
      $score >= 70 ? theme.colors.positive :
      $score >= 40 ? '#F59E0B' :
      theme.colors.action} ${({ $score }) => $score * 3.6}deg,
    ${({ theme }) => theme.colors.border} 0
  );
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 8px;
  position: relative;
  &::after {
    content: '';
    position: absolute;
    width: 58px;
    height: 58px;
    background: #fff;
    border-radius: 50%;
  }
`

const ScoreInner = styled.div`
  position: relative;
  z-index: 1;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 1.25rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  text-align: center;
`

const ScoreDesc = styled.p`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  text-align: center;
  line-height: 1.4;
`

const CatRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const CatItem = styled.div``

const CatLabel = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
`

const CatName = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.text};
`

const CatCount = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
`

const CatBar = styled.div<{ $pct: number }>`
  height: 5px;
  border-radius: 3px;
  background: ${({ theme }) => theme.colors.border};
  overflow: hidden;
  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${({ $pct }) => $pct}%;
    background: ${({ theme }) => theme.colors.primary};
    border-radius: 3px;
    transition: width 0.5s ease;
  }
`

// ── Reports section ──────────────────────────────────────────────────────────

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  flex-wrap: wrap;
  gap: 10px;
`

const SectionTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const StatusTabs = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`

const StatusTab = styled.button<{ $active: boolean }>`
  padding: 5px 12px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.border};
  background: ${({ $active, theme }) => $active ? theme.colors.primary : 'transparent'};
  color: ${({ $active, theme }) => $active ? '#fff' : theme.colors.muted};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
  transition: all 0.15s;
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ $active, theme }) => $active ? '#fff' : theme.colors.primary};
  }
`

const ReportList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const ReportCard = styled(Link)`
  display: block;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 18px 20px;
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
  margin-bottom: 8px;
`
const RBadges = styled.div` display: flex; gap: 8px; flex-wrap: wrap; `
const RLocation = styled.span` font-size: 0.8125rem; color: ${({ theme }) => theme.colors.muted}; flex-shrink: 0; `
const RTitle = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 12px;
`
const RFooter = styled.div` display: flex; align-items: center; gap: 14px; margin-top: 10px; `
const RStat = styled.span` font-size: 0.8125rem; color: ${({ theme }) => theme.colors.muted}; font-family: ${({ theme }) => theme.fonts.mono}; `
const Dot = styled.span` color: ${({ theme }) => theme.colors.border}; `
const RAgo = styled.span` margin-left: auto; font-size: 0.8125rem; color: ${({ theme }) => theme.colors.muted}; `

const Pagination = styled.div`
  display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 20px;
`
const PageBtn = styled.button<{ $active?: boolean }>`
  min-width: 34px; height: 34px; padding: 0 8px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.border};
  background: ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.white};
  color: ${({ theme, $active }) => $active ? '#fff' : theme.colors.text};
  font-size: 0.875rem; cursor: pointer; transition: all 0.15s;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`

const Skeleton = styled.div`
  background: ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  animation: pulse 1.4s ease-in-out infinite;
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
`

const Empty = styled.p`
  text-align: center; color: ${({ theme }) => theme.colors.muted}; padding: 40px 0;
`

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d === 0) return 'hoje'
  if (d === 1) return 'ontem'
  if (d < 30) return `${d}d`
  return `${Math.floor(d / 30)}m`
}

function formatCnpj(cnpj: string) {
  const d = cnpj.replace(/\D/g, '')
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

const SECTOR_LABELS: Record<string, string> = {
  TELECOM: 'Telecom', SUPPLEMENTAL_HEALTH: 'Saúde Suplementar', FINANCIAL: 'Financeiro',
  ENERGY: 'Energia', TRANSPORTATION: 'Transporte', RETAIL: 'Varejo',
  FOOD: 'Alimentação', CONDOMINIUM: 'Condomínio', OTHER: 'Outro',
}

const SIZE_LABELS: Record<string, string> = {
  MEI: 'MEI', SMALL: 'Pequena', MEDIUM: 'Média', LARGE: 'Grande',
}

const CAT_LABELS: Record<string, string> = {
  HEALTH: 'Saúde', MOBILITY: 'Mobilidade', SAFETY: 'Segurança', EDUCATION: 'Educação',
  SANITATION: 'Saneamento', HOUSING: 'Habitação', ENVIRONMENT: 'Meio Ambiente',
  INFRASTRUCTURE: 'Infraestrutura', URBAN_SERVICES: 'Serviços Urbanos',
  CORRUPTION: 'Corrupção', ACCESSIBILITY: 'Acessibilidade', SOCIAL_WELFARE: 'Assistência Social', OTHER: 'Outro',
}

const STATUS_TABS = [
  { label: 'Todos', value: '' },
  { label: 'Abertos', value: ReportStatus.OPEN },
  { label: 'Em andamento', value: ReportStatus.IN_PROGRESS },
  { label: 'Resolvidos', value: ReportStatus.RESOLVED },
  { label: 'Contestados', value: ReportStatus.DISPUTED },
]

// ── Componente ───────────────────────────────────────────────────────────────

export function CompanyProfile() {
  const { id } = useParams<{ id: string }>()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const { user: currentUser, activeContext } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canEdit = !!activeContext && activeContext.type === 'COMPANY' && activeContext.id === id
  const qc = useQueryClient()

  const { data: company, isLoading } = useCompany(id!)
  const { data: reports, isLoading: loadingReports } = useCompanyReports(id!, page, statusFilter || undefined)

  const logoMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const { data: upload } = await api.post<{ url: string }>('/storage/upload/avatar', form)
      await api.patch(`/companies/${id}`, { logoUrl: upload.url })
      return upload.url
    },
    onSuccess: (url) => {
      qc.setQueryData(['company', id], (old: typeof company) =>
        old ? { ...old, logoUrl: url } : old,
      )
    },
  })

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) logoMutation.mutate(file)
    e.target.value = ''
  }

  const stats = company?.stats
  const resolutionRate = stats && stats.total > 0
    ? Math.round((stats.resolved / stats.total) * 100) : 0
  const openCount = stats?.byStatus?.[ReportStatus.OPEN] ?? 0
  const inProgressCount = stats?.byStatus?.[ReportStatus.IN_PROGRESS] ?? 0

  const topCategories: CategoryStat[] = stats?.byCategory?.slice(0, 5) ?? []
  const maxCatCount = topCategories[0]?.count ?? 1

  function handleTabChange(value: string) {
    setStatusFilter(value)
    setPage(1)
  }

  return (
    <Page>
      <Navbar />
      <Content>
        <BackLink to="/">← Início</BackLink>

        {isLoading ? (
          <HeaderCard>
            <div style={{ display: 'flex', gap: 18, marginBottom: 20 }}>
              <Skeleton style={{ width: 72, height: 72, borderRadius: 8 }} />
              <div style={{ flex: 1 }}>
                <Skeleton style={{ width: '55%', height: 28, marginBottom: 8 }} />
                <Skeleton style={{ width: '30%', height: 18 }} />
              </div>
            </div>
            <Skeleton style={{ height: 60 }} />
          </HeaderCard>
        ) : company ? (
          <HeaderCard>
            <HeaderTop>
              <LogoWrapper>
                <Logo $src={logoMutation.isPending ? null : company.logoUrl}>
                  {!(logoMutation.isPending ? null : company.logoUrl) && company.tradeName.charAt(0)}
                </Logo>
                {currentUser && (
                  <LogoOverlay
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Alterar logomarca"
                  >
                    {logoMutation.isPending ? '...' : 'Alterar'}
                  </LogoOverlay>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={handleLogoFile}
                />
              </LogoWrapper>

              <HeaderInfo>
                <CompanyName>{company.tradeName}</CompanyName>
                {company.tradeName !== company.legalName && (
                  <TradeName>{company.legalName}</TradeName>
                )}
                <MetaRow>
                  <Tag>{SECTOR_LABELS[company.sector] ?? company.sector}</Tag>
                  <Tag>{SIZE_LABELS[company.size] ?? company.size}</Tag>
                  {company.verified && <Tag $variant="verified">✓ Verificada</Tag>}
                  {company.plan !== 'STARTER' && <Tag $variant="plan">{company.plan}</Tag>}
                  <Tag $variant="cnpj">{formatCnpj(company.cnpj)}</Tag>
                </MetaRow>
                {company.website && (
                  <MetaRow>
                    <Website href={company.website} target="_blank" rel="noopener noreferrer">
                      {company.website.replace(/^https?:\/\//, '')}
                    </Website>
                  </MetaRow>
                )}
                <CtaRow>
                  <ReportCta to={`/novo?recipientType=COMPANY&recipientId=${company.id}&recipientName=${encodeURIComponent(company.tradeName)}`}>
                    + Criar relato
                  </ReportCta>
                </CtaRow>
              </HeaderInfo>
            </HeaderTop>

            <StatsRow>
              <StatBox>
                <StatValue>{stats?.total ?? 0}</StatValue>
                <StatLabel>Total de relatos</StatLabel>
              </StatBox>
              <StatBox>
                <StatValue $color="#E63946">{openCount}</StatValue>
                <StatLabel>Em aberto</StatLabel>
                <MiniBar $pct={stats?.total ? (openCount / stats.total) * 100 : 0} $color="#E63946" />
              </StatBox>
              <StatBox>
                <StatValue $color="#3B82F6">{inProgressCount}</StatValue>
                <StatLabel>Em andamento</StatLabel>
                <MiniBar $pct={stats?.total ? (inProgressCount / stats.total) * 100 : 0} $color="#3B82F6" />
              </StatBox>
              <StatBox>
                <StatValue $color="#2DC653">{stats?.resolved ?? 0}</StatValue>
                <StatLabel>Resolvidos ({resolutionRate}%)</StatLabel>
                <MiniBar $pct={resolutionRate} $color="#2DC653" />
              </StatBox>
            </StatsRow>
          </HeaderCard>
        ) : (
          <Empty>Empresa não encontrada.</Empty>
        )}

        {company && (
          <TwoCol>
            <MainCol>
              {currentUser && canEdit && (
                <TeamPanel orgType="COMPANY" orgId={company.id} currentUserId={currentUser.id} />
              )}

              {company.branches.length > 0 && (
                <div style={{ marginTop: currentUser ? 20 : 0, marginBottom: 20 }}>
                  <SectionTitle style={{ marginBottom: 12 }}>Unidades</SectionTitle>
                  <BranchGrid>
                    {company.branches.map((b) => (
                      <BranchItem key={b.id}>
                        <BranchName>{b.name}</BranchName>
                        <BranchLoc>{[b.city, b.state].filter(Boolean).join(', ')}</BranchLoc>
                      </BranchItem>
                    ))}
                  </BranchGrid>
                </div>
              )}

              <div style={{ marginTop: company.branches.length === 0 && currentUser ? 20 : 0 }}>
                <SectionHeader>
                  <SectionTitle>Relatos direcionados</SectionTitle>
                  <StatusTabs>
                    {STATUS_TABS.map((t) => (
                      <StatusTab
                        key={t.value}
                        $active={statusFilter === t.value}
                        onClick={() => handleTabChange(t.value)}
                      >
                        {t.label}
                      </StatusTab>
                    ))}
                  </StatusTabs>
                </SectionHeader>

                {loadingReports ? (
                  <ReportList>
                    {[1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 120 }} />)}
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
                  <Empty>
                    {statusFilter
                      ? 'Nenhum relato com este status.'
                      : 'Nenhum relato direcionado a esta empresa ainda.'}
                  </Empty>
                )}
              </div>
            </MainCol>

            <SideCol>
              <SideCard>
                <SideTitle>Votz Score</SideTitle>
                <ScoreCircle $score={company.votzScore}>
                  <ScoreInner>{Math.round(company.votzScore)}</ScoreInner>
                </ScoreCircle>
                <ScoreDesc>
                  {company.votzScore >= 70
                    ? 'Excelente desempenho no atendimento de reclamações.'
                    : company.votzScore >= 40
                    ? 'Desempenho regular. Há espaço para melhorar.'
                    : 'Muitas reclamações sem resposta adequada.'}
                </ScoreDesc>
              </SideCard>

              {topCategories.length > 0 && (
                <SideCard>
                  <SideTitle>Mais reclamados</SideTitle>
                  <CatRow>
                    {topCategories.map((c) => (
                      <CatItem key={c.category}>
                        <CatLabel>
                          <CatName>{CAT_LABELS[c.category] ?? c.category}</CatName>
                          <CatCount>{c.count}</CatCount>
                        </CatLabel>
                        <CatBar $pct={(c.count / maxCatCount) * 100} />
                      </CatItem>
                    ))}
                  </CatRow>
                </SideCard>
              )}

              <SideCard>
                <SideTitle>SLA de resposta</SideTitle>
                <p style={{ fontSize: '0.875rem', color: 'inherit' }}>
                  Prazo máximo: <strong>{company.slaHours}h</strong>
                </p>
              </SideCard>
            </SideCol>
          </TwoCol>
        )}
      </Content>
    </Page>
  )
}
