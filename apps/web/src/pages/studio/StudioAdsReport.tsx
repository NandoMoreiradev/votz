import { useMemo, useState } from 'react'
import styled from 'styled-components'
import { AD_REPORT_PERIODS, fillAdStatDays, summarizeAdStats, type AdDailyStatView, type AdReportPeriod } from '@votz/shared-types'
import { useAuthStore } from '../../store/auth.store'
import { adsErrorMessage, formatBRL, useAdAccounts, useAdStats } from '../../hooks/useAds'
import { Card, CardTitle, Chip, Chips, ErrorMsg, Field, Head, Hint, Label, Mono, Select, Sub, Title } from '../../components/ads/ads-ui'

type Metric = 'viewableImpressions' | 'clicks' | 'conversions' | 'spendCents'
const METRICS: { value: Metric; label: string }[] = [
  { value: 'viewableImpressions', label: 'Exibições vistas' },
  { value: 'clicks', label: 'Cliques' },
  { value: 'conversions', label: 'Conversões' },
  { value: 'spendCents', label: 'Gasto' },
]

const Tiles = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
`

const Tile = styled.div`
  padding: 14px 16px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
`

const TileLabel = styled.div`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
`

const TileValue = styled.div`
  margin-top: 4px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 1.5rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const ChartBox = styled.div`
  margin-top: 12px;
  overflow-x: auto;
`

const Bar = styled.rect`
  fill: ${({ theme }) => theme.colors.primary};
  &:hover { fill: ${({ theme }) => theme.colors.action}; }
`

const AxisText = styled.text`
  fill: ${({ theme }) => theme.colors.muted};
  font-size: 11px;
  font-family: ${({ theme }) => theme.fonts.mono};
`

const GridLine = styled.line`
  stroke: ${({ theme }) => theme.colors.border};
  stroke-width: 1;
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  th, td { padding: 8px 6px; text-align: right; border-bottom: 1px solid ${({ theme }) => theme.colors.border}; }
  th:first-child, td:first-child { text-align: left; }
  th { color: ${({ theme }) => theme.colors.muted}; font-weight: ${({ theme }) => theme.fontWeights.semibold}; }
`

const TableWrap = styled.div`
  overflow-x: auto;
`

function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`
const number = (value: number) => value.toLocaleString('pt-BR')
const percent = (value: number | null) => (value === null ? '—' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`)
const money = (cents: number | null) => (cents === null ? '—' : formatBRL(cents))

function metricValue(row: AdDailyStatView, metric: Metric): number {
  return row[metric]
}

function formatMetric(value: number, metric: Metric): string {
  return metric === 'spendCents' ? formatBRL(value) : number(value)
}

/** Gráfico de barras por dia. A tabela logo abaixo traz os mesmos números para quem não enxerga o gráfico. */
function DailyChart({ rows, metric }: { rows: AdDailyStatView[]; metric: Metric }) {
  const width = Math.max(480, rows.length * 14)
  const height = 200
  const pad = { top: 12, right: 8, bottom: 26, left: 52 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const max = Math.max(1, ...rows.map((row) => metricValue(row, metric)))
  const slot = innerW / rows.length
  const barW = Math.max(3, slot - 3)
  const label = METRICS.find((item) => item.value === metric)?.label ?? ''
  const total = rows.reduce((sum, row) => sum + metricValue(row, metric), 0)
  const ticks = [0, 0.5, 1]
  const labelEvery = Math.max(1, Math.ceil(rows.length / 8))

  return (
    <ChartBox>
      <svg role="img" aria-label={`${label} por dia. Total no período: ${formatMetric(total, metric)}.`} viewBox={`0 0 ${width} ${height}`} width="100%" style={{ minWidth: width }}>
        {ticks.map((tick) => {
          const y = pad.top + innerH - tick * innerH
          return (
            <g key={tick}>
              <GridLine x1={pad.left} x2={width - pad.right} y1={y} y2={y} />
              <AxisText x={pad.left - 6} y={y + 4} textAnchor="end">{formatMetric(Math.round(max * tick), metric)}</AxisText>
            </g>
          )
        })}
        {rows.map((row, index) => {
          const value = metricValue(row, metric)
          const barH = value > 0 ? Math.max(2, (value / max) * innerH) : 0
          const x = pad.left + index * slot + (slot - barW) / 2
          return (
            <g key={row.day}>
              <Bar x={x} y={pad.top + innerH - barH} width={barW} height={barH} rx={2}>
                <title>{`${shortDay(row.day)}: ${formatMetric(value, metric)}`}</title>
              </Bar>
              {index % labelEvery === 0 && (
                <AxisText x={x + barW / 2} y={height - 8} textAnchor="middle">{shortDay(row.day)}</AxisText>
              )}
            </g>
          )
        })}
      </svg>
    </ChartBox>
  )
}

function Report({ companyId, accountId }: { companyId: string; accountId: string }) {
  const [days, setDays] = useState<AdReportPeriod>(7)
  const [metric, setMetric] = useState<Metric>('viewableImpressions')
  const stats = useAdStats(companyId, accountId, days)
  const rows = useMemo(() => fillAdStatDays(stats.data ?? [], days, todayInSaoPaulo()), [stats.data, days])
  const totals = useMemo(() => summarizeAdStats(rows), [rows])
  const empty = !stats.isLoading && totals.impressions === 0

  return (
    <>
      <Card>
        <Chips>
          {AD_REPORT_PERIODS.map((period) => (
            <Chip key={period} type="button" $selected={days === period} onClick={() => setDays(period)}>Últimos {period} dias</Chip>
          ))}
        </Chips>
      </Card>

      {stats.isError ? <ErrorMsg role="alert">{adsErrorMessage(stats.error)}</ErrorMsg> : stats.isLoading ? <Hint>Carregando relatório…</Hint> : (
        <>
          <Tiles>
            <Tile><TileLabel>Exibições vistas</TileLabel><TileValue>{number(totals.viewableImpressions)}</TileValue><Hint>de {number(totals.impressions)} entregues</Hint></Tile>
            <Tile><TileLabel>Cliques</TileLabel><TileValue>{number(totals.clicks)}</TileValue><Hint>taxa de cliques {percent(totals.ctrPercent)}</Hint></Tile>
            <Tile><TileLabel>Gasto</TileLabel><TileValue>{formatBRL(totals.spendCents)}</TileValue><Hint>por mil exibições {money(totals.cpmCents)}</Hint></Tile>
            <Tile><TileLabel>Custo por clique</TileLabel><TileValue>{money(totals.cpcCents)}</TileValue><Hint>{totals.hides === 1 ? '1 pessoa escondeu o anúncio' : `${number(totals.hides)} pessoas esconderam o anúncio`}</Hint></Tile>
            <Tile>
              <TileLabel>Conversões</TileLabel>
              <TileValue>{number(totals.conversions)}</TileValue>
              <Hint>{totals.conversions > 0 ? `${formatBRL(totals.conversionValueCents)} em valor · ${money(totals.cpaCents)} por conversão` : 'Ligue em Conversões para contar'}</Hint>
            </Tile>
          </Tiles>

          <Card>
            <CardTitle>Dia a dia</CardTitle>
            <Chips style={{ marginTop: 8 }}>
              {METRICS.map((item) => <Chip key={item.value} type="button" $selected={metric === item.value} onClick={() => setMetric(item.value)}>{item.label}</Chip>)}
            </Chips>
            {empty && <Hint style={{ marginTop: 12 }}>Ainda não há exibições neste período. Assim que uma campanha ligada entregar anúncios, os números aparecem aqui.</Hint>}
            <DailyChart rows={rows} metric={metric} />
          </Card>

          <Card>
            <CardTitle>Números por dia</CardTitle>
            <Hint style={{ marginBottom: 8 }}>Exibição só conta como vista com metade do anúncio na tela por 1 segundo. Tráfego inválido não é cobrado.</Hint>
            <TableWrap>
              <Table>
                <thead>
                  <tr><th>Dia</th><th>Entregues</th><th>Vistas</th><th>Cliques</th><th>Conversões</th><th>Escondidos</th><th>Gasto</th></tr>
                </thead>
                <tbody>
                  {[...rows].reverse().map((row) => (
                    <tr key={row.day}>
                      <td>{shortDay(row.day)}</td>
                      <td><Mono>{number(row.impressions)}</Mono></td>
                      <td><Mono>{number(row.viewableImpressions)}</Mono></td>
                      <td><Mono>{number(row.clicks)}</Mono></td>
                      <td><Mono>{number(row.conversions)}</Mono></td>
                      <td><Mono>{number(row.hides)}</Mono></td>
                      <td><Mono>{formatBRL(row.spendCents)}</Mono></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Card>
        </>
      )}
    </>
  )
}

export function StudioAdsReport() {
  const activeContext = useAuthStore((s) => s.activeContext)
  const companyId = activeContext?.type === 'COMPANY' ? activeContext.id : ''
  const canView = !!activeContext?.permissions.includes('MANAGE_ADS') || !!activeContext?.permissions.includes('VIEW_ADS')
  const accounts = useAdAccounts(canView ? companyId : '')
  const [chosen, setChosen] = useState<string>()
  const accountId = chosen ?? accounts.data?.[0]?.id

  if (!activeContext || activeContext.type !== 'COMPANY') {
    return <Card><CardTitle>Relatório é para empresas</CardTitle><Hint>Troque para o perfil de uma empresa para ver os resultados dos anúncios.</Hint></Card>
  }
  if (!canView) {
    return <Card><CardTitle>Sem acesso ao relatório</CardTitle><Hint>Peça a quem administra a empresa a permissão de ver anúncios em Equipe e acesso.</Hint></Card>
  }

  return (
    <>
      <Head>
        <div>
          <Title>Relatório</Title>
          <Sub>Quantas pessoas viram e tocaram nos seus anúncios, e quanto foi gasto.</Sub>
        </div>
      </Head>
      {accounts.isLoading ? <Hint>Carregando…</Hint>
        : accounts.isError ? <ErrorMsg role="alert">{adsErrorMessage(accounts.error)}</ErrorMsg>
        : !accounts.data?.length ? <Card><CardTitle>Nenhuma conta de anúncios</CardTitle><Hint>Crie a conta em Anúncios › Campanhas para ver resultados.</Hint></Card>
        : (
          <>
            {accounts.data.length > 1 && (
              <Card>
                <Field style={{ marginBottom: 0 }}>
                  <Label htmlFor="report-account">Conta de anúncios</Label>
                  <Select id="report-account" value={accountId} onChange={(event) => setChosen(event.target.value)}>
                    {accounts.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </Select>
                </Field>
              </Card>
            )}
            {accountId && <Report companyId={companyId} accountId={accountId} />}
          </>
        )}
    </>
  )
}
