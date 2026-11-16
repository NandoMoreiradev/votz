import { Category, DEFAULT_SLA_HOURS_BY_CATEGORY } from '@votz/shared-types'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import { MetricInfoModal } from '../components/analytics/MetricInfoModal'
import { PlanLockedPreview } from '../components/analytics/PlanLockedPreview'
import { Navbar } from '../components/layout/Navbar'
import { CATEGORY_CONFIG } from '../components/ui/Badge'
import { extractPlanRequired } from '../hooks/useAnalytics'
import { useAccountabilityReports, useCreateAccountabilityReport } from '../hooks/useMandate'
import {
  SlaQueueItem,
  SlaQueueSortBy,
  SlaStateValue,
  SlaUrgencyFilter,
  useAssignReport,
  useSlaMembers,
  useSlaPerformance,
  useSlaPolicy,
  useSlaQueue,
  useSlaWorkload,
  useUpdateSlaPolicy,
} from '../hooks/useSla'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'

type TabKey = 'queue' | 'workload' | 'performance' | 'config' | 'reports'

const ALL_CATEGORIES = Object.values(Category)

const Page = styled.main`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
  padding-bottom: ${({ theme }) => theme.spacing[8]};
`

const Container = styled.div`
  max-width: 1180px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing[6]} ${({ theme }) => theme.spacing[4]};
`

const Header = styled.header`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: ${({ theme }) => theme.spacing[3]};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['3xl']};
  color: ${({ theme }) => theme.colors.primary};
`

const Subtitle = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  margin-top: ${({ theme }) => theme.spacing[1]};
`

const TabsRow = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing[2]};
  margin-bottom: ${({ theme }) => theme.spacing[5]};
`

const TabBtn = styled.button<{ $active: boolean }>`
  padding: ${({ theme }) => theme.spacing[2]} ${({ theme }) => theme.spacing[4]};
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.white)};
  color: ${({ theme, $active }) => ($active ? theme.colors.white : theme.colors.text)};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
`

const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
  gap: ${({ theme }) => theme.spacing[3]};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`

const KpiCard = styled.button<{ $active?: boolean; $tone?: string }>`
  text-align: left;
  background: ${({ theme }) => theme.colors.white};
  border: 1.5px solid
    ${({ $active, $tone, theme }) => ($active ? $tone ?? theme.colors.primary : theme.colors.border)};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing[4]};
  cursor: pointer;
`

const KpiLabel = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
`

const KpiValue = styled.div<{ $color?: string }>`
  margin-top: 6px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ $color, theme }) => $color ?? theme.colors.primary};
`

const Card = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing[5]};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`

const FiltersRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing[2]};
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`

const PillBtn = styled.button<{ $active?: boolean }>`
  padding: 6px 12px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.white)};
  color: ${({ theme, $active }) => ($active ? theme.colors.white : theme.colors.text)};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
`

const Input = styled.input`
  padding: 7px 10px;
  border-radius: ${({ theme }) => theme.radii.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  background: ${({ theme }) => theme.colors.white};
`

const Select = styled.select`
  padding: 7px 10px;
  border-radius: ${({ theme }) => theme.radii.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  background: ${({ theme }) => theme.colors.white};
`

const PrimaryBtn = styled.button`
  padding: 8px 16px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: none;
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const QueueList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing[3]};
`

const QueueRow = styled.article`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing[4]};
  background: ${({ theme }) => theme.colors.white};
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing[3]};
  align-items: center;
`

const SlaPill = styled.span<{ $state: SlaStateValue | null }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  font-weight: 700;
  background: ${({ $state }) =>
    $state === 'BREACHED'
      ? '#FEE2E2'
      : $state === 'AT_RISK'
        ? '#FEF3C7'
        : $state === 'MET'
          ? '#DCFCE7'
          : '#E0F2FE'};
  color: ${({ $state }) =>
    $state === 'BREACHED'
      ? '#991B1B'
      : $state === 'AT_RISK'
        ? '#92400E'
        : $state === 'MET'
          ? '#166534'
          : '#075985'};
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.sm};

  th,
  td {
    padding: 10px 8px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    text-align: left;
  }

  th {
    color: ${({ theme }) => theme.colors.muted};
    font-size: ${({ theme }) => theme.fontSizes.xs};
    text-transform: uppercase;
  }
`

const AlertBanner = styled.div<{ $tone?: 'info' | 'warn' }>`
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[4]};
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ $tone }) => ($tone === 'warn' ? '#FCD34D' : '#BAE6FD')};
  background: ${({ $tone }) => ($tone === 'warn' ? '#FFFBEB' : '#F0F9FF')};
  color: ${({ $tone }) => ($tone === 'warn' ? '#92400E' : '#075985')};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`

function formatSlaLabel(item: SlaQueueItem): string {
  if (item.slaState === 'BREACHED') {
    const overdue = item.hoursRemaining !== null ? Math.abs(item.hoursRemaining).toFixed(1) : '?'
    return `Vencido há ${overdue}h`
  }
  if (item.slaState === 'AT_RISK') {
    return item.hoursRemaining !== null ? `Em risco · resta ${item.hoursRemaining}h` : 'Em risco (75%)'
  }
  if (item.slaDueAt) {
    return item.isDueToday
      ? `Vence hoje · resta ${item.hoursRemaining ?? 0}h`
      : `No prazo · resta ${item.hoursRemaining ?? 0}h`
  }
  return 'Sem prazo definido'
}

function defaultPeriodDates() {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  const fromDate = new Date(now.getTime() - 29 * 86_400_000)
  return { from: fromDate.toISOString().slice(0, 10), to }
}

export function EntidadePrazos() {
  const { user, activeContext } = useAuthStore()
  const [tab, setTab] = useState<TabKey>('queue')

  // Queue filters
  const [urgency, setUrgency] = useState<SlaUrgencyFilter>('ALL')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL')
  const [categoryFilter, setCategoryFilter] = useState<Category | ''>('')
  const [neighborhoodFilter, setNeighborhoodFilter] = useState('')
  const [sortBy, setSortBy] = useState<SlaQueueSortBy>('due_asc')
  const [page, setPage] = useState(1)
  const [assignError, setAssignError] = useState('')

  const isEntityCtx = Boolean(user && activeContext?.type === 'ENTITY')

  const queueQ = useSlaQueue(
    {
      urgency,
      assignee: assigneeFilter,
      category: categoryFilter,
      neighborhood: neighborhoodFilter.trim() || undefined,
      sortBy,
      page,
      limit: 20,
    },
    isEntityCtx && tab === 'queue',
  )
  const membersQ = useSlaMembers(isEntityCtx && (tab === 'queue' || tab === 'workload'))
  const workloadQ = useSlaWorkload(isEntityCtx && tab === 'workload')
  const perfQ = useSlaPerformance({ category: categoryFilter }, isEntityCtx && tab === 'performance')
  const policyQ = useSlaPolicy(isEntityCtx && (tab === 'config' || tab === 'reports'))
  const reportsQ = useAccountabilityReports(isEntityCtx && tab === 'reports')

  const assignMut = useAssignReport()
  const updatePolicyMut = useUpdateSlaPolicy()
  const createReportMut = useCreateAccountabilityReport()

  // Config state
  const [slaHoursForm, setSlaHoursForm] = useState<Record<string, number>>({})
  const [resHoursForm, setResHoursForm] = useState<Record<string, string>>({})
  const [escalationHours, setEscalationHours] = useState<number>(24)
  const [autoMonthly, setAutoMonthly] = useState<boolean>(false)
  const [recalculateOpen, setRecalculateOpen] = useState<boolean>(false)
  const [configNotice, setConfigNotice] = useState<string>('')

  // Monthly PDF generator form
  const defaults = defaultPeriodDates()
  const [pdfFrom, setPdfFrom] = useState(defaults.from)
  const [pdfTo, setPdfTo] = useState(defaults.to)
  const [pdfMsg, setPdfMsg] = useState('')

  useEffect(() => {
    if (!policyQ.data) return
    const mergedFirst: Record<string, number> = {}
    const mergedRes: Record<string, string> = {}
    for (const cat of ALL_CATEGORIES) {
      mergedFirst[cat] =
        policyQ.data.slaHours[cat] ??
        policyQ.data.defaultSlaHoursByCategory[cat] ??
        DEFAULT_SLA_HOURS_BY_CATEGORY[cat]
      const resVal = policyQ.data.resolutionSlaHours[cat]
      mergedRes[cat] = resVal ? String(resVal) : ''
    }
    setSlaHoursForm(mergedFirst)
    setResHoursForm(mergedRes)
    setEscalationHours(policyQ.data.slaEscalationHours)
    setAutoMonthly(policyQ.data.autoMonthlyReportEnabled)
  }, [policyQ.data])

  const planLocked =
    extractPlanRequired(queueQ.error) ||
    extractPlanRequired(policyQ.error) ||
    extractPlanRequired(perfQ.error)

  async function handleAssign(reportId: string, assigneeUserId: string) {
    setAssignError('')
    try {
      await assignMut.mutateAsync({
        reportId,
        assigneeUserId: assigneeUserId || null,
      })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Não foi possível atualizar a atribuição'
      setAssignError(msg)
    }
  }

  async function handleSavePolicy(e: React.FormEvent) {
    e.preventDefault()
    setConfigNotice('')
    const resolutionSlaHours: Record<string, number> = {}
    for (const [k, raw] of Object.entries(resHoursForm)) {
      const n = Number(raw)
      if (raw.trim() && Number.isFinite(n) && n >= 1) {
        resolutionSlaHours[k] = Math.round(n)
      }
    }
    try {
      const res = await updatePolicyMut.mutateAsync({
        slaHours: slaHoursForm,
        resolutionSlaHours,
        slaEscalationHours: escalationHours,
        autoMonthlyReportEnabled: autoMonthly,
        recalculateOpen,
      })
      setRecalculateOpen(false)
      setConfigNotice(
        res.recalculatedOpenCount > 0
          ? `Política salva e ${res.recalculatedOpenCount} relato(s) aberto(s) recalculado(s).`
          : 'Política salva. Novos relatos já seguirão os novos prazos.',
      )
    } catch {
      setConfigNotice('Erro ao salvar política de SLA. Verifique suas permissões.')
    }
  }

  async function handleDownloadPdf(id: string) {
    try {
      const { data } = await api.get<{ url: string }>(`/accountability/reports/${id}/download`)
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch {
      setPdfMsg('PDF ainda em processamento ou link indisponível.')
    }
  }

  if (!user) {
    return (
      <Page>
        <Navbar />
        <Container>
          <Card>
            <Title>Painel de prazos e fila da entidade</Title>
            <Subtitle>Entre na sua conta organizacional para acessar os prazos de SLA e a fila de trabalho.</Subtitle>
            <div style={{ marginTop: 16 }}>
              <Link to="/entrar">Ir para login →</Link>
            </div>
          </Card>
        </Container>
      </Page>
    )
  }

  if (activeContext?.type !== 'ENTITY') {
    return (
      <Page>
        <Navbar />
        <Container>
          <Card>
            <Title>Painel de prazos e fila da entidade</Title>
            <Subtitle>
              Alterne para o contexto de uma organização do tipo <strong>Entidade</strong> no menu superior para gerenciar prazos SLA e fila de atendimento.
            </Subtitle>
          </Card>
        </Container>
      </Page>
    )
  }

  return (
    <Page>
      <Navbar />
      <Container>
        <Header>
          <div>
            <Title>Prazos (SLA) e fila de atendimento</Title>
            <Subtitle>
              Acompanhe vencimentos, distribua relatos para a equipe e monitore o cumprimento de SLA de{' '}
              <strong>{activeContext.name}</strong>.
            </Subtitle>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link to={`/entidade/${activeContext.id}`} style={{ fontSize: 14, fontWeight: 600 }}>
              Perfil público →
            </Link>
            <Link to="/painel-dados" style={{ fontSize: 14, fontWeight: 600 }}>
              Painel de dados →
            </Link>
          </div>
        </Header>

        <TabsRow aria-label="Seções do painel SLA">
          <TabBtn $active={tab === 'queue'} onClick={() => setTab('queue')}>
            Fila de trabalho
          </TabBtn>
          <TabBtn $active={tab === 'workload'} onClick={() => setTab('workload')}>
            Carga da equipe
          </TabBtn>
          <TabBtn $active={tab === 'performance'} onClick={() => setTab('performance')}>
            Desempenho SLA
          </TabBtn>
          <TabBtn $active={tab === 'config'} onClick={() => setTab('config')}>
            Configuração de prazos
          </TabBtn>
          <TabBtn $active={tab === 'reports'} onClick={() => setTab('reports')}>
            Relatórios mensais (PDF)
          </TabBtn>
        </TabsRow>

        {planLocked ? (
          <PlanLockedPreview
            featureName="Painel de prazos (SLA) e fila de trabalho"
            requiredPlan={planLocked.requiredPlan ?? 'Gestão'}
            description="Configure prazos de 1ª resposta por categoria, atribua relatos à equipe e receba alertas antes do vencimento. No plano Básico, o percentual público de SLA segue visível no perfil da entidade."
          />
        ) : (
          <>
            {tab === 'queue' && (
              <>
                <KpiGrid>
                  <KpiCard
                    $active={urgency === 'BREACHED'}
                    $tone="#DC2626"
                    onClick={() => {
                      setUrgency(urgency === 'BREACHED' ? 'ALL' : 'BREACHED')
                      setPage(1)
                    }}
                  >
                    <KpiLabel>Vencidos</KpiLabel>
                    <KpiValue $color="#DC2626">{queueQ.data?.summary.breached ?? 0}</KpiValue>
                  </KpiCard>
                  <KpiCard
                    $active={urgency === 'DUE_TODAY'}
                    $tone="#EA580C"
                    onClick={() => {
                      setUrgency(urgency === 'DUE_TODAY' ? 'ALL' : 'DUE_TODAY')
                      setPage(1)
                    }}
                  >
                    <KpiLabel>Vence hoje</KpiLabel>
                    <KpiValue $color="#EA580C">{queueQ.data?.summary.dueToday ?? 0}</KpiValue>
                  </KpiCard>
                  <KpiCard
                    $active={urgency === 'AT_RISK'}
                    $tone="#D97706"
                    onClick={() => {
                      setUrgency(urgency === 'AT_RISK' ? 'ALL' : 'AT_RISK')
                      setPage(1)
                    }}
                  >
                    <KpiLabel>Em risco (&ge; 75%)</KpiLabel>
                    <KpiValue $color="#D97706">{queueQ.data?.summary.atRisk ?? 0}</KpiValue>
                  </KpiCard>
                  <KpiCard
                    $active={urgency === 'ON_TIME'}
                    $tone="#16A34A"
                    onClick={() => {
                      setUrgency(urgency === 'ON_TIME' ? 'ALL' : 'ON_TIME')
                      setPage(1)
                    }}
                  >
                    <KpiLabel>No prazo</KpiLabel>
                    <KpiValue $color="#16A34A">{queueQ.data?.summary.onTime ?? 0}</KpiValue>
                  </KpiCard>
                </KpiGrid>

                <Card>
                  <FiltersRow>
                    <PillBtn
                      $active={assigneeFilter === 'ALL'}
                      onClick={() => {
                        setAssigneeFilter('ALL')
                        setPage(1)
                      }}
                    >
                      Todos ({queueQ.data?.summary.totalOpen ?? 0})
                    </PillBtn>
                    <PillBtn
                      $active={assigneeFilter === 'MINE'}
                      onClick={() => {
                        setAssigneeFilter('MINE')
                        setPage(1)
                      }}
                    >
                      Meus relatos ({queueQ.data?.summary.mine ?? 0})
                    </PillBtn>
                    <PillBtn
                      $active={assigneeFilter === 'UNASSIGNED'}
                      onClick={() => {
                        setAssigneeFilter('UNASSIGNED')
                        setPage(1)
                      }}
                    >
                      Não atribuídos ({queueQ.data?.summary.unassigned ?? 0})
                    </PillBtn>

                    <Select
                      aria-label="Filtrar por categoria"
                      value={categoryFilter}
                      onChange={(e) => {
                        setCategoryFilter(e.target.value as Category | '')
                        setPage(1)
                      }}
                    >
                      <option value="">Todas as categorias</option>
                      {ALL_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_CONFIG[c]?.label ?? c}
                        </option>
                      ))}
                    </Select>

                    <Input
                      placeholder="Bairro ou área..."
                      value={neighborhoodFilter}
                      onChange={(e) => {
                        setNeighborhoodFilter(e.target.value)
                        setPage(1)
                      }}
                    />

                    <Select
                      aria-label="Ordenação da fila"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SlaQueueSortBy)}
                    >
                      <option value="due_asc">Mais próximos do vencimento</option>
                      <option value="pressure_desc">Maior pressão</option>
                      <option value="newest">Mais recentes</option>
                    </Select>
                  </FiltersRow>

                  {assignError && <AlertBanner $tone="warn">{assignError}</AlertBanner>}

                  {queueQ.isLoading ? (
                    <Subtitle>Carregando fila de atendimento...</Subtitle>
                  ) : !queueQ.data || queueQ.data.items.length === 0 ? (
                    <Subtitle>Nenhum relato em aberto corresponde aos filtros selecionados.</Subtitle>
                  ) : (
                    <QueueList>
                      {queueQ.data.items.map((item) => (
                        <QueueRow key={item.id}>
                          <div style={{ flex: '1 1 320px' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                              <SlaPill $state={item.slaState}>{formatSlaLabel(item)}</SlaPill>
                              <span style={{ fontSize: 12, color: '#64748B' }}>
                                {CATEGORY_CONFIG[item.category]?.label ?? item.category}
                              </span>
                              {item.neighborhood && (
                                <span style={{ fontSize: 12, color: '#64748B' }}>
                                  · {item.neighborhood}
                                </span>
                              )}
                            </div>
                            <Link
                              to={`/relatos/${item.id}`}
                              style={{ fontWeight: 700, color: '#1A1A2E', fontSize: 15 }}
                            >
                              {item.title}
                            </Link>
                            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                              Pressão: {Math.round(item.pressureScore)} · Status: {item.status}
                              {item.slaDueAt && ` · Prazo: ${new Date(item.slaDueAt).toLocaleString('pt-BR')}`}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Select
                              aria-label={`Responsável por ${item.title}`}
                              value={item.assignment?.assignee?.id ?? ''}
                              disabled={assignMut.isPending}
                              onChange={(e) => handleAssign(item.id, e.target.value)}
                            >
                              <option value="">Sem responsável</option>
                              {(membersQ.data ?? []).map((m) => (
                                <option key={m.userId} value={m.userId}>
                                  {m.name ?? 'Membro'} ({m.roleName})
                                </option>
                              ))}
                            </Select>
                          </div>
                        </QueueRow>
                      ))}
                    </QueueList>
                  )}
                </Card>
              </>
            )}

            {tab === 'workload' && (
              <Card>
                <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Carga de trabalho por membro</h2>
                <Subtitle style={{ marginBottom: 16 }}>
                  Relatos abertos e prazos em risco/vencidos distribuídos entre os membros ativos.
                  {workloadQ.data ? ` Sem atribuição na fila: ${workloadQ.data.unassignedCount}.` : ''}
                </Subtitle>
                {workloadQ.isLoading ? (
                  <Subtitle>Carregando carga da equipe...</Subtitle>
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <th>Membro</th>
                        <th>Papel</th>
                        <th>Total atribuído</th>
                        <th>Vencidos</th>
                        <th>Vence hoje</th>
                        <th>Em risco</th>
                        <th>No prazo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(workloadQ.data?.members ?? []).map((m) => (
                        <tr key={m.userId}>
                          <td>
                            <strong>{m.name ?? 'Membro'}</strong>
                          </td>
                          <td>{m.roleName}</td>
                          <td>{m.totalAssigned}</td>
                          <td style={{ color: m.breached > 0 ? '#DC2626' : undefined, fontWeight: 700 }}>
                            {m.breached}
                          </td>
                          <td>{m.dueToday}</td>
                          <td style={{ color: m.atRisk > 0 ? '#D97706' : undefined }}>{m.atRisk}</td>
                          <td style={{ color: '#16A34A' }}>{m.onTime}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            )}

            {tab === 'performance' && (
              <>
                <KpiGrid>
                  <KpiCard $active={false}>
                    <KpiLabel>
                      <span>Cumprimento de SLA</span>
                      <MetricInfoModal metricKey="sla_compliance_rate" />
                    </KpiLabel>
                    <KpiValue>
                      {perfQ.data?.summary.complianceRate.value !== null &&
                      perfQ.data?.summary.complianceRate.value !== undefined
                        ? `${perfQ.data.summary.complianceRate.value}%`
                        : '—'}
                    </KpiValue>
                  </KpiCard>
                  <KpiCard $active={false}>
                    <KpiLabel>No prazo / Vencidos</KpiLabel>
                    <KpiValue>
                      {perfQ.data ? `${perfQ.data.summary.slaMet} / ${perfQ.data.summary.slaBreached}` : '0 / 0'}
                    </KpiValue>
                  </KpiCard>
                  <KpiCard $active={false}>
                    <KpiLabel>
                      <span>Mediana 1ª resposta</span>
                      <MetricInfoModal metricKey="first_response_median_h" />
                    </KpiLabel>
                    <KpiValue>
                      {perfQ.data?.summary.firstResponseMedianH !== null &&
                      perfQ.data?.summary.firstResponseMedianH !== undefined
                        ? `${perfQ.data.summary.firstResponseMedianH}h`
                        : '—'}
                    </KpiValue>
                  </KpiCard>
                </KpiGrid>

                <Card>
                  <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>
                    Desempenho por categoria (mediana real vs prazo declarado)
                  </h2>
                  {perfQ.data?.byCategory.length ? (
                    <Table>
                      <thead>
                        <tr>
                          <th>Categoria</th>
                          <th>Prazo declarado</th>
                          <th>Mediana real</th>
                          <th>No prazo</th>
                          <th>Vencidos</th>
                          <th>Cumprimento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {perfQ.data.byCategory.map((row) => (
                          <tr key={row.category}>
                            <td>{CATEGORY_CONFIG[row.category as Category]?.label ?? row.category}</td>
                            <td>{row.declaredHours}h</td>
                            <td>{row.medianResponseHours !== null ? `${row.medianResponseHours}h` : '—'}</td>
                            <td>{row.slaMet}</td>
                            <td>{row.slaBreached}</td>
                            <td>
                              {row.complianceRate.value !== null ? `${row.complianceRate.value}%` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  ) : (
                    <Subtitle>Sem métricas consolidadas no período selecionado.</Subtitle>
                  )}
                </Card>

                <Card>
                  <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>Evolução mensal de cumprimento</h2>
                  {perfQ.data?.monthlyEvolution.length ? (
                    <svg
                      viewBox={`0 0 ${Math.max(400, perfQ.data.monthlyEvolution.length * 90)} 150`}
                      style={{ width: '100%', maxWidth: 720, height: 'auto' }}
                      aria-label="Gráfico de evolução mensal de cumprimento SLA"
                    >
                      {perfQ.data.monthlyEvolution.map((m, idx) => {
                        const pct = m.complianceRate.value ?? 0
                        const barH = Math.round((pct / 100) * 90)
                        const x = 24 + idx * 84
                        return (
                          <g key={m.month}>
                            <rect
                              x={x}
                              y={108 - barH}
                              width={42}
                              height={Math.max(4, barH)}
                              rx={4}
                              fill={pct >= 75 ? '#16A34A' : '#E63946'}
                            />
                            <text x={x + 21} y={100 - barH} textAnchor="middle" fontSize="10" fill="#1A1A2E">
                              {m.complianceRate.value !== null ? `${pct}%` : '—'}
                            </text>
                            <text x={x + 21} y={128} textAnchor="middle" fontSize="10" fill="#64748B">
                              {m.month}
                            </text>
                          </g>
                        )
                      })}
                    </svg>
                  ) : (
                    <Subtitle>Ainda sem série mensal consolidada.</Subtitle>
                  )}
                </Card>
              </>
            )}

            {tab === 'config' && (
              <Card>
                <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Política de prazos (SLA) por categoria</h2>
                <AlertBanner>
                  <strong>Efeito prospectivo:</strong> alterações de prazo valem apenas para <strong>novos relatos</strong> recebidos após salvar, salvo se você marcar explicitamente o recálculo dos relatos abertos sem resposta. Cálculo v1 em horas corridas; horário comercial e feriados serão suportados em versão futura.
                </AlertBanner>
                <form onSubmit={handleSavePolicy}>
                  <Table>
                    <thead>
                      <tr>
                        <th>Categoria</th>
                        <th>Prazo 1ª resposta (h)</th>
                        <th>Meta resolução opcional (h)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ALL_CATEGORIES.map((cat) => (
                        <tr key={cat}>
                          <td>{CATEGORY_CONFIG[cat]?.label ?? cat}</td>
                          <td>
                            <Input
                              type="number"
                              min={1}
                              max={8760}
                              value={slaHoursForm[cat] ?? DEFAULT_SLA_HOURS_BY_CATEGORY[cat]}
                              onChange={(e) =>
                                setSlaHoursForm((prev) => ({
                                  ...prev,
                                  [cat]: Math.max(1, Number(e.target.value) || 1),
                                }))
                              }
                            />
                          </td>
                          <td>
                            <Input
                              type="number"
                              min={1}
                              max={8760}
                              placeholder="Opcional"
                              value={resHoursForm[cat] ?? ''}
                              onChange={(e) =>
                                setResHoursForm((prev) => ({ ...prev, [cat]: e.target.value }))
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 16, alignItems: 'center' }}>
                    <label style={{ fontSize: 13 }}>
                      Escalonar à gestão após violação (horas):{' '}
                      <Input
                        type="number"
                        min={1}
                        max={720}
                        value={escalationHours}
                        onChange={(e) => setEscalationHours(Math.max(1, Number(e.target.value) || 24))}
                        style={{ width: 90, marginLeft: 6 }}
                      />
                    </label>
                    <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={autoMonthly}
                        onChange={(e) => setAutoMonthly(e.target.checked)}
                      />
                      Gerar e enviar relatório mensal automático por e-mail todo dia 1º
                    </label>
                    <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={recalculateOpen}
                        onChange={(e) => setRecalculateOpen(e.target.checked)}
                      />
                      Recalcular também relatos abertos sem 1ª resposta
                    </label>
                  </div>

                  {configNotice && (
                    <Subtitle style={{ color: '#166534', marginTop: 12, fontWeight: 600 }}>
                      {configNotice}
                    </Subtitle>
                  )}

                  <div style={{ marginTop: 16 }}>
                    <PrimaryBtn type="submit" disabled={updatePolicyMut.isPending}>
                      {updatePolicyMut.isPending ? 'Salvando...' : 'Salvar política de SLA'}
                    </PrimaryBtn>
                  </div>
                </form>
              </Card>
            )}

            {tab === 'reports' && (
              <>
                {extractPlanRequired(reportsQ.error) ? (
                  <PlanLockedPreview
                    featureName="Relatório mensal de atendimento (PDF)"
                    requiredPlan="Gestão"
                    description="Gere snapshots imutáveis em PDF com cumprimento de prazo, tempo mediano de resposta e reincidência por área, além de envio mensal automático aos gestores."
                  />
                ) : (
                  <Card>
                    <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>
                      Relatório de atendimento em PDF
                    </h2>
                    <Subtitle style={{ marginBottom: 14 }}>
                      Cada relatório gera um snapshot factual com código público verificável (`/prestacao/:code`), incluindo cumprimento de SLA e reincidência com supressão de células &lt; 10.
                    </Subtitle>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                      <Input type="date" value={pdfFrom} onChange={(e) => setPdfFrom(e.target.value)} />
                      <span>até</span>
                      <Input type="date" value={pdfTo} onChange={(e) => setPdfTo(e.target.value)} />
                      <PrimaryBtn
                        type="button"
                        disabled={createReportMut.isPending}
                        onClick={async () => {
                          setPdfMsg('')
                          try {
                            await createReportMut.mutateAsync({ from: pdfFrom, to: pdfTo })
                            setPdfMsg('Relatório enfileirado para renderização em PDF.')
                          } catch {
                            setPdfMsg('Não foi possível solicitar o relatório (verifique a cota mensal do plano).')
                          }
                        }}
                      >
                        {createReportMut.isPending ? 'Gerando...' : 'Gerar relatório PDF'}
                      </PrimaryBtn>
                    </div>
                    {pdfMsg && <AlertBanner>{pdfMsg}</AlertBanner>}

                    <Table>
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Período</th>
                          <th>Status</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(reportsQ.data?.items ?? []).map((rep) => (
                          <tr key={rep.id}>
                            <td>
                              <code>{rep.code}</code>
                            </td>
                            <td>
                              {rep.periodStart} a {rep.periodEnd}
                            </td>
                            <td>{rep.status}</td>
                            <td style={{ display: 'flex', gap: 12 }}>
                              {rep.status === 'READY' && (
                                <button
                                  type="button"
                                  onClick={() => handleDownloadPdf(rep.id)}
                                  style={{ background: 'none', border: 'none', color: '#1D4ED8', cursor: 'pointer', fontWeight: 600 }}
                                >
                                  Baixar PDF
                                </button>
                              )}
                              <Link to={`/prestacao/${rep.code}`}>Página pública →</Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </Container>
    </Page>
  )
}
