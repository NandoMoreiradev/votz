import { useState } from 'react'
import styled, { keyframes } from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import {
  useResumo,
  useTendencias,
  useRelatosDestaque,
  useEntidadesRanking,
  useSurtosAtivos,
  downloadCsv,
  type CategoryTrend,
  type RelatoDestaque,
  type EntidadeRanking,
  type SurtoAtivo,
} from '../hooks/useImprensa'
import { Category, ReportStatus, UserType } from '@votz/shared-types'
import { useAuthStore } from '../store/auth.store'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CAT_LABELS: Record<Category, string> = {
  HEALTH: 'Saúde', MOBILITY: 'Mobilidade', SAFETY: 'Segurança',
  EDUCATION: 'Educação', SANITATION: 'Saneamento', HOUSING: 'Habitação',
  ENVIRONMENT: 'Meio Ambiente', INFRASTRUCTURE: 'Infraestrutura',
  URBAN_SERVICES: 'Serviços Urbanos', CORRUPTION: 'Corrupção',
  ACCESSIBILITY: 'Acessibilidade', SOCIAL_WELFARE: 'Assistência Social',
  OTHER: 'Outra',
}

const STATUS_LABELS: Partial<Record<ReportStatus, string>> = {
  OPEN: 'Aberto', UNDER_REVIEW: 'Em análise', IN_PROGRESS: 'Em andamento',
  RESOLVED: 'Resolvido', DISPUTED: 'Contestado', ARCHIVED: 'Arquivado',
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d === 0) return 'hoje'
  if (d === 1) return 'há 1 dia'
  return `há ${d} dias`
}

// ─── Animations ───────────────────────────────────────────────────────────────
const pulse = keyframes`0%,100%{opacity:1}50%{opacity:.45}`

// ─── Styled ───────────────────────────────────────────────────────────────────
const Page = styled.div`min-height:100vh;background:#FAFAF7;`
const Content = styled.div`
  max-width:1100px;margin:0 auto;padding:32px 32px 72px;
  @media(max-width:640px){padding:16px 16px 48px;}
`
const PageHeader = styled.div`margin-bottom:32px;`
const PageTitle = styled.h1`
  font-family:${({ theme }) => theme.fonts.heading};
  font-size:clamp(22px,4vw,32px);font-weight:700;letter-spacing:-0.03em;
  color:#0D0D0D;margin-bottom:8px;
`
const PageSub = styled.p`font-size:14px;color:#6B6B7A;line-height:1.5;max-width:520px;`
const Tag = styled.span`
  display:inline-block;font-family:${({ theme }) => theme.fonts.mono};
  font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;
  background:#0D0D0D;color:#fff;padding:4px 8px;border-radius:4px;
  margin-bottom:12px;
`

// ── Stat cards ────────────────────────────────────────────────────────────────
const StatGrid = styled.div`
  display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));
  gap:12px;margin-bottom:40px;
`
const StatCard = styled.div`
  background:#fff;border:1px solid #E5E5E0;border-radius:10px;
  padding:18px 20px;
`
const StatNum = styled.div`
  font-family:${({ theme }) => theme.fonts.heading};
  font-size:28px;font-weight:700;letter-spacing:-0.03em;color:#0D0D0D;line-height:1;
  margin-bottom:4px;
`
const StatLabel = styled.div`
  font-family:${({ theme }) => theme.fonts.mono};
  font-size:10px;color:#9494A0;text-transform:uppercase;letter-spacing:0.05em;
`

// ── Section ───────────────────────────────────────────────────────────────────
const Section = styled.section`margin-bottom:40px;`
const SectionTitle = styled.h2`
  font-family:${({ theme }) => theme.fonts.heading};
  font-size:15px;font-weight:700;letter-spacing:-0.01em;color:#0D0D0D;
  margin-bottom:16px;display:flex;align-items:center;gap:8px;
  .ct{font-family:${({ theme }) => theme.fonts.mono};font-size:12px;color:#6B6B7A;font-weight:400;}
`

// ── Tendências ────────────────────────────────────────────────────────────────
const TendGrid = styled.div`
  display:grid;grid-template-columns:1fr 1fr;gap:16px;
  @media(max-width:640px){grid-template-columns:1fr;}
`
const TendPanel = styled.div`
  background:#fff;border:1px solid #E5E5E0;border-radius:10px;padding:20px 24px;
`
const TendPanelTitle = styled.div`
  font-family:${({ theme }) => theme.fonts.mono};font-size:11px;
  color:#6B6B7A;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:16px;
`
const BarRow = styled.div`display:flex;flex-direction:column;gap:10px;`
const BarItem = styled.div`display:flex;flex-direction:column;gap:4px;`
const BarLabel = styled.div`
  display:flex;justify-content:space-between;align-items:center;
  font-size:13px;color:#0D0D0D;
`
const BarPct = styled.span`
  font-family:${({ theme }) => theme.fonts.mono};font-size:11px;color:#6B6B7A;
`
const BarTrack = styled.div`height:4px;background:#F0F0EC;border-radius:2px;overflow:hidden;`
const BarFill = styled.div<{ $pct: string }>`
  height:100%;width:${({ $pct }) => $pct}%;
  background:#0D0D0D;border-radius:2px;
  transition:width 0.4s ease;
`
const CityRow = styled.div`
  display:flex;justify-content:space-between;align-items:center;
  padding:6px 0;border-bottom:1px solid #F0F0EC;
  &:last-child{border-bottom:none;}
  font-size:13px;color:#0D0D0D;
`
const CityCount = styled.span`
  font-family:${({ theme }) => theme.fonts.mono};font-size:11px;
  background:#F4F4F0;padding:2px 6px;border-radius:3px;color:#6B6B7A;
`
const CityUF = styled.span`color:#6B6B7A;font-size:12px;margin-left:4px;`

// ── Relatos destaque ──────────────────────────────────────────────────────────
const ReportList = styled.div`display:flex;flex-direction:column;gap:8px;`
const ReportCard = styled.article<{ $clickable?: boolean }>`
  background:#fff;border:1px solid #E5E5E0;border-radius:10px;
  padding:16px 20px;cursor:${({ $clickable }) => ($clickable ? 'pointer' : 'default')};
  transition:border-color 0.15s,box-shadow 0.15s;
  &:hover{border-color:${({ $clickable }) => ($clickable ? '#0D0D0D' : '#E5E5E0')};
    box-shadow:${({ $clickable }) => ($clickable ? '0 2px 8px rgba(0,0,0,.04)' : 'none')};}
`
const ReportTitle = styled.h3`
  font-family:${({ theme }) => theme.fonts.heading};font-size:14px;font-weight:600;
  color:#0D0D0D;margin-bottom:4px;line-height:1.3;
`
const ReportDesc = styled.p`
  font-size:12.5px;color:#6B6B7A;line-height:1.5;margin-bottom:8px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
`
const ReportMeta = styled.div`
  display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  font-family:${({ theme }) => theme.fonts.mono};font-size:11px;color:#9494A0;
`
const Dot = styled.span`width:3px;height:3px;border-radius:50%;background:#C4C4CC;`
const PressureBadge = styled.span`
  background:#0D0D0D;color:#fff;padding:2px 7px;border-radius:4px;
  font-size:10px;font-weight:700;margin-left:auto;
`
const StatusBadge = styled.span<{ $resolved?: boolean }>`
  padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;
  background:${({ $resolved }) => ($resolved ? '#DCFCE7' : '#F0F0EC')};
  color:${({ $resolved }) => ($resolved ? '#14532D' : '#6B6B7A')};
`

// ── Entidades ranking ─────────────────────────────────────────────────────────
const Table = styled.div`
  background:#fff;border:1px solid #E5E5E0;border-radius:10px;overflow:hidden;
`
const TableRow = styled.div`
  display:grid;grid-template-columns:2fr 1fr 80px 70px;
  align-items:center;gap:12px;padding:12px 20px;
  border-bottom:1px solid #F0F0EC;
  &:last-child{border-bottom:none;}
  &:first-child{background:#FAFAF7;}
  @media(max-width:640px){grid-template-columns:1fr 60px;}
`
const TableHead = styled(TableRow)`
  font-family:${({ theme }) => theme.fonts.mono};font-size:10px;
  color:#9494A0;text-transform:uppercase;letter-spacing:0.05em;
`
const EntityName = styled.div`
  font-size:13px;font-weight:600;color:#0D0D0D;
  display:flex;align-items:center;gap:8px;
`
const VerifiedDot = styled.span`
  width:7px;height:7px;border-radius:50%;background:#2DC653;flex-shrink:0;
`
const EntitySub = styled.div`
  font-family:${({ theme }) => theme.fonts.mono};font-size:10px;color:#9494A0;
  margin-top:2px;
`
const ScoreNum = styled.div<{ $high?: boolean }>`
  font-family:${({ theme }) => theme.fonts.heading};font-size:16px;font-weight:700;
  color:${({ $high }) => ($high ? '#2DC653' : '#E63946')};
`

// ── Surtos ────────────────────────────────────────────────────────────────────
const SurtoGrid = styled.div`
  display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;
`
const SurtoCard = styled(Link)`
  background:#0D0D0D;color:#fff;border-radius:10px;padding:18px 20px;
  display:block;text-decoration:none;
  transition:opacity 0.15s;
  &:hover{opacity:0.88;}
`
const SurtoTag = styled.div`
  font-family:${({ theme }) => theme.fonts.mono};font-size:10px;
  color:#E63946;text-transform:uppercase;letter-spacing:0.06em;
  margin-bottom:10px;display:flex;align-items:center;gap:5px;
`
const SurtoTitle = styled.div`
  font-family:${({ theme }) => theme.fonts.heading};font-size:15px;
  font-weight:700;letter-spacing:-0.01em;margin-bottom:4px;
`
const SurtoSub = styled.div`
  font-family:${({ theme }) => theme.fonts.mono};font-size:10px;
  color:rgba(255,255,255,.45);
`
const SurtoCount = styled.div`
  margin-top:14px;font-family:${({ theme }) => theme.fonts.heading};
  font-size:24px;font-weight:700;line-height:1;
`

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Skel = styled.div<{ $h?: number; $w?: string }>`
  height:${({ $h }) => $h ?? 40}px;width:${({ $w }) => $w ?? '100%'};
  border-radius:6px;background:#E5E5E0;animation:${pulse} 1.5s ease-in-out infinite;
`
const Empty = styled.div`
  text-align:center;padding:32px 24px;color:#6B6B7A;font-size:14px;
  background:#fff;border:1px solid #E5E5E0;border-radius:10px;
`

// ── PRESS panel ───────────────────────────────────────────────────────────────
const PressPanel = styled.div`
  background:#0D0D0D;border-radius:12px;padding:24px 28px;margin-bottom:40px;
  @media(max-width:640px){padding:18px 16px;}
`
const PressPanelTitle = styled.div`
  font-family:${({ theme }) => theme.fonts.mono};font-size:10px;font-weight:700;
  letter-spacing:0.1em;text-transform:uppercase;color:#E63946;margin-bottom:4px;
`
const PressPanelSub = styled.div`
  font-family:${({ theme }) => theme.fonts.heading};font-size:16px;font-weight:700;
  color:#fff;margin-bottom:18px;
`
const PressControls = styled.div`
  display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;
`
const PressLabel = styled.label`
  display:flex;flex-direction:column;gap:4px;
  font-family:${({ theme }) => theme.fonts.mono};font-size:10px;
  color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:0.06em;
`
const PressSelect = styled.select`
  background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);
  border-radius:6px;padding:8px 12px;font-size:13px;color:#fff;
  font-family:${({ theme }) => theme.fonts.mono};cursor:pointer;min-width:140px;
  &:focus{outline:none;border-color:rgba(255,255,255,.4);}
  option{background:#1A1A2E;color:#fff;}
`
const CsvButton = styled.button<{ $loading?: boolean }>`
  padding:8px 18px;border-radius:6px;border:none;cursor:pointer;
  background:${({ $loading }) => ($loading ? 'rgba(230,57,70,.6)' : '#E63946')};
  color:#fff;font-family:${({ theme }) => theme.fonts.heading};
  font-size:13px;font-weight:700;letter-spacing:-0.01em;
  transition:opacity 0.15s;align-self:flex-end;
  &:hover{opacity:0.88;}
  &:disabled{cursor:not-allowed;}
`
const AlertBadge = styled.div`
  display:flex;align-items:center;gap:6px;margin-top:14px;
  font-family:${({ theme }) => theme.fonts.mono};font-size:11px;
  color:rgba(255,255,255,.5);
`
const AlertDot = styled.span`
  width:7px;height:7px;border-radius:50%;background:#2DC653;
  box-shadow:0 0 0 3px rgba(45,198,83,.2);flex-shrink:0;
`

const UF_OPTIONS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

// ─── Sub-components ───────────────────────────────────────────────────────────

const DAYS_OPTIONS = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
  { value: 365, label: '1 ano' },
]

function PressSection({
  days,
  onDaysChange,
}: {
  days: number
  onDaysChange: (d: number) => void
}) {
  const [state, setState] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleDownload() {
    setLoading(true)
    setError('')
    try {
      await downloadCsv(days, state || undefined, category || undefined)
    } catch {
      setError('Falha ao gerar o CSV. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PressPanel>
      <PressPanelTitle>Acesso PRESS</PressPanelTitle>
      <PressPanelSub>Exportar dados para jornalismo</PressPanelSub>
      <PressControls>
        <PressLabel>
          Período
          <PressSelect value={days} onChange={(e) => onDaysChange(Number(e.target.value))}>
            {DAYS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </PressSelect>
        </PressLabel>
        <PressLabel>
          Estado
          <PressSelect value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Todos os estados</option>
            {UF_OPTIONS.map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </PressSelect>
        </PressLabel>
        <PressLabel>
          Categoria
          <PressSelect value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas as categorias</option>
            {Object.entries(CAT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </PressSelect>
        </PressLabel>
        <CsvButton onClick={handleDownload} disabled={loading} $loading={loading}>
          {loading ? 'Gerando…' : 'Baixar CSV'}
        </CsvButton>
      </PressControls>
      {error && (
        <div style={{ marginTop: 10, fontFamily: 'monospace', fontSize: 12, color: '#E63946' }}>
          {error}
        </div>
      )}
      <AlertBadge>
        <AlertDot />
        Alertas de surto ativados automaticamente para sua conta
      </AlertBadge>
    </PressPanel>
  )
}

function CategoryBar({ item }: { item: CategoryTrend }) {
  return (
    <BarItem>
      <BarLabel>
        <span>{CAT_LABELS[item.category] ?? item.category}</span>
        <BarPct>{item.pct}% · {item.count}</BarPct>
      </BarLabel>
      <BarTrack>
        <BarFill $pct={item.pct} />
      </BarTrack>
    </BarItem>
  )
}

function ReportRow({ report }: { report: RelatoDestaque }) {
  const navigate = useNavigate()
  return (
    <ReportCard $clickable onClick={() => navigate(`/relatos/${report.id}`)}>
      <ReportTitle>{report.title}</ReportTitle>
      <ReportDesc>{report.description}</ReportDesc>
      <ReportMeta>
        <StatusBadge $resolved={report.status === ReportStatus.RESOLVED}>
          {STATUS_LABELS[report.status] ?? report.status}
        </StatusBadge>
        <Dot />
        <span>{CAT_LABELS[report.category] ?? report.category}</span>
        {report.city && (
          <>
            <Dot />
            <span>{report.city}{report.state ? ` · ${report.state}` : ''}</span>
          </>
        )}
        <Dot />
        <span>{report._count.votes} apoios · {report._count.comments} comentários</span>
        <PressureBadge>P {report.pressureScore.toFixed(1)}</PressureBadge>
      </ReportMeta>
    </ReportCard>
  )
}

function EntityRow({ entity, rank }: { entity: EntidadeRanking; rank: number }) {
  return (
    <TableRow>
      <EntityName>
        <span style={{ fontFamily: 'monospace', color: '#9494A0', fontSize: 11 }}>#{rank}</span>
        {entity.verified && <VerifiedDot title="Verificada" />}
        <div>
          {entity.legalName}
          <EntitySub>{entity.type}{entity.city ? ` · ${entity.city}/${entity.state}` : ''}</EntitySub>
        </div>
      </EntityName>
      <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#6B6B7A' }}>
        {entity.reportCount} relatos
      </div>
      <ScoreNum $high={entity.votzScore >= 70}>{entity.votzScore.toFixed(0)}</ScoreNum>
      <span style={{ fontSize: 11, color: '#6B6B7A', fontFamily: 'monospace' }}>
        Votz Score
      </span>
    </TableRow>
  )
}

function SurtoCard_({ surto }: { surto: SurtoAtivo }) {
  return (
    <SurtoCard to={`/surtos/${surto.id}`}>
      <SurtoTag>⚡ Surto ativo</SurtoTag>
      <SurtoTitle>{CAT_LABELS[surto.category] ?? surto.category}</SurtoTitle>
      <SurtoSub>{surto.city}{surto.state ? ` · ${surto.state}` : ''}</SurtoSub>
      <SurtoSub style={{ marginTop: 4 }}>detectado {timeAgo(surto.detectedAt)}</SurtoSub>
      <SurtoCount>{surto.count}</SurtoCount>
      <SurtoSub>relatos nas últimas 24h</SurtoSub>
    </SurtoCard>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function Imprensa() {
  const user = useAuthStore((s) => s.user)
  const isPress = user?.type === UserType.PRESS && user?.verified

  const [days, setDays] = useState(30)

  const { data: resumo, isLoading: loadResumo } = useResumo()
  const { data: tend, isLoading: loadTend } = useTendencias(days)
  const { data: destaque, isLoading: loadDestaque } = useRelatosDestaque(20)
  const { data: entidades, isLoading: loadEntidades } = useEntidadesRanking(15)
  const { data: surtos, isLoading: loadSurtos } = useSurtosAtivos()

  return (
    <Page>
      <Navbar />
      <Content>
        <PageHeader>
          <Tag>Sala de Imprensa</Tag>
          <PageTitle>Dados abertos do Votz</PageTitle>
          <PageSub>
            Estatísticas públicas e em tempo real sobre relatos cidadãos, entidades e surtos ativos.
            Uso livre para fins jornalísticos — cite como fonte: <b>votz.com.br/imprensa</b>.
          </PageSub>
        </PageHeader>

        {isPress && <PressSection days={days} onDaysChange={setDays} />}

        {/* ── Resumo ── */}
        <Section>
          <SectionTitle>
            Visão geral
            {resumo && (
              <span className="ct">
                atualizado {new Date(resumo.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </SectionTitle>
          {loadResumo ? (
            <StatGrid>
              {Array.from({ length: 6 }).map((_, i) => <Skel key={i} $h={80} />)}
            </StatGrid>
          ) : resumo ? (
            <StatGrid>
              <StatCard>
                <StatNum>{fmt(resumo.totalReports)}</StatNum>
                <StatLabel>Total de relatos</StatLabel>
              </StatCard>
              <StatCard>
                <StatNum>{fmt(resumo.reportsLast30)}</StatNum>
                <StatLabel>Últimos 30 dias</StatLabel>
              </StatCard>
              <StatCard>
                <StatNum>{fmt(resumo.totalVotes)}</StatNum>
                <StatLabel>Total de apoios</StatLabel>
              </StatCard>
              <StatCard>
                <StatNum>{resumo.resolvedRate}%</StatNum>
                <StatLabel>Taxa de resolução</StatLabel>
              </StatCard>
              <StatCard>
                <StatNum>{resumo.responseRate}%</StatNum>
                <StatLabel>Taxa de resposta</StatLabel>
              </StatCard>
              <StatCard>
                <StatNum style={{ color: resumo.activeSurtos > 0 ? '#E63946' : '#0D0D0D' }}>
                  {resumo.activeSurtos}
                </StatNum>
                <StatLabel>Surtos ativos</StatLabel>
              </StatCard>
            </StatGrid>
          ) : null}
        </Section>

        {/* ── Surtos ── */}
        <Section>
          <SectionTitle>
            Surtos ativos
            {surtos && <span className="ct">{surtos.length} detectados</span>}
          </SectionTitle>
          {loadSurtos ? (
            <SurtoGrid>
              {Array.from({ length: 3 }).map((_, i) => <Skel key={i} $h={140} />)}
            </SurtoGrid>
          ) : surtos?.length === 0 ? (
            <Empty>Nenhum surto ativo no momento.</Empty>
          ) : (
            <SurtoGrid>
              {surtos?.map((s) => <SurtoCard_ key={s.id} surto={s} />)}
            </SurtoGrid>
          )}
        </Section>

        {/* ── Tendências ── */}
        <Section>
          <SectionTitle>Tendências — últimos {days} dias</SectionTitle>
          {loadTend ? (
            <TendGrid>
              <Skel $h={280} />
              <Skel $h={280} />
            </TendGrid>
          ) : tend ? (
            <TendGrid>
              <TendPanel>
                <TendPanelTitle>Por categoria</TendPanelTitle>
                <BarRow>
                  {tend.byCategory.map((c) => (
                    <CategoryBar key={c.category} item={c} />
                  ))}
                </BarRow>
              </TendPanel>
              <TendPanel>
                <TendPanelTitle>Top cidades</TendPanelTitle>
                {tend.topCidades.map((c, i) => (
                  <CityRow key={i}>
                    <span>
                      {c.city ?? '—'}
                      {c.state && <CityUF>{c.state}</CityUF>}
                    </span>
                    <CityCount>{c.count}</CityCount>
                  </CityRow>
                ))}
              </TendPanel>
            </TendGrid>
          ) : null}
        </Section>

        {/* ── Relatos em destaque ── */}
        <Section>
          <SectionTitle>
            Relatos em destaque
            <span className="ct">por pressão</span>
          </SectionTitle>
          {loadDestaque ? (
            <ReportList>
              {Array.from({ length: 5 }).map((_, i) => <Skel key={i} $h={90} />)}
            </ReportList>
          ) : destaque?.length === 0 ? (
            <Empty>Nenhum relato público no momento.</Empty>
          ) : (
            <ReportList>
              {destaque?.map((r) => <ReportRow key={r.id} report={r} />)}
            </ReportList>
          )}
        </Section>

        {/* ── Entidades ranking ── */}
        <Section>
          <SectionTitle>
            Ranking de entidades
            <span className="ct">últimos 90 dias</span>
          </SectionTitle>
          {loadEntidades ? (
            <Skel $h={300} />
          ) : entidades?.length === 0 ? (
            <Empty>Nenhum dado de entidades disponível.</Empty>
          ) : (
            <Table>
              <TableHead>
                <div>Entidade</div>
                <div>Volume</div>
                <div>Score</div>
                <div />
              </TableHead>
              {entidades?.map((e, i) => (
                <EntityRow key={e.id} entity={e} rank={i + 1} />
              ))}
            </Table>
          )}
        </Section>
      </Content>
    </Page>
  )
}
