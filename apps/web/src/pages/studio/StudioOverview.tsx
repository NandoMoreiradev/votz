import { useMemo, useState, type ReactNode } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { fillAdStatDays, summarizeAdStats, type AdCampaignView, type AdDailyStatView } from '@votz/shared-types'
import {
  ArrowRight,
  ArrowSquareOut,
  ChatCircleText,
  CheckCircle,
  ClockCountdown,
  CurrencyCircleDollar,
  Cursor,
  Eye,
  Megaphone,
  Plus,
  Wallet,
  WarningCircle,
  type Icon,
} from '@phosphor-icons/react'
import { useAuthStore } from '../../store/auth.store'
import { usePolitician } from '../../hooks/usePoliticians'
import { useEntity } from '../../hooks/useEntities'
import { useCompany } from '../../hooks/useCompanies'
import { formatBRL, useAdAccounts, useAdCampaigns, useAdStats, useAdStatsByAd } from '../../hooks/useAds'
import { campaignDelivery, campaignTotals, indexStats, RESULT_OF } from '../../components/ads/ads-metrics'
import { TrendChart } from '../../components/studio/TrendChart'
import {
  CtaButton,
  DataTable,
  EmptyState,
  GhostButton,
  Muted,
  PageHeader,
  Panel,
  PanelBody,
  PanelFoot,
  PanelHead,
  Segmented,
  Skeleton,
  SplitLayout,
  Stack,
  StatCard,
  StatGrid,
  StatSkeletons,
  StatusPill,
  StudioPage,
  TableScroll,
  TaskItem,
  TaskList,
  percentChange,
  type Tone,
} from '../../components/studio/studio-ui'
import type { ActiveContext } from '../../types/api'
import { ORG_TYPE_LABEL, publicProfilePath, studioShortcuts } from './studio-nav'

const Figures = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
`

const Figure = styled.div<{ $tone: Tone }>`
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.neutral};

  strong {
    display: block;
    font-family: ${({ theme }) => theme.fonts.mono};
    font-size: 1.25rem;
    line-height: 1.2;
    color: ${({ $tone, theme }) => ($tone === 'action' ? theme.colors.action : $tone === 'positive' ? theme.colors.positiveText : $tone === 'info' ? theme.colors.info : theme.colors.text)};
  }
  span { font-size: 0.75rem; color: ${({ theme }) => theme.colors.muted}; }
`

const RateBar = styled.div`
  margin-top: 14px;

  .track { height: 8px; border-radius: 999px; background: ${({ theme }) => theme.colors.neutral}; overflow: hidden; display: flex; }
  .done { background: ${({ theme }) => theme.colors.positive}; }
  .doing { background: ${({ theme }) => theme.colors.info}; margin-left: 2px; }
  .label { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.8125rem; }
  .label strong { font-family: ${({ theme }) => theme.fonts.mono}; }
`

const ShortcutLink = styled(Link)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 18px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  color: inherit;
  transition: background 0.1s;

  &:last-child { border-bottom: none; }
  &:hover { background: ${({ theme }) => theme.colors.surfaceHover}; }
  .ico {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border-radius: 10px;
    background: ${({ theme }) => theme.colors.primary}0D;
    color: ${({ theme }) => theme.colors.primary};
  }
  .txt { flex: 1; min-width: 0; }
  strong { display: block; font-size: 0.875rem; }
  small { display: block; font-size: 0.75rem; color: ${({ theme }) => theme.colors.muted}; }
  > svg { color: ${({ theme }) => theme.colors.muted}; }
`

const NameLink = styled(Link)`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  &:hover { color: ${({ theme }) => theme.colors.info}; text-decoration: underline; }
`

const n = (value: number) => value.toLocaleString('pt-BR')
type Metric = 'spendCents' | 'viewableImpressions' | 'clicks'
const METRICS: { value: Metric; label: string }[] = [
  { value: 'spendCents', label: 'Gasto' },
  { value: 'viewableImpressions', label: 'Exibições' },
  { value: 'clicks', label: 'Cliques' },
]

function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
}

interface ReportFigures {
  total: number
  open: number
  inProgress: number
  resolved: number
}

/** Números dos relatos de cada tipo de perfil, no mesmo formato. */
function useReportFigures(ctx: ActiveContext): { figures: ReportFigures | null; loading: boolean } {
  const politician = usePolitician(ctx.type === 'POLITICIAN' ? ctx.id : '')
  const entity = useEntity(ctx.type === 'ENTITY' ? ctx.id : '')
  const company = useCompany(ctx.type === 'COMPANY' ? ctx.id : '')
  if (ctx.type === 'POLITICIAN') {
    const m = politician.data?.mandatometer
    return { loading: politician.isLoading, figures: m ? { total: m.total, open: m.open, inProgress: m.inProgress, resolved: m.resolved } : null }
  }
  const s = ctx.type === 'ENTITY' ? entity.data?.stats : company.data?.stats
  const loading = ctx.type === 'ENTITY' ? entity.isLoading : company.isLoading
  return { loading, figures: s ? { total: s.total, open: s.byStatus?.OPEN ?? 0, inProgress: s.byStatus?.IN_PROGRESS ?? 0, resolved: s.resolved } : null }
}

/** Para onde levar quem quer responder os relatos em aberto. */
function reportsInbox(ctx: ActiveContext): string {
  if (ctx.type === 'POLITICIAN') return '/mandato'
  if (ctx.type === 'ENTITY') return '/entidade/prazos'
  return publicProfilePath(ctx.type, ctx.id)
}

function ReportsPanel({ ctx, figures, loading }: { ctx: ActiveContext; figures: ReportFigures | null; loading: boolean }) {
  const rate = figures && figures.total > 0 ? Math.round((figures.resolved / figures.total) * 100) : 0
  const doing = figures && figures.total > 0 ? Math.round((figures.inProgress / figures.total) * 100) : 0
  return (
    <Panel>
      <PanelHead title="Relatos" hint="O que os cidadãos registraram para você." />
      <PanelBody>
        {loading ? <Skeleton $h={90} /> : !figures ? <Muted style={{ fontSize: '0.875rem' }}>Ainda não há relatos para mostrar.</Muted> : (
          <>
            <Figures>
              <Figure $tone="muted"><strong>{n(figures.total)}</strong><span>Total</span></Figure>
              <Figure $tone="action"><strong>{n(figures.open)}</strong><span>Sem resposta</span></Figure>
              <Figure $tone="info"><strong>{n(figures.inProgress)}</strong><span>Em andamento</span></Figure>
              <Figure $tone="positive"><strong>{n(figures.resolved)}</strong><span>Resolvidos</span></Figure>
            </Figures>
            <RateBar>
              <div className="label"><span>Taxa de resolução</span><strong>{rate}%</strong></div>
              <div className="track" role="img" aria-label={`${rate}% resolvidos e ${doing}% em andamento`}>
                <span className="done" style={{ width: `${rate}%` }} />
                {doing > 0 && <span className="doing" style={{ width: `${doing}%` }} />}
              </div>
            </RateBar>
          </>
        )}
      </PanelBody>
      <PanelFoot>
        <span>Responder rápido melhora o Votz Score.</span>
        <Link to={reportsInbox(ctx)}>Ver relatos</Link>
      </PanelFoot>
    </Panel>
  )
}

function Shortcuts({ ctx }: { ctx: ActiveContext }) {
  const shortcuts = studioShortcuts(ctx.type, ctx.id)
  return (
    <Panel>
      <PanelHead title="Atalhos" />
      <div>
        {shortcuts.map((item) => {
          const ItemIcon = item.icon
          return (
            <ShortcutLink key={item.to} to={item.to}>
              <span className="ico"><ItemIcon size={17} aria-hidden="true" /></span>
              <span className="txt"><strong>{item.label}</strong>{item.hint && <small>{item.hint}</small>}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </ShortcutLink>
          )
        })}
      </div>
    </Panel>
  )
}

interface Task { to: string; tone: Tone; icon: Icon; title: string; text?: string }

function Attention({ tasks, loading }: { tasks: Task[]; loading: boolean }) {
  return (
    <Panel>
      <PanelHead title="Precisa da sua atenção" />
      {loading ? <PanelBody><Skeleton $h={48} /></PanelBody> : tasks.length === 0 ? (
        <EmptyState icon={CheckCircle} title="Tudo em dia" text="Nada pendente agora. Quando algo precisar de você, aparece aqui." />
      ) : (
        <TaskList>
          {tasks.map((task) => <TaskItem key={task.title} {...task} />)}
        </TaskList>
      )}
    </Panel>
  )
}

function Header({ ctx, firstName, actions }: { ctx: ActiveContext; firstName: string; actions?: ReactNode }) {
  return (
    <PageHeader
      title={firstName ? `${greeting()}, ${firstName}` : 'Estúdio'}
      description={<>Você está gerenciando <strong>{ctx.name}</strong> ({ORG_TYPE_LABEL[ctx.type].toLowerCase()}). Este é o resumo de hoje.</>}
      actions={
        <>
          <GhostButton as={Link} to={publicProfilePath(ctx.type, ctx.id)}><ArrowSquareOut size={15} aria-hidden="true" /> Ver página pública</GhostButton>
          {actions}
        </>
      }
    />
  )
}

/** Primeira tela do Estúdio: painel com o que importa hoje, no jeito dos gerenciadores de anúncios. */
export function StudioOverview() {
  const { user, activeContext } = useAuthStore()
  if (!activeContext) return null
  const firstName = user?.name?.split(' ')[0] ?? ''
  const canViewAds = activeContext.type === 'COMPANY' && (activeContext.permissions.includes('MANAGE_ADS') || activeContext.permissions.includes('VIEW_ADS'))

  return canViewAds
    ? <CompanyOverview ctx={activeContext} firstName={firstName} />
    : <OrgOverview ctx={activeContext} firstName={firstName} />
}

/** Políticos, entidades e empresas sem acesso a anúncios. */
function OrgOverview({ ctx, firstName }: { ctx: ActiveContext; firstName: string }) {
  const { figures, loading } = useReportFigures(ctx)
  const tasks: Task[] = []
  if (figures && figures.open > 0) {
    tasks.push({ to: reportsInbox(ctx), tone: 'action', icon: WarningCircle, title: figures.open === 1 ? '1 relato sem resposta' : `${n(figures.open)} relatos sem resposta`, text: 'Cidadãos esperando um retorno seu.' })
  }
  if (figures && figures.inProgress > 0) {
    tasks.push({ to: reportsInbox(ctx), tone: 'info', icon: ClockCountdown, title: figures.inProgress === 1 ? '1 relato em andamento' : `${n(figures.inProgress)} relatos em andamento`, text: 'Atualize quando resolver para fechar o ciclo.' })
  }
  const rate = figures && figures.total > 0 ? Math.round((figures.resolved / figures.total) * 100) : null

  return (
    <StudioPage>
      <Header ctx={ctx} firstName={firstName} />
      {loading ? <StatSkeletons /> : (
        <StatGrid>
          <StatCard label="Relatos recebidos" value={figures ? n(figures.total) : '—'} />
          <StatCard label="Sem resposta" value={figures ? n(figures.open) : '—'} hint={figures && figures.open > 0 ? 'responda primeiro estes' : 'nenhum esperando'} />
          <StatCard label="Em andamento" value={figures ? n(figures.inProgress) : '—'} />
          <StatCard label="Taxa de resolução" value={rate === null ? '—' : `${rate}%`} hint={figures ? `${n(figures.resolved)} resolvidos` : undefined} />
        </StatGrid>
      )}
      <SplitLayout style={{ marginTop: 16 }}>
        <Stack>
          <ReportsPanel ctx={ctx} figures={figures} loading={loading} />
          <Shortcuts ctx={ctx} />
        </Stack>
        <Stack>
          <Attention tasks={tasks} loading={loading} />
        </Stack>
      </SplitLayout>
    </StudioPage>
  )
}

function CompanyOverview({ ctx, firstName }: { ctx: ActiveContext; firstName: string }) {
  const canManage = ctx.permissions.includes('MANAGE_ADS')
  const accounts = useAdAccounts(ctx.id)
  const account = accounts.data?.[0]
  const campaigns = useAdCampaigns(ctx.id, account?.id)
  const stats = useAdStats(ctx.id, account?.id, 30)
  const byAd = useAdStatsByAd(ctx.id, account?.id, 7)
  const { figures, loading: figuresLoading } = useReportFigures(ctx)
  const [metric, setMetric] = useState<Metric>('spendCents')

  const rows = useMemo(() => fillAdStatDays(stats.data ?? [], 30, todayInSaoPaulo()), [stats.data])
  const week = summarizeAdStats(rows.slice(-7))
  const lastWeek = summarizeAdStats(rows.slice(-14, -7))
  const balance = (accounts.data ?? []).reduce((sum, item) => sum + item.balanceCents, 0)
  const list = useMemo(() => campaigns.data ?? [], [campaigns.data])
  const index = useMemo(() => indexStats(byAd.data), [byAd.data])
  const activeBudget = list.filter((c) => c.status === 'ACTIVE').reduce((sum, c) => sum + c.adSets.reduce((s, set) => s + set.dailyBudgetCents, 0), 0)
  const daysLeft = activeBudget > 0 ? Math.floor(balance / activeBudget) : null
  const spark = (pick: (row: AdDailyStatView) => number) => rows.slice(-7).map(pick)

  const ads = list.flatMap((c) => c.adSets.flatMap((set) => set.ads.map((ad) => ({ campaign: c, ad }))))
  const live = ads.filter(({ campaign }) => campaign.status !== 'ARCHIVED')
  const rejected = live.filter(({ ad }) => ad.reviewStatus === 'REJECTED').length
  const pending = live.filter(({ ad }) => ad.reviewStatus === 'PENDING').length
  const notSent = live.filter(({ ad }) => ad.reviewStatus === 'NOT_SUBMITTED').length

  const tasks: Task[] = []
  if (!accounts.isLoading && !account) tasks.push({ to: '/estudio/anuncios', tone: 'info', icon: Megaphone, title: 'Crie sua conta de anúncios', text: 'Leva um minuto e você já pode montar a primeira campanha.' })
  if (account && balance <= 0) tasks.push({ to: '/estudio/anuncios/faturamento', tone: 'warning', icon: Wallet, title: 'Conta sem saldo', text: 'Campanhas ligadas não rodam sem saldo.' })
  else if (daysLeft !== null && daysLeft < 3) tasks.push({ to: '/estudio/anuncios/faturamento', tone: 'warning', icon: Wallet, title: 'O saldo acaba em breve', text: `Dá para ${daysLeft <= 0 ? 'menos de 1 dia' : daysLeft === 1 ? 'cerca de 1 dia' : `cerca de ${daysLeft} dias`} com o orçamento de hoje.` })
  if (rejected) tasks.push({ to: '/estudio/anuncios', tone: 'action', icon: WarningCircle, title: rejected === 1 ? '1 anúncio recusado' : `${rejected} anúncios recusados`, text: 'Veja o motivo, corrija e envie de novo.' })
  if (notSent) tasks.push({ to: '/estudio/anuncios', tone: 'muted', icon: Megaphone, title: notSent === 1 ? '1 anúncio não enviado' : `${notSent} anúncios não enviados`, text: 'Envie para revisão para poder ligar.' })
  if (pending) tasks.push({ to: '/estudio/anuncios', tone: 'info', icon: ClockCountdown, title: pending === 1 ? '1 anúncio em revisão' : `${pending} anúncios em revisão`, text: 'Você recebe um aviso quando a revisão terminar.' })
  if (figures && figures.open > 0) tasks.push({ to: reportsInbox(ctx), tone: 'action', icon: ChatCircleText, title: figures.open === 1 ? '1 relato sem resposta' : `${n(figures.open)} relatos sem resposta`, text: 'Responder rápido melhora a sua reputação.' })

  const top: AdCampaignView[] = list
    .filter((c) => c.status !== 'ARCHIVED')
    .map((c) => ({ c, spend: campaignTotals(c, index).spendCents }))
    .sort((a, b) => b.spend - a.spend || (a.c.status === 'ACTIVE' ? -1 : b.c.status === 'ACTIVE' ? 1 : 0))
    .slice(0, 5)
    .map(({ c }) => c)
  const metricLabel = METRICS.find((item) => item.value === metric)?.label ?? ''
  const format = (value: number) => (metric === 'spendCents' ? formatBRL(Math.round(value)) : n(Math.round(value)))
  const createLink = canManage && account ? `/estudio/anuncios/nova?conta=${account.id}` : null

  return (
    <StudioPage>
      <Header
        ctx={ctx}
        firstName={firstName}
        actions={createLink && <CtaButton as={Link} to={createLink}><Plus size={16} weight="bold" aria-hidden="true" /> Criar campanha</CtaButton>}
      />

      {accounts.isLoading || (account && stats.isLoading) ? <StatSkeletons /> : (
        <StatGrid>
          <StatCard label="Gasto em 7 dias" icon={CurrencyCircleDollar} value={formatBRL(week.spendCents)} delta={{ percent: percentChange(week.spendCents, lastWeek.spendCents) }} spark={spark((r) => r.spendCents)} />
          <StatCard label="Exibições vistas" icon={Eye} value={n(week.viewableImpressions)} delta={{ percent: percentChange(week.viewableImpressions, lastWeek.viewableImpressions) }} spark={spark((r) => r.viewableImpressions)} />
          <StatCard label="Cliques" icon={Cursor} value={n(week.clicks)} delta={{ percent: percentChange(week.clicks, lastWeek.clicks) }} spark={spark((r) => r.clicks)} />
          <StatCard label="Saldo de anúncios" icon={Wallet} value={formatBRL(balance)} hint={daysLeft !== null ? (daysLeft >= 30 ? 'dá para mais de 30 dias' : `dá para cerca de ${Math.max(daysLeft, 0)} ${daysLeft === 1 ? 'dia' : 'dias'}`) : 'nenhuma campanha ligada'} />
        </StatGrid>
      )}

      <SplitLayout style={{ marginTop: 16 }}>
        <Stack>
          <Panel>
            <PanelHead
              title="Desempenho dos anúncios"
              hint="Últimos 30 dias, por dia"
              actions={<Segmented label="Número do gráfico" value={metric} onChange={setMetric} options={METRICS} />}
            />
            <PanelBody>
              {stats.isLoading ? <Skeleton $h={240} /> : <TrendChart points={rows.map((row) => ({ day: row.day, value: row[metric] }))} format={format} label={metricLabel} />}
            </PanelBody>
            <PanelFoot><span>Exibição só conta como vista com metade do anúncio na tela por 1 segundo.</span><Link to="/estudio/anuncios/relatorio">Abrir relatório</Link></PanelFoot>
          </Panel>

          <Panel>
            <PanelHead title="Campanhas" hint="As que mais gastaram nos últimos 7 dias" />
            {campaigns.isLoading ? <PanelBody><Skeleton $h={120} /></PanelBody> : top.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="Nenhuma campanha ainda"
                text="Monte a primeira em poucos minutos: objetivo, público e o anúncio."
                action={createLink && <CtaButton as={Link} to={createLink}><Plus size={16} weight="bold" aria-hidden="true" /> Criar campanha</CtaButton>}
              />
            ) : (
              <TableScroll>
                <DataTable>
                  <thead>
                    <tr><th className="left">Campanha</th><th className="left">Veiculação</th><th>Resultados</th><th>Gasto</th></tr>
                  </thead>
                  <tbody>
                    {top.map((campaign) => {
                      const delivery = campaignDelivery(campaign, balance)
                      const totals = campaignTotals(campaign, index)
                      const meta = RESULT_OF[campaign.objective]
                      return (
                        <tr key={campaign.id}>
                          <td className="left"><NameLink to="/estudio/anuncios">{campaign.name}</NameLink></td>
                          <td className="left"><StatusPill $tone={delivery.tone}>{delivery.label}</StatusPill></td>
                          <td className="num">{n(meta.pick(totals))} <Muted style={{ fontFamily: 'inherit', fontSize: '0.75rem' }}>{meta.unit}</Muted></td>
                          <td className="num">{formatBRL(totals.spendCents)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </DataTable>
              </TableScroll>
            )}
            {top.length > 0 && <PanelFoot><span>{n(list.filter((c) => c.status !== 'ARCHIVED').length)} campanhas no total</span><Link to="/estudio/anuncios">Ver todas</Link></PanelFoot>}
          </Panel>
        </Stack>

        <Stack>
          <Attention tasks={tasks} loading={accounts.isLoading || campaigns.isLoading} />
          <ReportsPanel ctx={ctx} figures={figures} loading={figuresLoading} />
          <Shortcuts ctx={ctx} />
        </Stack>
      </SplitLayout>
    </StudioPage>
  )
}
