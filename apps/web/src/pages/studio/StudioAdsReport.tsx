import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import { AD_OBJECTIVE_LABELS, AD_REPORT_PERIODS, fillAdStatDays, summarizeAdStats, type AdDailyStatView, type AdReportPeriod } from '@votz/shared-types'
import { ChartBar, ChatCircleText, CurrencyCircleDollar, Cursor, Eye, Target, WarningCircle } from '@phosphor-icons/react'
import { useAuthStore } from '../../store/auth.store'
import { adsErrorMessage, formatBRL, useAdAccounts, useAdCampaigns, useAdStats, useAdStatsByAd } from '../../hooks/useAds'
import { Select } from '../../components/ads/ads-ui'
import { campaignTotals, costPerResult, ctrPercent, indexStats, RESULT_OF } from '../../components/ads/ads-metrics'
import { TrendChart } from '../../components/studio/TrendChart'
import {
  Callout,
  DataTable,
  EmptyState,
  Muted,
  PageHeader,
  Panel,
  PanelBody,
  PanelHead,
  Segmented,
  Skeleton,
  StatCard,
  StatGrid,
  StatSkeletons,
  StudioPage,
  TableScroll,
  percentChange,
} from '../../components/studio/studio-ui'

type Metric = 'viewableImpressions' | 'clicks' | 'messageConversations' | 'conversions' | 'spendCents'
const METRIC_LABEL: Record<Metric, string> = {
  viewableImpressions: 'Exibições vistas',
  clicks: 'Cliques',
  messageConversations: 'Conversas iniciadas',
  conversions: 'Conversões',
  spendCents: 'Gasto',
}

const Details = styled.details`
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    cursor: pointer;
    list-style: none;
    font-family: ${({ theme }) => theme.fonts.heading};
    font-weight: ${({ theme }) => theme.fontWeights.bold};
  }
  summary::-webkit-details-marker { display: none; }
  summary::after { content: '+'; font-family: ${({ theme }) => theme.fonts.mono}; color: ${({ theme }) => theme.colors.muted}; }
  &[open] summary::after { content: '−'; }
  &[open] summary { border-bottom: 1px solid ${({ theme }) => theme.colors.border}; }
`

const Note = styled.p`
  margin: 0;
  padding: 12px 18px;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.muted};
`

function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`
const n = (value: number) => value.toLocaleString('pt-BR')
const pct = (value: number | null) => (value === null ? '—' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`)
const money = (cents: number | null) => (cents === null ? '—' : formatBRL(cents))

function Report({ companyId, accountId, days }: { companyId: string; accountId: string; days: AdReportPeriod }) {
  const [metric, setMetric] = useState<Metric>('viewableImpressions')
  // Pede o dobro do período para comparar com o período anterior (a API vai até 90 dias).
  const compare = days * 2 <= 90
  const span = compare ? days * 2 : days
  const stats = useAdStats(companyId, accountId, span)
  const campaigns = useAdCampaigns(companyId, accountId)
  const byAd = useAdStatsByAd(companyId, accountId, days)
  const all = useMemo(() => fillAdStatDays(stats.data ?? [], span, todayInSaoPaulo()), [stats.data, span])
  const rows = all.slice(-days)
  const totals = useMemo(() => summarizeAdStats(rows), [rows])
  const before = compare ? summarizeAdStats(all.slice(0, days)) : null
  const index = useMemo(() => indexStats(byAd.data), [byAd.data])
  const empty = !stats.isLoading && totals.impressions === 0
  const delta = (pick: (t: typeof totals) => number, upIsGood = true) => (before ? { percent: percentChange(pick(totals), pick(before)), upIsGood } : undefined)
  const spark = (pick: (row: AdDailyStatView) => number) => rows.map(pick)
  const format = (value: number) => (metric === 'spendCents' ? formatBRL(Math.round(value)) : n(Math.round(value)))
  const byCampaign = (campaigns.data ?? [])
    .map((campaign) => ({ campaign, totals: campaignTotals(campaign, index) }))
    .filter(({ campaign, totals: t }) => t.impressions > 0 || campaign.status === 'ACTIVE')
    .sort((a, b) => b.totals.spendCents - a.totals.spendCents)

  if (stats.isError) return <Callout tone="action" icon={WarningCircle} role="alert">{adsErrorMessage(stats.error)}</Callout>

  const card = (key: Metric, icon: typeof Eye, value: string, hint: string, d?: ReturnType<typeof delta>) => (
    <StatCard key={key} label={METRIC_LABEL[key]} icon={icon} value={value} hint={hint} delta={d} spark={spark((r) => r[key])} active={metric === key} onClick={() => setMetric(key)} />
  )

  return (
    <>
      {stats.isLoading ? <StatSkeletons count={5} /> : (
        <StatGrid $min={180}>
          {card('viewableImpressions', Eye, n(totals.viewableImpressions), `de ${n(totals.impressions)} entregues`, delta((t) => t.viewableImpressions))}
          {card('clicks', Cursor, n(totals.clicks), `taxa ${pct(totals.ctrPercent)}`, delta((t) => t.clicks))}
          {card('spendCents', CurrencyCircleDollar, formatBRL(totals.spendCents), totals.cpcCents !== null ? `${formatBRL(totals.cpcCents)} por clique` : `${money(totals.cpmCents)} por mil`, delta((t) => t.spendCents))}
          {card('messageConversations', ChatCircleText, n(totals.messageConversations), totals.messageConversations > 0 ? `${money(totals.costPerMessageCents)} por conversa` : 'anúncios de mensagens', delta((t) => t.messageConversations))}
          {card('conversions', Target, n(totals.conversions), totals.conversions > 0 ? `${money(totals.cpaCents)} cada` : 'ligue em Conversões', delta((t) => t.conversions))}
        </StatGrid>
      )}

      <Panel style={{ marginTop: 16 }}>
        <PanelHead
          title={METRIC_LABEL[metric]}
          hint={`Por dia, nos últimos ${days} dias. Toque em um número acima para trocar o gráfico.`}
        />
        <PanelBody>
          {stats.isLoading ? <Skeleton $h={260} /> : (
            <>
              {empty && <Muted style={{ display: 'block', fontSize: '0.8125rem', marginBottom: 8 }}>Ainda não há exibições neste período. Assim que uma campanha ligada entregar anúncios, os números aparecem aqui.</Muted>}
              <TrendChart points={rows.map((row) => ({ day: row.day, value: row[metric] }))} format={format} label={METRIC_LABEL[metric]} height={260} />
            </>
          )}
        </PanelBody>
      </Panel>

      <Panel style={{ marginTop: 16 }}>
        <PanelHead title="Por campanha" hint={`Resultados de cada campanha nos últimos ${days} dias.`} />
        {campaigns.isLoading || byAd.isLoading ? <PanelBody><Skeleton $h={100} /></PanelBody>
          : byAd.isError ? <Note>Os números por campanha não carregaram agora. Os totais acima continuam valendo.</Note>
          : byCampaign.length === 0 ? <EmptyState icon={ChartBar} title="Nenhuma campanha rodou neste período" text={<>Ligue uma campanha em <Link to="/estudio/anuncios" style={{ textDecoration: 'underline' }}>Campanhas</Link> para ver os resultados aqui.</>} />
          : (
            <TableScroll>
              <DataTable>
                <thead>
                  <tr>
                    <th className="left sticky">Campanha</th>
                    <th>Resultados</th>
                    <th>Custo por resultado</th>
                    <th>Exibições vistas</th>
                    <th>Cliques</th>
                    <th>Taxa de cliques</th>
                    <th>Gasto</th>
                  </tr>
                </thead>
                <tbody>
                  {byCampaign.map(({ campaign, totals: t }) => {
                    const meta = RESULT_OF[campaign.objective]
                    const cost = costPerResult(campaign.objective, t)
                    return (
                      <tr key={campaign.id}>
                        <td className="left sticky">
                          <strong style={{ fontWeight: 600 }}>{campaign.name}</strong>
                          <Muted style={{ display: 'block', fontSize: '0.75rem' }}>{AD_OBJECTIVE_LABELS[campaign.objective].label}</Muted>
                        </td>
                        <td className="num">{n(meta.pick(t))}<Muted style={{ display: 'block', fontSize: '0.6875rem', fontFamily: 'inherit' }}>{meta.unit}</Muted></td>
                        <td className="num">{money(cost)}{cost !== null && <Muted style={{ display: 'block', fontSize: '0.6875rem', fontFamily: 'inherit' }}>{meta.costLabel}</Muted>}</td>
                        <td className="num">{n(t.viewableImpressions)}</td>
                        <td className="num">{n(t.clicks)}</td>
                        <td className="num">{pct(ctrPercent(t))}</td>
                        <td className="num">{formatBRL(t.spendCents)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </DataTable>
            </TableScroll>
          )}
      </Panel>

      <Panel style={{ marginTop: 16 }}>
        <Details>
          <summary>Números por dia</summary>
          <Note>
            Exibição só conta como vista com metade do anúncio na tela por 1 segundo. Tráfego inválido não é cobrado. Conversa iniciada é uma
            pessoa que tocou no anúncio de mensagens e escreveu para a sua página; conta uma vez por clique e você não vê quem foi.
          </Note>
          <TableScroll>
            <DataTable>
              <thead>
                <tr><th className="left">Dia</th><th>Entregues</th><th>Vistas</th><th>Cliques</th><th>Conversas</th><th>Conversões</th><th>Escondidos</th><th>Gasto</th></tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((row) => (
                  <tr key={row.day}>
                    <td className="left">{shortDay(row.day)}</td>
                    <td className="num">{n(row.impressions)}</td>
                    <td className="num">{n(row.viewableImpressions)}</td>
                    <td className="num">{n(row.clicks)}</td>
                    <td className="num">{n(row.messageConversations)}</td>
                    <td className="num">{n(row.conversions)}</td>
                    <td className="num">{n(row.hides)}</td>
                    <td className="num">{formatBRL(row.spendCents)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TableScroll>
        </Details>
      </Panel>
    </>
  )
}

export function StudioAdsReport() {
  const activeContext = useAuthStore((s) => s.activeContext)
  const companyId = activeContext?.type === 'COMPANY' ? activeContext.id : ''
  const canView = !!activeContext?.permissions.includes('MANAGE_ADS') || !!activeContext?.permissions.includes('VIEW_ADS')
  const accounts = useAdAccounts(canView ? companyId : '')
  const [chosen, setChosen] = useState<string>()
  const [days, setDays] = useState<AdReportPeriod>(7)
  const accountId = chosen ?? accounts.data?.[0]?.id

  if (!activeContext || activeContext.type !== 'COMPANY') {
    return <Panel><EmptyState icon={ChartBar} title="Relatório é para empresas" text="Troque para o perfil de uma empresa para ver os resultados dos anúncios." /></Panel>
  }
  if (!canView) {
    return <Panel><EmptyState icon={ChartBar} title="Sem acesso ao relatório" text="Peça a quem administra a empresa a permissão de ver anúncios em Equipe e acesso." /></Panel>
  }

  return (
    <StudioPage>
      <PageHeader
        crumbs={[{ label: 'Anúncios', to: '/estudio/anuncios' }, { label: 'Relatório' }]}
        title="Relatório"
        description="Quantas pessoas viram e tocaram nos seus anúncios, e quanto foi gasto."
        actions={
          <>
            {accounts.data && accounts.data.length > 1 && (
              <Select aria-label="Conta de anúncios" value={accountId} onChange={(event) => setChosen(event.target.value)} style={{ width: 'auto', minHeight: 36 }}>
                {accounts.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            )}
            <Segmented label="Período" value={days} onChange={setDays} options={AD_REPORT_PERIODS.map((period) => ({ value: period, label: `${period} dias` }))} />
          </>
        }
      />
      {accounts.isLoading ? <StatSkeletons count={5} />
        : accounts.isError ? <Callout tone="action" icon={WarningCircle} role="alert">{adsErrorMessage(accounts.error)}</Callout>
        : !accounts.data?.length ? <Panel><EmptyState icon={ChartBar} title="Nenhuma conta de anúncios" text={<>Crie a conta em <Link to="/estudio/anuncios" style={{ textDecoration: 'underline' }}>Campanhas</Link> para ver resultados.</>} /></Panel>
        : accountId && <Report companyId={companyId} accountId={accountId} days={days} />}
    </StudioPage>
  )
}
