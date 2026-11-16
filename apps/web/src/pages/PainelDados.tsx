import { useState } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import {
  Category,
  formatCountPtBr,
  formatDateBr,
  formatDateTimeBr,
  formatDecimalPtBr,
  formatDurationPtBr,
  formatGapDaysPtBr,
  formatPercentPtBr,
} from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import { CATEGORY_CONFIG } from '../components/ui/Badge'
import { AnalyticsHeatmap } from '../components/analytics/AnalyticsHeatmap'
import { MetricChart } from '../components/analytics/MetricChart'
import { MetricInfoModal } from '../components/analytics/MetricInfoModal'
import { PlanLockedPreview } from '../components/analytics/PlanLockedPreview'
import {
  AnalyticsPeriodPreset,
  AnalyticsScopeMode,
  AnalyticsTimeseriesGranularity,
  AnalyticsTimeseriesMetric,
  downloadAnalyticsExport,
  extractPlanRequired,
  useAnalyticsCategories,
  useAnalyticsHeatmap,
  useAnalyticsOutbreaks,
  useAnalyticsOverview,
  useAnalyticsRecurrence,
  useAnalyticsResponseTimes,
  useAnalyticsTimeseries,
} from '../hooks/useAnalytics'
import { useAuthStore } from '../store/auth.store'

type PainelTab = 'overview' | 'heatmap' | 'recurrence' | 'response-times' | 'categories' | 'export'

const Page = styled.div`
  min-height: 100vh;
  width: 100%;
  overflow-x: clip;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.main`
  width: 100%;
  box-sizing: border-box;
  max-width: 1180px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing[6]} ${({ theme }) => theme.spacing[4]} ${({ theme }) => theme.spacing[16]};
`

const TopBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing[4]};
  flex-wrap: wrap;
  margin-bottom: ${({ theme }) => theme.spacing[5]};
`

const PageTitle = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['3xl']};
  color: ${({ theme }) => theme.colors.primary};
`

const PageSubtitle = styled.p`
  margin: 4px 0 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
`

const MetaBanner = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 10px 14px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
`

const ControlsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing[3]};
  align-items: center;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing[4]};
  margin-bottom: ${({ theme }) => theme.spacing[5]};
`

const Select = styled.select`
  padding: 7px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`

const TabsRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing[2]};
  flex-wrap: wrap;
  margin-bottom: ${({ theme }) => theme.spacing[5]};
`

const TabButton = styled.button<{ $active: boolean }>`
  padding: 8px 16px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.white)};
  color: ${({ $active, theme }) => ($active ? theme.colors.white : theme.colors.text)};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: ${({ theme }) => theme.spacing[4]};
  margin-bottom: ${({ theme }) => theme.spacing[5]};
`

const KpiCard = styled.div`
  min-width: 0;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing[4]};
`

const KpiHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
`

const KpiLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.muted};
`

const KpiValue = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: clamp(1.125rem, 1.5vw, 1.375rem);
  line-height: 1.25;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.primary};
`

const KpiToken = styled.span`
  display: inline-block;
  white-space: nowrap;
`

const KpiSub = styled.div`
  margin-top: 4px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
`

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing[5]};
  min-width: 0;
  width: 100%;
`

const PanelBox = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing[6]};
  min-width: 0;
  box-sizing: border-box;
`

const DataTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.sm};

  th,
  td {
    padding: 10px 12px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    text-align: left;
  }

  th {
    font-size: ${({ theme }) => theme.fontSizes.xs};
    color: ${({ theme }) => theme.colors.muted};
    text-transform: uppercase;
  }

  td.num {
    font-family: ${({ theme }) => theme.fonts.mono};
    text-align: right;
  }
`

const ActionBtn = styled.button`
  padding: 10px 18px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: none;
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const SecondaryBtn = styled(ActionBtn)`
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.primary};
  border: 1px solid ${({ theme }) => theme.colors.primary};
`

function formatRatioPct(ratio?: { value: number | null; numerator: number; denominator: number }) {
  if (!ratio || ratio.value === null) return '—'
  return formatPercentPtBr(ratio.value, 2)
}

function formatHours(h: number | null | undefined) {
  return formatDurationPtBr(h, { dayThresholdHours: 24, dayUnit: 'd' })
}

export function PainelDados() {
  const { user, activeContext } = useAuthStore()
  const [tab, setTab] = useState<PainelTab>('overview')
  const [scope, setScope] = useState<AnalyticsScopeMode>('area')
  const [period, setPeriod] = useState<AnalyticsPeriodPreset>('30d')
  const [category, setCategory] = useState<string>('')
  const [tsMetric, setTsMetric] = useState<AnalyticsTimeseriesMetric>('volume')
  const [tsGranularity, setTsGranularity] = useState<AnalyticsTimeseriesGranularity>('week')
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)

  const hasOrgContext =
    !!user && !!activeContext && (activeContext.type === 'ENTITY' || activeContext.type === 'POLITICIAN')

  const baseParams = { scope, period, category: category || undefined }

  const overviewQ = useAnalyticsOverview(baseParams, hasOrgContext)
  const categoriesQ = useAnalyticsCategories(
    baseParams,
    hasOrgContext && (tab === 'categories' || tab === 'overview'),
  )
  const timeseriesQ = useAnalyticsTimeseries(
    { ...baseParams, metric: tsMetric, granularity: tsGranularity },
    hasOrgContext && tab === 'overview',
  )
  const heatmapQ = useAnalyticsHeatmap(
    { period, category: category || undefined, scope: 'area' },
    hasOrgContext && tab === 'heatmap',
  )
  const recurrenceQ = useAnalyticsRecurrence(
    { period, category: category || undefined, scope: 'area', page: 1, limit: 25 },
    hasOrgContext && tab === 'recurrence',
  )
  const responseTimesQ = useAnalyticsResponseTimes(
    baseParams,
    hasOrgContext && tab === 'response-times',
  )
  const outbreaksQ = useAnalyticsOutbreaks(
    { period, category: category || undefined, scope: 'area', page: 1, limit: 20 },
    hasOrgContext && tab === 'overview',
  )

  if (!user || !hasOrgContext) {
    return (
      <Page>
        <Navbar />
        <Content>
          <PanelBox>
            <PageTitle>Painel de Dados</PageTitle>
            <PageSubtitle>
              Alterne para o contexto de uma <strong>Entidade</strong> ou <strong>Político</strong> no menu do perfil para consultar os dados pré-agregados do território e do seu atendimento.
            </PageSubtitle>
            <div style={{ marginTop: 16 }}>
              <Link to="/planos">Conhecer planos e benefícios →</Link>
            </div>
          </PanelBox>
        </Content>
      </Page>
    )
  }

  const overviewLock = extractPlanRequired(overviewQ.error)
  const timeseriesLock = extractPlanRequired(timeseriesQ.error)
  const heatmapLock = extractPlanRequired(heatmapQ.error)
  const recurrenceLock = extractPlanRequired(recurrenceQ.error)
  const responseTimesLock = extractPlanRequired(responseTimesQ.error)

  const metaSource =
    overviewQ.data ??
    categoriesQ.data ??
    heatmapQ.data ??
    recurrenceQ.data ??
    responseTimesQ.data

  async function handleExport(format: 'csv' | 'json') {
    setExportMsg(null)
    setExportLoading(true)
    try {
      await downloadAnalyticsExport({ ...baseParams, format })
      setExportMsg(`Exportação ${format.toUpperCase()} concluída.`)
    } catch (err) {
      const planErr = extractPlanRequired(err)
      setExportMsg(
        planErr
          ? `Recurso indisponível no plano atual. Plano necessário: ${planErr.requiredPlan ?? 'superior'}.`
          : 'Não foi possível gerar a exportação agora.',
      )
    } finally {
      setExportLoading(false)
    }
  }

  return (
    <Page>
      <Navbar />
      <Content>
        <TopBar>
          <div>
            <PageTitle>Painel de Dados — {activeContext.name}</PageTitle>
            <PageSubtitle>
              Métricas pré-agregadas, reproduzíveis e com proteção de privacidade (k-anonimato mínimo de{' '}
              {metaSource?.minCellSize ?? 10} relatos).
            </PageSubtitle>
          </div>
          {metaSource && (
            <MetaBanner>
              <span>
                Amostra:{' '}
                {metaSource.sampleSize !== null
                  ? formatCountPtBr(metaSource.sampleSize)
                  : 'Suprimida (<10)'}
              </span>
              <span>Definição: {metaSource.definitionVersion}</span>
              <span>Vigência: {formatDateBr(metaSource.definitionDate)}</span>
              <span>Atualizado: {formatDateTimeBr(metaSource.computedAt)}</span>
            </MetaBanner>
          )}
        </TopBar>

        <ControlsRow>
          <label>
            Visão:{' '}
            <Select
              aria-label="Escopo de análise"
              value={scope}
              onChange={(e) => setScope(e.target.value as AnalyticsScopeMode)}
            >
              <option value="area">Território de atuação (área)</option>
              <option value="directed">Direcionados a mim</option>
            </Select>
          </label>

          <label>
            Período:{' '}
            <Select
              aria-label="Período"
              value={period}
              onChange={(e) => {
                const next = e.target.value as AnalyticsPeriodPreset
                setPeriod(next)
                if (next !== '365d' && tsGranularity === 'month') {
                  setTsGranularity('week')
                }
              }}
            >
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="90d">Últimos 90 dias</option>
              <option value="365d">Últimos 12 meses</option>
            </Select>
          </label>

          <label>
            Categoria:{' '}
            <Select
              aria-label="Categoria"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Todas as categorias</option>
              {Object.values(Category).map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_CONFIG[cat]?.label ?? cat}
                </option>
              ))}
            </Select>
          </label>
        </ControlsRow>

        <TabsRow role="tablist" aria-label="Seções do painel de dados">
          {(
            [
              ['overview', 'Visão geral'],
              ['heatmap', 'Mapa de calor'],
              ['recurrence', 'Reincidência'],
              ['response-times', 'Tempos de resposta'],
              ['categories', 'Categorias'],
              ['export', 'Exportar'],
            ] as Array<[PainelTab, string]>
          ).map(([key, label]) => (
            <TabButton
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              $active={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
            </TabButton>
          ))}
        </TabsRow>

        {tab === 'overview' && (
          <Stack>
            {overviewQ.isLoading ? (
              <PanelBox>Carregando métricas da visão geral...</PanelBox>
            ) : overviewLock ? (
              <PlanLockedPreview
                featureName="Visão geral e janela estendida"
                requiredPlan={overviewLock.requiredPlan}
                description={overviewLock.message}
              />
            ) : overviewQ.isError || !overviewQ.data ? (
              <PanelBox>Não foi possível carregar os indicadores deste período.</PanelBox>
            ) : overviewQ.data.suppressed ? (
              <PanelBox>
                <strong>Poucos relatos para mostrar com segurança.</strong>
                <p style={{ marginBottom: 0 }}>
                  Este recorte possui menos de {overviewQ.data.minCellSize} relatos e foi suprimido para preservar o k-anonimato dos cidadãos.
                </p>
              </PanelBox>
            ) : (
              <>
                <KpiGrid>
                  <KpiCard>
                    <KpiHeader>
                      <KpiLabel>Volume de relatos</KpiLabel>
                      <MetricInfoModal metricKey="volume" />
                    </KpiHeader>
                    <KpiValue>{formatCountPtBr(overviewQ.data.kpis.volume)}</KpiValue>
                    <KpiSub>
                      Apoios: {formatCountPtBr(overviewQ.data.kpis.supportVolume ?? 0)} ·
                      Comentários: {formatCountPtBr(overviewQ.data.kpis.commentVolume ?? 0)}
                    </KpiSub>
                  </KpiCard>

                  <KpiCard>
                    <KpiHeader>
                      <KpiLabel>Taxa de resolução</KpiLabel>
                      <MetricInfoModal metricKey="resolution_rate" />
                    </KpiHeader>
                    <KpiValue>{formatRatioPct(overviewQ.data.kpis.resolutionRate)}</KpiValue>
                    <KpiSub>
                      {formatCountPtBr(overviewQ.data.kpis.resolutionRate.numerator)} ÷{' '}
                      {formatCountPtBr(overviewQ.data.kpis.resolutionRate.denominator)} (resolvidos
                      + abertos &gt;7d)
                    </KpiSub>
                  </KpiCard>

                  <KpiCard>
                    <KpiHeader>
                      <KpiLabel>1ª resposta (p50 / p90)</KpiLabel>
                      <MetricInfoModal metricKey="first_response_median_h" />
                    </KpiHeader>
                    <KpiValue>
                      <KpiToken>{formatHours(overviewQ.data.kpis.firstResponseMedianH)}</KpiToken>{' '}
                      /{' '}
                      <KpiToken>{formatHours(overviewQ.data.kpis.firstResponseP90H)}</KpiToken>
                    </KpiValue>
                    <KpiSub>
                      Taxa de resposta: {formatRatioPct(overviewQ.data.kpis.responseRate)} (
                      {formatCountPtBr(overviewQ.data.kpis.responseRate.numerator)}/
                      {formatCountPtBr(overviewQ.data.kpis.responseRate.denominator)})
                    </KpiSub>
                  </KpiCard>

                  <KpiCard>
                    <KpiHeader>
                      <KpiLabel>Backlog em aberto</KpiLabel>
                      <MetricInfoModal metricKey="backlog" />
                    </KpiHeader>
                    <KpiValue>{formatCountPtBr(overviewQ.data.kpis.backlog)}</KpiValue>
                    <KpiSub>
                      Idade p50: {formatHours(overviewQ.data.kpis.backlogAgeP50H)} · p90:{' '}
                      {formatHours(overviewQ.data.kpis.backlogAgeP90H)}
                    </KpiSub>
                  </KpiCard>

                  <KpiCard>
                    <KpiHeader>
                      <KpiLabel>Tempo de resolução</KpiLabel>
                      <MetricInfoModal metricKey="resolution_time_median_h" />
                    </KpiHeader>
                    <KpiValue>
                      {formatHours(overviewQ.data.kpis.resolutionTimeMedianH)}
                    </KpiValue>
                    <KpiSub>p90: {formatHours(overviewQ.data.kpis.resolutionTimeP90H)}</KpiSub>
                  </KpiCard>

                  <KpiCard>
                    <KpiHeader>
                      <KpiLabel>Contestação e pressão</KpiLabel>
                      <MetricInfoModal metricKey="contest_rate" />
                    </KpiHeader>
                    <KpiValue>{formatRatioPct(overviewQ.data.kpis.contestRate)}</KpiValue>
                    <KpiSub>
                      Pressão p50: {formatDecimalPtBr(overviewQ.data.kpis.pressureP50, 1)} · p90:{' '}
                      {formatDecimalPtBr(overviewQ.data.kpis.pressureP90, 1)}
                    </KpiSub>
                  </KpiCard>
                </KpiGrid>

                {timeseriesLock ? (
                  <PlanLockedPreview
                    featureName="Série temporal e comparativo de período"
                    requiredPlan={timeseriesLock.requiredPlan}
                  />
                ) : timeseriesQ.data ? (
                  <div>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Select
                        aria-label="Métrica da série temporal"
                        value={tsMetric}
                        onChange={(e) => setTsMetric(e.target.value as AnalyticsTimeseriesMetric)}
                      >
                        <option value="volume">Volume criado</option>
                        <option value="resolved">Resolvidos</option>
                        <option value="response_rate">Taxa de resposta (%)</option>
                        <option value="resolution_rate">Taxa de resolução (%)</option>
                        <option value="support">Apoios</option>
                      </Select>
                      <Select
                        aria-label="Granularidade"
                        value={timeseriesQ.data.granularity}
                        onChange={(e) =>
                          setTsGranularity(e.target.value as AnalyticsTimeseriesGranularity)
                        }
                      >
                        <option value="day">Diário</option>
                        <option value="week">Semanal</option>
                        <option value="month">Mensal</option>
                      </Select>
                      {timeseriesQ.data.autoAdjustedGranularity && (
                        <span
                          style={{
                            fontSize: '0.8125rem',
                            color: '#1A1A2E',
                            background: '#EAECEF',
                            padding: '4px 10px',
                            borderRadius: 6,
                          }}
                        >
                          Agrupamos por{' '}
                          {timeseriesQ.data.granularity === 'week' ? 'semana' : 'mês'} para
                          proteger a privacidade.
                        </span>
                      )}
                    </div>
                    <MetricChart
                      title="Evolução no período"
                      whatItShows="tendência agregada ao longo do tempo e variação contra o período imediatamente anterior."
                      metricKey="trend"
                      variant="line"
                      unit={tsMetric.endsWith('rate') ? '%' : ''}
                      data={timeseriesQ.data.points.map((pt) => ({
                        label: pt.bucket,
                        value: pt.value,
                        suppressed: pt.suppressed,
                      }))}
                    />
                  </div>
                ) : null}

                {outbreaksQ.data && outbreaksQ.data.items.length > 0 && (
                  <PanelBox>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <h3 style={{ margin: 0 }}>Histórico recente de surtos</h3>
                      <MetricInfoModal metricKey="outbreak_history" />
                    </div>
                    <DataTable>
                      <thead>
                        <tr>
                          <th>Município/UF</th>
                          <th>Categoria</th>
                          <th style={{ textAlign: 'right' }}>Relatos</th>
                          <th>Status</th>
                          <th>Detectado em</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outbreaksQ.data.items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              {item.city}/{item.state}
                            </td>
                            <td>{CATEGORY_CONFIG[item.category as Category]?.label ?? item.category}</td>
                            <td className="num">
                              {item.suppressed ? 'Suprimido (<10)' : formatCountPtBr(item.reportCount)}
                            </td>
                            <td>{item.active ? 'Ativo' : 'Encerrado'}</td>
                            <td>{formatDateBr(item.detectedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </PanelBox>
                )}
              </>
            )}
          </Stack>
        )}

        {tab === 'heatmap' && (
          <Stack>
            {heatmapQ.isLoading ? (
              <PanelBox>Carregando células do mapa de calor...</PanelBox>
            ) : heatmapLock ? (
              <PlanLockedPreview
                featureName="Mapa de calor por célula geohash-7"
                requiredPlan={heatmapLock.requiredPlan}
                description="Visualize concentrações territoriais agregadas (~150 m) com proteção automática contra células pequenas."
              />
            ) : heatmapQ.isError || !heatmapQ.data ? (
              <PanelBox>Não foi possível carregar o mapa de calor.</PanelBox>
            ) : (
              <AnalyticsHeatmap data={heatmapQ.data} />
            )}
          </Stack>
        )}

        {tab === 'recurrence' && (
          <Stack>
            {recurrenceQ.isLoading ? (
              <PanelBox>Carregando células reincidentes...</PanelBox>
            ) : recurrenceLock ? (
              <PlanLockedPreview
                featureName="Reincidência por célula e categoria"
                requiredPlan={recurrenceLock.requiredPlan}
              />
            ) : recurrenceQ.isError || !recurrenceQ.data ? (
              <PanelBox>Não foi possível carregar os dados de reincidência.</PanelBox>
            ) : recurrenceQ.data.suppressed || recurrenceQ.data.items.length === 0 ? (
              <PanelBox>
                <strong>Poucos relatos para mostrar com segurança.</strong>
                <p style={{ marginBottom: 0 }}>
                  Células visíveis exige ao menos {recurrenceQ.data.minCellSize} relatos nos últimos 90 dias (células suprimidas: {recurrenceQ.data.suppressedCells}).
                </p>
              </PanelBox>
            ) : (
              <PanelBox>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <h3 style={{ margin: 0 }}>Células reincidentes (últimos 90 dias)</h3>
                  <MetricInfoModal metricKey="recurrence_index" />
                </div>
                <p style={{ marginTop: 0 }}>
                  Índice de reincidência:{' '}
                  <strong>{formatRatioPct(recurrenceQ.data.recurrenceIndex)}</strong> (
                  {formatCountPtBr(recurrenceQ.data.recurrenceIndex.numerator)}/
                  {formatCountPtBr(recurrenceQ.data.recurrenceIndex.denominator)}) · Células abaixo de{' '}
                  {recurrenceQ.data.minCellSize} relatos suprimidas:{' '}
                  {formatCountPtBr(recurrenceQ.data.suppressedCells)}
                </p>
                <DataTable>
                  <thead>
                    <tr>
                      <th>Área (~150 m)</th>
                      <th>Categoria</th>
                      <th style={{ textAlign: 'right' }}>Relatos (90d)</th>
                      <th style={{ textAlign: 'right' }}>Intervalo médio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recurrenceQ.data.items.map((item) => (
                      <tr key={`${item.cell7}-${item.category}`}>
                        <td>{item.areaLabel ?? 'Área sem bairro informado'}</td>
                        <td>
                          {item.categoryLabel ??
                            CATEGORY_CONFIG[item.category as Category]?.label ??
                            item.category}
                        </td>
                        <td className="num">{formatCountPtBr(item.count90d)}</td>
                        <td className="num">{formatGapDaysPtBr(item.avgGapDays)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </PanelBox>
            )}
          </Stack>
        )}

        {tab === 'response-times' && (
          <Stack>
            {responseTimesQ.isLoading ? (
              <PanelBox>Carregando tempos de resposta...</PanelBox>
            ) : responseTimesLock ? (
              <PlanLockedPreview
                featureName="Distribuição e percentis de tempo de resposta"
                requiredPlan={responseTimesLock.requiredPlan}
              />
            ) : responseTimesQ.isError || !responseTimesQ.data ? (
              <PanelBox>Não foi possível carregar os tempos de resposta.</PanelBox>
            ) : responseTimesQ.data.overall.suppressed ? (
              <PanelBox>Poucos relatos para mostrar com segurança neste período.</PanelBox>
            ) : (
              <>
                <MetricChart
                  title="Distribuição do tempo até a primeira resposta oficial"
                  whatItShows="quantos relatos foram respondidos dentro de cada faixa de horas."
                  metricKey="first_response_median_h"
                  variant="bar"
                  data={responseTimesQ.data.overall.firstResponseBuckets.map((b) => ({
                    label: b.label,
                    value: b.count,
                  }))}
                />
                <MetricChart
                  title="Distribuição do tempo até a resolução"
                  whatItShows="em quanto tempo os relatos concluídos chegaram ao status RESOLVIDO."
                  metricKey="resolution_time_median_h"
                  variant="bar"
                  data={responseTimesQ.data.overall.resolutionBuckets.map((b) => ({
                    label: b.label,
                    value: b.count,
                  }))}
                />
              </>
            )}
          </Stack>
        )}

        {tab === 'categories' && (
          <Stack>
            {categoriesQ.isLoading ? (
              <PanelBox>Carregando distribuição por categoria...</PanelBox>
            ) : categoriesQ.isError || !categoriesQ.data ? (
              <PanelBox>Não foi possível carregar as categorias.</PanelBox>
            ) : (
              <MetricChart
                title="Volume por categoria"
                whatItShows="participação de cada tema no recorte selecionado (categorias com menos de 10 relatos são suprimidas)."
                metricKey="category_mix"
                variant="bar"
                data={categoriesQ.data.items.map((item) => ({
                  label: CATEGORY_CONFIG[item.category as Category]?.label ?? item.category,
                  value: item.volume,
                  suppressed: item.suppressed,
                  extra: item.suppressed
                    ? 'Suprimido (<10)'
                    : `${formatRatioPct(item.share)} · Res: ${formatRatioPct(item.resolutionRate)}`,
                }))}
              />
            )}
          </Stack>
        )}

        {tab === 'export' && (
          <PanelBox>
            <h3 style={{ marginTop: 0 }}>Exportação de dados agregados</h3>
            <p>
              Gera arquivo CSV ou JSON contendo exclusivamente séries agregadas por dia, município e categoria, com cabeçalho de definições ({metaSource?.definitionVersion ?? 'v1.0.0'}) e supressão automática de linhas com menos de{' '}
              {metaSource?.minCellSize ?? 10} relatos. Nunca contém dados pessoais ou coordenadas exatas.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <ActionBtn type="button" disabled={exportLoading} onClick={() => handleExport('csv')}>
                Baixar CSV agregado
              </ActionBtn>
              <SecondaryBtn
                type="button"
                disabled={exportLoading}
                onClick={() => handleExport('json')}
              >
                Baixar JSON agregado
              </SecondaryBtn>
            </div>
            {exportMsg && <p style={{ marginBottom: 0, marginTop: 12 }}>{exportMsg}</p>}
          </PanelBox>
        )}
      </Content>
    </Page>
  )
}
