import { useState } from 'react'
import styled from 'styled-components'
import { useParams, Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { CategoryBadge, StatusBadge } from '../components/ui/Badge'
import { PressureBar } from '../components/ui/PressureBar'
import { usePolitician, usePoliticianReports } from '../hooks/usePoliticians'
import { usePoliticianPropostas, PublicProposta } from '../hooks/usePropostas'
import { useAuthStore } from '../store/auth.store'
import { Button } from '../components/ui/Button'
import { TeamPanel } from '../components/org/TeamPanel'
import { PropostaStatusBadge } from '../components/ui/Badge'
import { VolumeChart } from '../components/profile/VolumeChart'
import { MetricsBar } from '../components/profile/MetricsBar'
import { TrustBadge } from '../components/profile/TrustBadge'
import { ReportStatus } from '@votz/shared-types'
import { CategoryStat } from '../types/api'

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

  @media (max-width: 480px) { flex-direction: column; align-items: center; text-align: center; }
`

const AvatarLink = styled(Link)<{ $src: string | null }>`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover` : theme.colors.primary + '14'};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
  border: 2px solid ${({ theme }) => theme.colors.border};
  text-decoration: none;
`

const Info = styled.div` flex: 1; `

const Name = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 8px;
`

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
`

const Tag = styled.span<{ $variant?: 'office' | 'party' | 'verified' | 'number' }>`
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  padding: 2px 9px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ $variant, theme }) =>
    $variant === 'party' ? theme.colors.action + '18' :
    $variant === 'verified' ? theme.colors.positive + '18' :
    $variant === 'number' ? theme.colors.neutral :
    theme.colors.primary + '12'};
  color: ${({ $variant, theme }) =>
    $variant === 'party' ? theme.colors.action :
    $variant === 'verified' ? theme.colors.positive :
    $variant === 'number' ? theme.colors.muted :
    theme.colors.primary};
  text-transform: ${({ $variant }) => $variant === 'number' ? 'none' : 'uppercase'};
  letter-spacing: ${({ $variant }) => $variant === 'number' ? '0' : '0.04em'};
  ${({ $variant }) => $variant === 'number' && 'font-family: "JetBrains Mono", monospace;'}
`

const Location = styled.span`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
`

const Term = styled.p`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
  margin-top: 4px;
`

const Bio = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.55;
  margin-top: 10px;
  font-style: italic;
`

const CtaRow = styled.div`
  display: flex;
  gap: 10px;
  margin-top: 14px;
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

// Mandate progress bar
const MandateProgress = styled.div`
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const ProgressLabel = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 6px;
`

const ProgressTrack = styled.div<{ $pct: number }>`
  height: 8px;
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.border};
  overflow: hidden;
  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${({ $pct }) => Math.min($pct, 100)}%;
    background: ${({ theme }) => theme.colors.primary};
    border-radius: 4px;
    transition: width 0.6s ease;
  }
`

// ── Mandatômetro ─────────────────────────────────────────────────────────────

const MGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  margin-top: 16px;

  @media (max-width: 480px) { grid-template-columns: repeat(2, 1fr); }
`

const MCard = styled.div<{ $color: string }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ $color }) => $color + '10'};
  border: 1px solid ${({ $color }) => $color + '25'};
`

const MValue = styled.span<{ $color: string }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ $color }) => $color};
`

const MLabel = styled.span`
  font-size: 0.6875rem;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

const MBar = styled.div<{ $pct: number; $color: string }>`
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

// ── Sidebar ──────────────────────────────────────────────────────────────────

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

const CatRow = styled.div` display: flex; flex-direction: column; gap: 10px; `
const CatItem = styled.div``
const CatLabel = styled.div` display: flex; justify-content: space-between; margin-bottom: 4px; `
const CatName = styled.span` font-size: 0.8125rem; color: ${({ theme }) => theme.colors.text}; `
const CatCount = styled.span` font-size: 0.8125rem; color: ${({ theme }) => theme.colors.muted}; font-family: ${({ theme }) => theme.fonts.mono}; `
const CatBar = styled.div<{ $pct: number }>`
  height: 5px; border-radius: 3px; background: ${({ theme }) => theme.colors.border}; overflow: hidden;
  &::after { content: ''; display: block; height: 100%; width: ${({ $pct }) => $pct}%; background: ${({ theme }) => theme.colors.action}; border-radius: 3px; transition: width 0.5s ease; }
`

// Party card
const PartyCard = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`

const PartyLogo = styled.div<{ $src: string | null }>`
  width: 48px;
  height: 48px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover no-repeat` : theme.colors.border};
  flex-shrink: 0;
  border: 1px solid ${({ theme }) => theme.colors.border};
`

const PartyInfo = styled.div``
const PartyAbbr = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`
const PartyName = styled.div`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
`
const PartyNumber = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 2px;
`

// ── Reports ──────────────────────────────────────────────────────────────────

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

const StatusTabs = styled.div` display: flex; gap: 6px; flex-wrap: wrap; `
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
  &:hover { border-color: ${({ theme }) => theme.colors.primary}; color: ${({ $active, theme }) => $active ? '#fff' : theme.colors.primary}; }
`

const ReportList = styled.div` display: flex; flex-direction: column; gap: 10px; `
const ReportCard = styled(Link)`
  display: block;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 18px 20px;
  transition: all 0.15s;
  &:hover { border-color: #c4c4c4; box-shadow: ${({ theme }) => theme.shadows.md}; transform: translateY(-1px); }
`
const RHeader = styled.div` display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; `
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

const Pagination = styled.div` display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 20px; `
const PageBtn = styled.button<{ $active?: boolean }>`
  min-width: 34px; height: 34px; padding: 0 8px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.border};
  background: ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.white};
  color: ${({ theme, $active }) => $active ? '#fff' : theme.colors.text};
  font-size: 0.875rem; cursor: pointer; transition: all 0.15s;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`

const FilterRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 14px;
`

const PeriodTab = styled.button<{ $active: boolean }>`
  padding: 4px 11px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.primary + '80' : theme.colors.border};
  background: ${({ $active, theme }) => $active ? theme.colors.primary + '12' : 'transparent'};
  color: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.muted};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
  transition: all 0.15s;
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary + '80'};
    color: ${({ theme }) => theme.colors.primary};
  }
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

// ── Propostas ─────────────────────────────────────────────────────────────────

const MainTabs = styled.div` display: flex; gap: 6px; margin-bottom: 20px; `
const MainTab = styled.button<{ $active: boolean }>`
  padding: 7px 18px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.border};
  background: ${({ $active, theme }) => $active ? theme.colors.primary : 'transparent'};
  color: ${({ $active, theme }) => $active ? '#fff' : theme.colors.muted};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  transition: all 0.15s;
  &:hover { border-color: ${({ theme }) => theme.colors.primary}; color: ${({ $active, theme }) => $active ? '#fff' : theme.colors.primary}; }
`

const PropostaCard = styled(Link)`
  display: block;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 18px 20px;
  transition: all 0.15s;
  &:hover { border-color: #c4c4c4; box-shadow: ${({ theme }) => theme.shadows.md}; transform: translateY(-1px); }
`

const PCardBadges = styled.div` display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; `
const PCardTitle = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 10px;
`
const PCardFooter = styled.div` display: flex; gap: 12px; align-items: center; `
const PCardStat = styled.span` font-size: 0.8125rem; color: ${({ theme }) => theme.colors.muted}; font-family: ${({ theme }) => theme.fonts.mono}; `
const PCardDate = styled.span` font-size: 0.8125rem; color: ${({ theme }) => theme.colors.muted}; margin-left: auto; `

const PROPOSTA_STATUS_TABS = [
  { label: 'Todas', value: '' },
  { label: 'Rascunhos', value: 'DRAFT' },
  { label: 'Apresentadas', value: 'PRESENTED' },
  { label: 'Em votação', value: 'IN_VOTE' },
  { label: 'Aprovadas', value: 'APPROVED' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function mandateProgress(start: string, end: string) {
  const now = Date.now()
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (now <= s) return 0
  if (now >= e) return 100
  return Math.round(((now - s) / (e - s)) * 100)
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
]

// ── Componente ───────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: 'Todos', days: 0 },
  { label: '30 dias', days: 30 },
  { label: '3 meses', days: 90 },
  { label: '6 meses', days: 180 },
  { label: '1 ano', days: 365 },
]

function periodToFrom(days: number): string | undefined {
  if (!days) return undefined
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

export function PoliticianProfile() {
  const { id } = useParams<{ id: string }>()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [periodDays, setPeriodDays] = useState(0)
  const [activeTab, setActiveTab] = useState<'relatos' | 'propostas'>('relatos')
  const [propostaPage, setPropostaPage] = useState(1)
  const [propostaStatusFilter, setPropostaStatusFilter] = useState('')
  const { user: currentUser, activeContext } = useAuthStore()
  const { data: politician, isLoading } = usePolitician(id!)
  const { data: reports, isLoading: loadingReports } = usePoliticianReports(
    id!, page, statusFilter || undefined, periodToFrom(periodDays),
  )
  const { data: propostas, isLoading: loadingPropostas } = usePoliticianPropostas(
    id!,
    propostaPage,
    propostaStatusFilter || undefined,
  )

  const canEdit = !!activeContext && activeContext.type === 'POLITICIAN' && activeContext.id === id

  const m = politician?.mandatometer
  const resolutionPct = m && m.total > 0 ? Math.round((m.resolved / m.total) * 100) : 0
  const ignoredPct = m && m.total > 0 ? Math.round((m.ignored / m.total) * 100) : 0
  const termPct = politician ? mandateProgress(politician.termStart, politician.termEnd) : 0

  const topCategories: CategoryStat[] = m?.byCategory?.slice(0, 5) ?? []
  const maxCatCount = topCategories[0]?.count ?? 1

  function handleTabChange(value: string) {
    setStatusFilter(value)
    setPage(1)
  }

  function handlePeriodChange(days: number) {
    setPeriodDays(days)
    setPage(1)
  }

  function handlePropostaTabChange(value: string) {
    setPropostaStatusFilter(value)
    setPropostaPage(1)
  }

  return (
    <Page>
      <Navbar />
      <Content>
        <BackLink to="/">← Início</BackLink>

        {/* Header */}
        {isLoading ? (
          <HeaderCard>
            <div style={{ display: 'flex', gap: 18, marginBottom: 20 }}>
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
              <AvatarLink to={`/politico/${politician.id}`} $src={politician.avatarUrl ?? null}>
                {!politician.avatarUrl && politician.name.charAt(0)}
              </AvatarLink>
              <Info>
                <Name>{politician.name}</Name>
                <MetaRow>
                  <Tag $variant="office">{politician.office}</Tag>
                  <Tag $variant="party">{politician.party.abbreviation}</Tag>
                  <Tag $variant="number">Nº {politician.party.number}</Tag>
                  {politician.verified && <Tag $variant="verified">✓ Verificado</Tag>}
                  {politician.metrics && (
                    <TrustBadge
                      classification={politician.metrics.classification}
                      trustBadge={politician.metrics.trustBadge}
                    />
                  )}
                </MetaRow>
                <MetaRow>
                  <Location>
                    📍 {politician.electoralZone} — {[politician.city, politician.state].filter(Boolean).join(', ')}
                  </Location>
                  {politician.website && (
                    <a
                      href={politician.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.8125rem', color: '#6B7280' }}
                    >
                      {politician.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </MetaRow>
                <Term>
                  Mandato: {formatDate(politician.termStart)} → {formatDate(politician.termEnd)}
                </Term>
                <CtaRow>
                  <ReportCta to={`/novo?recipientType=POLITICIAN&recipientId=${politician.id}&recipientName=${encodeURIComponent(politician.name)}`}>
                    + Criar relato
                  </ReportCta>
                  {canEdit && (
                    <Button
                      as={Link as any}
                      to={`/politico/${politician.id}/editar`}
                      variant="outline"
                      size="sm"
                    >
                      Editar perfil
                    </Button>
                  )}
                  {canEdit && (
                    <ReportCta
                      to="/proposta/nova"
                      style={{ background: '#2DC653' }}
                    >
                      + Nova proposta
                    </ReportCta>
                  )}
                  {!politician.verified && currentUser && !canEdit && (
                    <ReportCta
                      to={`/reivindicar/politico/${politician.id}`}
                      style={{ background: 'transparent', color: '#1A1A2E', border: '1.5px solid #1A1A2E' }}
                    >
                      Reivindicar perfil
                    </ReportCta>
                  )}
                </CtaRow>
              </Info>
            </HeaderTop>

            {/* Mandate progress */}
            <MandateProgress>
              <ProgressLabel>
                <span>Progresso do mandato</span>
                <span>{termPct}% cumprido</span>
              </ProgressLabel>
              <ProgressTrack $pct={termPct} />
            </MandateProgress>

            {/* Mandatômetro */}
            <MGrid>
              <MCard $color="#6B7280">
                <MValue $color="#6B7280">{m?.total ?? 0}</MValue>
                <MLabel>Total</MLabel>
              </MCard>
              <MCard $color="#2DC653">
                <MValue $color="#2DC653">{m?.resolved ?? 0}</MValue>
                <MLabel>Resolvidos</MLabel>
                <MBar $pct={resolutionPct} $color="#2DC653" />
              </MCard>
              <MCard $color="#3B82F6">
                <MValue $color="#3B82F6">{m?.inProgress ?? 0}</MValue>
                <MLabel>Em andamento</MLabel>
              </MCard>
              <MCard $color="#E63946">
                <MValue $color="#E63946">{m?.ignored ?? 0}</MValue>
                <MLabel>Sem resposta</MLabel>
                <MBar $pct={ignoredPct} $color="#E63946" />
              </MCard>
            </MGrid>

            {politician.metrics && <MetricsBar metrics={politician.metrics} />}
          </HeaderCard>
        ) : (
          <Empty>Político não encontrado.</Empty>
        )}

        {politician && (
          <TwoCol>
            {/* Main */}
            <MainCol>
              {currentUser && canEdit && (
                <TeamPanel orgType="POLITICIAN" orgId={politician.id} currentUserId={currentUser.id} />
              )}

              <div style={{ marginTop: currentUser ? 20 : 0 }}>
                {/* Abas principais: Relatos / Propostas */}
                <MainTabs>
                  <MainTab $active={activeTab === 'relatos'} onClick={() => setActiveTab('relatos')}>
                    Relatos
                  </MainTab>
                  <MainTab $active={activeTab === 'propostas'} onClick={() => setActiveTab('propostas')}>
                    Propostas
                  </MainTab>
                </MainTabs>

                {/* ── Aba Relatos ── */}
                {activeTab === 'relatos' && (
                  <>
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

                    <FilterRow>
                      {PERIOD_OPTIONS.map((p) => (
                        <PeriodTab
                          key={p.days}
                          $active={periodDays === p.days}
                          onClick={() => handlePeriodChange(p.days)}
                        >
                          {p.label}
                        </PeriodTab>
                      ))}
                    </FilterRow>

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
                          : 'Nenhum relato direcionado a este político ainda.'}
                      </Empty>
                    )}
                  </>
                )}

                {/* ── Aba Propostas ── */}
                {activeTab === 'propostas' && (
                  <>
                    <SectionHeader>
                      <SectionTitle>Propostas</SectionTitle>
                      <StatusTabs>
                        {PROPOSTA_STATUS_TABS.map((t) => (
                          <StatusTab
                            key={t.value}
                            $active={propostaStatusFilter === t.value}
                            onClick={() => handlePropostaTabChange(t.value)}
                          >
                            {t.label}
                          </StatusTab>
                        ))}
                      </StatusTabs>
                    </SectionHeader>

                    {loadingPropostas ? (
                      <ReportList>
                        {[1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 110 }} />)}
                      </ReportList>
                    ) : propostas && propostas.data.length > 0 ? (
                      <>
                        <ReportList>
                          {propostas.data.map((p: PublicProposta) => (
                            <PropostaCard key={p.id} to={`/propostas/${p.id}`}>
                              <PCardBadges>
                                <PropostaStatusBadge status={p.status} />
                              </PCardBadges>
                              <PCardTitle>{p.titulo}</PCardTitle>
                              <PCardFooter>
                                <PCardStat>▲ {p.totalApoios}</PCardStat>
                                <Dot>·</Dot>
                                <PCardStat>▼ {p.totalRejeicoes}</PCardStat>
                                <PCardDate>{timeAgo(p.createdAt)}</PCardDate>
                              </PCardFooter>
                            </PropostaCard>
                          ))}
                        </ReportList>
                        {propostas.meta.totalPages > 1 && (
                          <Pagination>
                            <PageBtn disabled={propostaPage === 1} onClick={() => setPropostaPage(p => p - 1)}>←</PageBtn>
                            {Array.from({ length: propostas.meta.totalPages }, (_, i) => i + 1).map((p) => (
                              <PageBtn key={p} $active={p === propostaPage} onClick={() => setPropostaPage(p)}>{p}</PageBtn>
                            ))}
                            <PageBtn disabled={propostaPage === propostas.meta.totalPages} onClick={() => setPropostaPage(p => p + 1)}>→</PageBtn>
                          </Pagination>
                        )}
                      </>
                    ) : (
                      <Empty>
                        {propostaStatusFilter
                          ? 'Nenhuma proposta com este status.'
                          : 'Nenhuma proposta publicada ainda.'}
                      </Empty>
                    )}
                  </>
                )}
              </div>
            </MainCol>

            {/* Sidebar */}
            <SideCol>
              {/* Partido */}
              <SideCard>
                <SideTitle>Partido</SideTitle>
                <PartyCard>
                  <PartyLogo $src={politician.party.logoUrl} />
                  <PartyInfo>
                    <PartyAbbr>{politician.party.abbreviation}</PartyAbbr>
                    <PartyName>{politician.party.name}</PartyName>
                    <PartyNumber>Número eleitoral: {politician.party.number}</PartyNumber>
                  </PartyInfo>
                </PartyCard>
              </SideCard>

              {/* Volume mensal */}
              {politician.monthlyVolume && politician.monthlyVolume.length > 0 && (
                <SideCard>
                  <SideTitle>Volume mensal</SideTitle>
                  <VolumeChart data={politician.monthlyVolume} />
                </SideCard>
              )}

              {/* Categorias mais reclamadas */}
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
            </SideCol>
          </TwoCol>
        )}
      </Content>
    </Page>
  )
}

