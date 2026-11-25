import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  AD_EDIT_COPY,
  AD_INTERESTS,
  AD_OBJECTIVE_LABELS,
  AD_REPORT_PERIODS,
  USER_GENDER_LABELS,
  fillAdStatDays,
  formatBrazilianMobile,
  summarizeAdStats,
  type AdCampaignView,
  type AdReportPeriod,
  type AdSetView,
  type AdView,
} from '@votz/shared-types'
import {
  Archive,
  ArrowSquareOut,
  ChartBar,
  CopySimple,
  CurrencyCircleDollar,
  Cursor,
  DotsThree,
  Eye,
  Image as ImageIcon,
  Megaphone,
  Percent,
  Plus,
  Stack as StackIcon,
  UsersThree,
  Warning,
  WarningCircle,
} from '@phosphor-icons/react'
import { useAuthStore } from '../../store/auth.store'
import { AdEditForm, AdSetEditForm } from '../../components/ads/AdEditForms'
import { AdMediaEditForm } from '../../components/ads/AdMediaEditForm'
import { AdMedia, adMediaItems } from '../../components/ads/AdMedia'
import {
  adsErrorMessage,
  formatBRL,
  useAdAccounts,
  useAdCampaigns,
  useAdStats,
  useAdStatsByAd,
  useCreateAdAccount,
  useDuplicateAdCampaign,
  useSetAdCampaignStatus,
  useSubmitAd,
} from '../../hooks/useAds'
import { ErrorMsg, Field, Input, Label, Select } from '../../components/ads/ads-ui'
import {
  DELIVERY_FILTERS,
  EMPTY_TOTALS,
  RESULT_OF,
  addTotals,
  adDelivery,
  adTotals,
  campaignDelivery,
  campaignTotals,
  costPerResult,
  ctrPercent,
  indexStats,
  matchesFilter,
  setDelivery,
  setTotals,
  type DeliveryFilter,
  type StatsIndex,
  type Totals,
} from '../../components/ads/ads-metrics'
import {
  Callout,
  CtaButton,
  DataTable,
  DefList,
  Drawer,
  EmptyState,
  FilterChip,
  FilterRow,
  GhostButton,
  IconButton,
  Muted,
  PageHeader,
  Panel,
  PanelBody,
  SearchInput,
  Segmented,
  Skeleton,
  StatCard,
  StatGrid,
  StatSkeletons,
  StatusPill,
  StudioPage,
  Switch,
  Tab,
  TabBar,
  TableScroll,
  Toolbar,
  percentChange,
} from '../../components/studio/studio-ui'

type Level = 'campaigns' | 'sets' | 'ads'

const NameButton = styled.button`
  all: unset;
  display: block;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;

  &:hover { color: ${({ theme }) => theme.colors.info}; text-decoration: underline; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 2px; border-radius: 2px; }
`

const SubLine = styled.span`
  display: block;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
`

const Unit = styled.span`
  display: block;
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 0.6875rem;
  color: ${({ theme }) => theme.colors.muted};
`

const NameCell = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 220px;
`

const Thumb = styled.span<{ $src: string | null }>`
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : theme.colors.neutral)};
  color: ${({ theme }) => theme.colors.muted};
`

const Check = styled.input`
  width: 16px;
  height: 16px;
  accent-color: ${({ theme }) => theme.colors.primary};
  cursor: pointer;
`

const SelectionBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 14px;
  background: ${({ theme }) => theme.colors.primary}0A;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`

const MenuContent = styled(DropdownMenu.Content)`
  z-index: 1100;
  min-width: 200px;
  padding: 6px;
  border-radius: ${({ theme }) => theme.radii.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  box-shadow: ${({ theme }) => theme.shadows.lg};
`

const MenuItem = styled(DropdownMenu.Item)<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  color: ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.text)};
  cursor: pointer;
  outline: none;
  &[data-highlighted] { background: ${({ theme }) => theme.colors.neutral}; }
  &[data-disabled] { opacity: 0.45; cursor: default; }
`

const Section = styled.section`
  margin-bottom: 14px;
  padding: 16px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme }) => theme.colors.white};
`

const SectionLabel = styled.p`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
`

const SectionTitle = styled.h3`
  margin: 0 0 4px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1rem;
  color: ${({ theme }) => theme.colors.text};
  overflow-wrap: anywhere;
`

const AdBox = styled.div`
  margin-top: 12px;
  padding: 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surfaceHover};
`

const ActionsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
`

const MiniStats = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 4px;

  div { padding: 8px 10px; border-radius: ${({ theme }) => theme.radii.md}; background: ${({ theme }) => theme.colors.neutral}; min-width: 0; }
  small { display: block; font-size: 0.6875rem; color: ${({ theme }) => theme.colors.muted}; }
  strong { font-family: ${({ theme }) => theme.fonts.mono}; font-size: 0.9375rem; }

  @media (max-width: 520px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`

const n = (value: number) => value.toLocaleString('pt-BR')
const pct = (value: number | null) => (value === null ? '—' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`)
const money = (cents: number | null) => (cents === null ? '—' : formatBRL(cents))
const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' })
const interestLabel = (id: string) => AD_INTERESTS.find((interest) => interest.id === id)?.label ?? id
const budgetOf = (campaign: AdCampaignView) => campaign.adSets.reduce((sum, set) => sum + set.dailyBudgetCents, 0)
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function audienceSummary(set: AdSetView): string {
  const where = set.cities.length ? set.cities.join(', ') : set.states.length ? set.states.join(', ') : 'Brasil todo'
  if (set.automaticAudience) return `${where} · público automático`
  const parts = [
    where,
    set.ageBands.length ? `${set.ageBands.join(', ')} anos` : 'todas as idades',
    set.genders.length ? set.genders.map((gender) => USER_GENDER_LABELS[gender]).join(', ') : null,
    set.interests.length ? set.interests.map(interestLabel).join(', ') : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

function destinationText(ad: AdView): string {
  const creative = ad.creative
  if (creative.destinationKind === 'URL') return creative.destinationUrl
  if (creative.destinationKind === 'PAGE_MESSAGE') return 'Chat da sua página no Votz'
  return `WhatsApp ${creative.whatsapp ? formatBrazilianMobile(creative.whatsapp.phone) : ''}`.trim()
}

function ResultCell({ objective, totals }: { objective: AdCampaignView['objective']; totals: Totals }) {
  const meta = RESULT_OF[objective]
  return <>{n(meta.pick(totals))}<Unit>{meta.unit}</Unit></>
}

function CostCell({ objective, totals }: { objective: AdCampaignView['objective']; totals: Totals }) {
  const cost = costPerResult(objective, totals)
  return <>{money(cost)}{cost !== null && <Unit>{RESULT_OF[objective].costLabel}</Unit>}</>
}

/** Estúdio › Anúncios › Campanhas: tabela no jeito dos gerenciadores de anúncios (campanhas, públicos e anúncios). */
export function StudioAds() {
  const activeContext = useAuthStore((s) => s.activeContext)
  const companyId = activeContext?.type === 'COMPANY' ? activeContext.id : ''
  const canManage = !!activeContext?.permissions.includes('MANAGE_ADS')
  const canView = canManage || !!activeContext?.permissions.includes('VIEW_ADS')

  const accounts = useAdAccounts(canView ? companyId : '')
  const [chosenAccount, setChosenAccount] = useState<string>()
  const [days, setDays] = useState<AdReportPeriod>(7)
  const accountId = chosenAccount ?? accounts.data?.[0]?.id
  const account = accounts.data?.find((item) => item.id === accountId)

  if (!activeContext || activeContext.type !== 'COMPANY') {
    return <Panel><EmptyState icon={Megaphone} title="Anúncios são para empresas" text="Troque para o perfil de uma empresa para anunciar no Votz." /></Panel>
  }
  if (!canView) {
    return <Panel><EmptyState icon={Megaphone} title="Sem acesso aos anúncios" text="Peça a quem administra a empresa a permissão de ver ou criar anúncios em Equipe e acesso." /></Panel>
  }

  return (
    <StudioPage>
      <PageHeader
        crumbs={[{ label: 'Anúncios' }, { label: 'Campanhas' }]}
        title="Campanhas"
        description="Todo anúncio aparece como “Patrocinado” e passa por revisão antes de rodar."
        actions={
          <>
            {accounts.data && accounts.data.length > 1 && (
              <Select aria-label="Conta de anúncios" value={accountId} onChange={(event) => setChosenAccount(event.target.value)} style={{ width: 'auto', minHeight: 36 }}>
                {accounts.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            )}
            <Segmented label="Período" value={days} onChange={setDays} options={AD_REPORT_PERIODS.map((period) => ({ value: period, label: `${period} dias` }))} />
            {canManage && account && (
              <CtaButton as={Link} to={`/estudio/anuncios/nova?conta=${account.id}`}><Plus size={16} weight="bold" aria-hidden="true" /> Criar campanha</CtaButton>
            )}
          </>
        }
      />

      {accounts.isLoading ? <StatSkeletons count={5} />
        : accounts.isError ? <Callout tone="action" icon={WarningCircle} role="alert">{adsErrorMessage(accounts.error)}</Callout>
        : !accounts.data?.length ? <NewAccount companyId={companyId} canManage={canManage} />
        : account && <Manager companyId={companyId} accountId={account.id} balanceCents={account.balanceCents} canManage={canManage} days={days} />}
    </StudioPage>
  )
}

function NewAccount({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const [name, setName] = useState('Conta principal')
  const create = useCreateAdAccount(companyId)
  if (!canManage) {
    return <Panel><EmptyState icon={Megaphone} title="Nenhuma conta de anúncios" text="Quem administra os anúncios da empresa ainda não criou uma conta." /></Panel>
  }
  return (
    <Panel>
      <EmptyState
        icon={Megaphone}
        title="Comece a anunciar no Votz"
        text="A conta de anúncios guarda suas campanhas e seu saldo. Só empresas verificadas podem anunciar."
        action={
          <form onSubmit={(event) => { event.preventDefault(); create.mutate(name) }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', textAlign: 'left' }}>
            <Field style={{ marginBottom: 0, minWidth: 240 }}>
              <Label htmlFor="ad-account-name">Nome da conta</Label>
              <Input id="ad-account-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
            </Field>
            <CtaButton type="submit" style={{ alignSelf: 'flex-end', height: 38 }} disabled={create.isPending || name.trim().length < 2}>{create.isPending ? 'Criando…' : 'Criar conta'}</CtaButton>
            {create.isError && <ErrorMsg role="alert" style={{ width: '100%' }}>{adsErrorMessage(create.error)}</ErrorMsg>}
          </form>
        }
      />
    </Panel>
  )
}

function Manager({ companyId, accountId, balanceCents, canManage, days }: { companyId: string; accountId: string; balanceCents: number; canManage: boolean; days: AdReportPeriod }) {
  const campaigns = useAdCampaigns(companyId, accountId)
  const byAd = useAdStatsByAd(companyId, accountId, days)
  // O dobro do período, para comparar com o período anterior (a API vai até 90 dias).
  const compare = days * 2 <= 90
  const daily = useAdStats(companyId, accountId, compare ? days * 2 : days)
  const index = useMemo(() => indexStats(byAd.data), [byAd.data])

  const [level, setLevel] = useState<Level>('campaigns')
  const [filter, setFilter] = useState<DeliveryFilter>('ALL')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const setStatus = useSetAdCampaignStatus(companyId, accountId)
  const duplicate = useDuplicateAdCampaign(companyId, accountId)
  const navigate = useNavigate()

  const summary = useMemo(() => {
    const rows = fillAdStatDays(daily.data ?? [], compare ? days * 2 : days, todayInSaoPaulo())
    const current = rows.slice(-days)
    return { current, now: summarizeAdStats(current), before: compare ? summarizeAdStats(rows.slice(0, days)) : null }
  }, [daily.data, days, compare])

  const list = useMemo(() => campaigns.data ?? [], [campaigns.data])
  const withDelivery = useMemo(() => list.map((campaign) => ({ campaign, delivery: campaignDelivery(campaign, balanceCents) })), [list, balanceCents])
  const q = search.trim().toLocaleLowerCase('pt-BR')
  const visibleCampaigns = withDelivery.filter(({ campaign, delivery }) => matchesFilter(campaign, delivery, filter) && (!q || campaign.name.toLocaleLowerCase('pt-BR').includes(q)))
  // Como nos gerenciadores de anúncios: com campanhas marcadas, as abas de públicos e anúncios mostram só o que é delas.
  const scope = selected.length ? withDelivery.filter(({ campaign }) => selected.includes(campaign.id)) : visibleCampaigns
  const sets = scope.flatMap(({ campaign }) => campaign.adSets.map((set) => ({ campaign, set })))
  const ads = sets.flatMap(({ campaign, set }) => set.ads.map((ad) => ({ campaign, set, ad })))
  const opened = list.find((campaign) => campaign.id === open) ?? null
  const running = withDelivery.filter(({ delivery }) => delivery.tone === 'positive').length
  const rejected = withDelivery.filter(({ delivery }) => delivery.tone === 'action').length
  const activeNoBalance = balanceCents <= 0 && list.some((campaign) => campaign.status === 'ACTIVE')

  const toggleSelected = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  const allVisibleSelected = visibleCampaigns.length > 0 && visibleCampaigns.every(({ campaign }) => selected.includes(campaign.id))

  async function bulk(status: 'ACTIVE' | 'PAUSED') {
    for (const id of selected) {
      const campaign = list.find((item) => item.id === id)
      if (!campaign || campaign.status === 'ARCHIVED' || campaign.status === status) continue
      try { await setStatus.mutateAsync({ campaignId: id, status }) } catch { break }
    }
  }

  const totalsRow = visibleCampaigns.reduce((sum, { campaign }) => addTotals(sum, campaignTotals(campaign, index)), EMPTY_TOTALS)
  const s = summary.now
  const b = summary.before
  const spark = (pick: (row: (typeof summary.current)[number]) => number) => summary.current.map(pick)

  return (
    <>
      {activeNoBalance && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="warning" icon={Warning} role="alert">
            <strong>Sua conta está sem saldo.</strong> Campanhas ligadas não rodam até você recarregar.{' '}
            <Link to="/estudio/anuncios/faturamento" style={{ fontWeight: 600, textDecoration: 'underline' }}>Recarregar agora</Link>
          </Callout>
        </div>
      )}

      {daily.isLoading ? <StatSkeletons count={5} /> : (
        <StatGrid $min={168}>
          <StatCard label="Gasto" icon={CurrencyCircleDollar} value={formatBRL(s.spendCents)} delta={b ? { percent: percentChange(s.spendCents, b.spendCents) } : undefined} spark={spark((r) => r.spendCents)} />
          <StatCard label="Exibições vistas" icon={Eye} value={n(s.viewableImpressions)} delta={b ? { percent: percentChange(s.viewableImpressions, b.viewableImpressions) } : undefined} spark={spark((r) => r.viewableImpressions)} />
          <StatCard label="Cliques" icon={Cursor} value={n(s.clicks)} delta={b ? { percent: percentChange(s.clicks, b.clicks) } : undefined} spark={spark((r) => r.clicks)} />
          <StatCard label="Taxa de cliques" icon={Percent} value={pct(s.ctrPercent)} hint={s.cpcCents !== null ? `${formatBRL(s.cpcCents)} por clique` : 'sem cliques ainda'} />
          <StatCard label="Campanhas rodando" icon={Megaphone} value={n(running)} hint={rejected ? `${rejected} com anúncio recusado` : `de ${n(list.filter((c) => c.status !== 'ARCHIVED').length)} campanhas`} />
        </StatGrid>
      )}

      <Panel style={{ marginTop: 16 }}>
        <TabBar role="tablist" aria-label="Nível" style={{ padding: '0 8px' }}>
          <Tab active={level === 'campaigns'} onClick={() => setLevel('campaigns')} icon={Megaphone} count={visibleCampaigns.length}>Campanhas</Tab>
          <Tab active={level === 'sets'} onClick={() => setLevel('sets')} icon={UsersThree} count={sets.length}>Públicos e orçamento</Tab>
          <Tab active={level === 'ads'} onClick={() => setLevel('ads')} icon={StackIcon} count={ads.length}>Anúncios</Tab>
        </TabBar>

        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar campanha pelo nome" label="Buscar campanha" />
          <FilterRow role="group" aria-label="Filtrar por situação">
            {DELIVERY_FILTERS.map((item) => (
              <FilterChip key={item.value} type="button" $active={filter === item.value} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</FilterChip>
            ))}
          </FilterRow>
        </Toolbar>

        {selected.length > 0 && (
          <SelectionBar role="status">
            {selected.length === 1 ? '1 campanha selecionada' : `${selected.length} campanhas selecionadas`}
            {level !== 'campaigns' && <Muted style={{ fontWeight: 400 }}>· mostrando só o que é delas</Muted>}
            {canManage && (
              <>
                <GhostButton type="button" style={{ height: 30 }} disabled={setStatus.isPending} onClick={() => bulk('ACTIVE')}>Ligar</GhostButton>
                <GhostButton type="button" style={{ height: 30 }} disabled={setStatus.isPending} onClick={() => bulk('PAUSED')}>Pausar</GhostButton>
              </>
            )}
            <GhostButton type="button" style={{ height: 30, marginLeft: 'auto' }} onClick={() => setSelected([])}>Limpar seleção</GhostButton>
          </SelectionBar>
        )}

        {(setStatus.isError || duplicate.isError) && !open && (
          <div style={{ padding: '10px 14px 0' }}>
            <Callout tone="action" icon={WarningCircle} role="alert">{adsErrorMessage(setStatus.error ?? duplicate.error)}</Callout>
          </div>
        )}

        {campaigns.isLoading ? (
          <div style={{ padding: 18, display: 'grid', gap: 12 }}>{[0, 1, 2].map((i) => <Skeleton key={i} $h={28} />)}</div>
        ) : campaigns.isError ? (
          <div style={{ padding: 14 }}><Callout tone="action" icon={WarningCircle} role="alert">{adsErrorMessage(campaigns.error)}</Callout></div>
        ) : !list.length ? (
          <EmptyState
            icon={Megaphone}
            title="Nenhuma campanha ainda"
            text="Uma campanha tem um objetivo, um público com orçamento por dia e um anúncio. Leva poucos minutos para montar."
            action={canManage && <CtaButton as={Link} to={`/estudio/anuncios/nova?conta=${accountId}`}><Plus size={16} weight="bold" aria-hidden="true" /> Criar a primeira campanha</CtaButton>}
          />
        ) : level === 'campaigns' ? (
          visibleCampaigns.length === 0 ? (
            <EmptyState title="Nada com esse filtro" text="Mude o filtro ou a busca para ver outras campanhas." action={<GhostButton type="button" onClick={() => { setFilter('ALL'); setSearch('') }}>Mostrar todas</GhostButton>} />
          ) : (
            <TableScroll>
              <DataTable>
                <thead>
                  <tr>
                    <th className="left sticky" style={{ width: 1 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
                        <Check type="checkbox" aria-label="Selecionar todas" checked={allVisibleSelected} onChange={() => setSelected(allVisibleSelected ? [] : visibleCampaigns.map(({ campaign }) => campaign.id))} />
                        <span>Ligada</span>
                      </span>
                    </th>
                    <th className="left">Campanha</th>
                    <th className="left">Veiculação</th>
                    <th>Orçamento</th>
                    <th>Resultados</th>
                    <th>Custo por resultado</th>
                    <th>Exibições vistas</th>
                    <th>Cliques</th>
                    <th>Taxa de cliques</th>
                    <th>Gasto</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCampaigns.map(({ campaign, delivery }) => {
                    const totals = campaignTotals(campaign, index)
                    const archived = campaign.status === 'ARCHIVED'
                    return (
                      <tr key={campaign.id} aria-selected={selected.includes(campaign.id)}>
                        <td className="left sticky">
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
                            <Check type="checkbox" aria-label={`Selecionar ${campaign.name}`} checked={selected.includes(campaign.id)} onChange={() => toggleSelected(campaign.id)} />
                            <Switch
                              label={campaign.status === 'ACTIVE' ? `Pausar ${campaign.name}` : `Ligar ${campaign.name}`}
                              checked={campaign.status === 'ACTIVE'}
                              disabled={!canManage || archived || setStatus.isPending}
                              onChange={(on) => setStatus.mutate({ campaignId: campaign.id, status: on ? 'ACTIVE' : 'PAUSED' })}
                            />
                          </span>
                        </td>
                        <td className="left">
                          <NameCell style={{ justifyContent: 'space-between' }}>
                            <span style={{ minWidth: 0 }}>
                              <NameButton type="button" onClick={() => setOpen(campaign.id)} title={campaign.name}>{campaign.name}</NameButton>
                              <SubLine>{AD_OBJECTIVE_LABELS[campaign.objective].label}</SubLine>
                            </span>
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <IconButton type="button" aria-label={`Mais ações de ${campaign.name}`}><DotsThree size={20} weight="bold" aria-hidden="true" /></IconButton>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <MenuContent align="end" sideOffset={4}>
                                <MenuItem onSelect={() => setOpen(campaign.id)}><ArrowSquareOut size={16} aria-hidden="true" /> Ver e editar</MenuItem>
                                <MenuItem onSelect={() => navigate('/estudio/anuncios/relatorio')}><ChartBar size={16} aria-hidden="true" /> Ver relatório</MenuItem>
                                {canManage && (
                                  <MenuItem disabled={duplicate.isPending} onSelect={() => { if (window.confirm(`Criar uma cópia desta campanha como rascunho? ${AD_EDIT_COPY.DUPLICATE_NO_MEDIA}`)) duplicate.mutate(campaign.id) }}>
                                    <CopySimple size={16} aria-hidden="true" /> Duplicar
                                  </MenuItem>
                                )}
                                {canManage && !archived && (
                                  <MenuItem $danger onSelect={() => { if (window.confirm('Arquivar esta campanha? Ela não poderá ser ligada de novo.')) setStatus.mutate({ campaignId: campaign.id, status: 'ARCHIVED' }) }}>
                                    <Archive size={16} aria-hidden="true" /> Arquivar
                                  </MenuItem>
                                )}
                              </MenuContent>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                          </NameCell>
                        </td>
                        <td className="left"><StatusPill $tone={delivery.tone} title={delivery.why}>{delivery.label}</StatusPill></td>
                        <td className="num">{formatBRL(budgetOf(campaign))}<Unit>por dia</Unit></td>
                        <td className="num"><ResultCell objective={campaign.objective} totals={totals} /></td>
                        <td className="num"><CostCell objective={campaign.objective} totals={totals} /></td>
                        <td className="num">{n(totals.viewableImpressions)}</td>
                        <td className="num">{n(totals.clicks)}</td>
                        <td className="num">{pct(ctrPercent(totals))}</td>
                        <td className="num">{formatBRL(totals.spendCents)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="left sticky" />
                    <td className="left">Total de {visibleCampaigns.length === 1 ? '1 campanha' : `${visibleCampaigns.length} campanhas`}<SubLine>últimos {days} dias</SubLine></td>
                    <td />
                    <td className="num">{formatBRL(visibleCampaigns.reduce((sum, { campaign }) => sum + (campaign.status === 'ACTIVE' ? budgetOf(campaign) : 0), 0))}<Unit>ligadas, por dia</Unit></td>
                    <td className="num dim">—</td>
                    <td className="num dim">—</td>
                    <td className="num">{n(totalsRow.viewableImpressions)}</td>
                    <td className="num">{n(totalsRow.clicks)}</td>
                    <td className="num">{pct(ctrPercent(totalsRow))}</td>
                    <td className="num">{formatBRL(totalsRow.spendCents)}</td>
                  </tr>
                </tfoot>
              </DataTable>
            </TableScroll>
          )
        ) : level === 'sets' ? (
          sets.length === 0 ? <EmptyState title="Nenhum público aqui" text="Mude o filtro ou a seleção de campanhas." /> : (
            <TableScroll>
              <DataTable>
                <thead>
                  <tr>
                    <th className="left sticky">Público</th>
                    <th className="left">Veiculação</th>
                    <th className="left">Quem vê</th>
                    <th>Orçamento</th>
                    <th className="left">Período</th>
                    <th>Resultados</th>
                    <th>Custo por resultado</th>
                    <th>Exibições vistas</th>
                    <th>Cliques</th>
                    <th>Gasto</th>
                  </tr>
                </thead>
                <tbody>
                  {sets.map(({ campaign, set }) => {
                    const totals = setTotals(set, index)
                    const delivery = setDelivery(set, campaign, balanceCents)
                    return (
                      <tr key={set.id}>
                        <td className="left sticky">
                          <NameButton type="button" onClick={() => setOpen(campaign.id)} title={set.name}>{set.name}</NameButton>
                          <SubLine>{campaign.name}</SubLine>
                        </td>
                        <td className="left"><StatusPill $tone={delivery.tone} title={delivery.why}>{delivery.label}</StatusPill></td>
                        <td className="left wrap" style={{ minWidth: 220, maxWidth: 320 }}><Muted>{audienceSummary(set)}</Muted></td>
                        <td className="num">{formatBRL(set.dailyBudgetCents)}<Unit>por dia</Unit></td>
                        <td className="left">{day(set.startAt)} – {set.endAt ? day(set.endAt) : 'sem fim'}</td>
                        <td className="num"><ResultCell objective={campaign.objective} totals={totals} /></td>
                        <td className="num"><CostCell objective={campaign.objective} totals={totals} /></td>
                        <td className="num">{n(totals.viewableImpressions)}</td>
                        <td className="num">{n(totals.clicks)}</td>
                        <td className="num">{formatBRL(totals.spendCents)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </DataTable>
            </TableScroll>
          )
        ) : (
          ads.length === 0 ? <EmptyState title="Nenhum anúncio aqui" text="Mude o filtro ou a seleção de campanhas." /> : (
            <TableScroll>
              <DataTable>
                <thead>
                  <tr>
                    <th className="left sticky">Anúncio</th>
                    <th className="left">Situação</th>
                    <th className="left">Botão e destino</th>
                    <th>Resultados</th>
                    <th>Exibições vistas</th>
                    <th>Cliques</th>
                    <th>Taxa de cliques</th>
                    <th>Escondido</th>
                    <th>Gasto</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.map(({ campaign, set, ad }) => {
                    const totals = adTotals(ad, index)
                    const delivery = adDelivery(ad, campaign, balanceCents)
                    const first = adMediaItems(ad.creative)[0]
                    return (
                      <tr key={ad.id}>
                        <td className="left sticky">
                          <NameCell>
                            <Thumb $src={first?.thumbUrl ?? first?.posterUrl ?? first?.url ?? null} aria-hidden="true">{!first && <ImageIcon size={18} />}</Thumb>
                            <span style={{ minWidth: 0 }}>
                              <NameButton type="button" onClick={() => setOpen(campaign.id)} title={ad.creative.headline}>{ad.creative.headline}</NameButton>
                              <SubLine>{campaign.name} › {set.name}</SubLine>
                            </span>
                          </NameCell>
                        </td>
                        <td className="left"><StatusPill $tone={delivery.tone} title={delivery.why}>{delivery.label}</StatusPill></td>
                        <td className="left"><span style={{ fontWeight: 600 }}>{ad.creative.ctaLabel}</span><SubLine style={{ maxWidth: 220 }}>{destinationText(ad)}</SubLine></td>
                        <td className="num"><ResultCell objective={campaign.objective} totals={totals} /></td>
                        <td className="num">{n(totals.viewableImpressions)}</td>
                        <td className="num">{n(totals.clicks)}</td>
                        <td className="num">{pct(ctrPercent(totals))}</td>
                        <td className="num">{n(totals.hides)}</td>
                        <td className="num">{formatBRL(totals.spendCents)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </DataTable>
            </TableScroll>
          )
        )}
        {byAd.isError && list.length > 0 && (
          <PanelBody style={{ paddingTop: 10, paddingBottom: 10 }}>
            <Muted style={{ fontSize: '0.75rem' }}>Os resultados por campanha não carregaram agora. Os totais da conta, acima, continuam valendo.</Muted>
          </PanelBody>
        )}
      </Panel>

      <Drawer
        open={!!opened}
        onClose={() => setOpen(null)}
        title={opened?.name ?? ''}
        subtitle={opened ? `${AD_OBJECTIVE_LABELS[opened.objective].label} · ${AD_OBJECTIVE_LABELS[opened.objective].billing.toLowerCase()}` : undefined}
      >
        {opened && <CampaignDetails campaign={opened} companyId={companyId} accountId={accountId} canManage={canManage} balanceCents={balanceCents} index={index} days={days} />}
      </Drawer>
    </>
  )
}

/** Gaveta lateral: tudo da campanha (público, orçamento, anúncio) com as edições, sem sair da tabela. */
function CampaignDetails({ campaign, companyId, accountId, canManage, balanceCents, index, days }: { campaign: AdCampaignView; companyId: string; accountId: string; canManage: boolean; balanceCents: number; index: StatsIndex; days: number }) {
  const setStatus = useSetAdCampaignStatus(companyId, accountId)
  const submit = useSubmitAd(companyId, accountId)
  const duplicate = useDuplicateAdCampaign(companyId, accountId)
  const [editingSet, setEditingSet] = useState<string | null>(null)
  const [editingAd, setEditingAd] = useState<string | null>(null)
  const [editingMedia, setEditingMedia] = useState<string | null>(null)
  const archived = campaign.status === 'ARCHIVED'
  const delivery = campaignDelivery(campaign, balanceCents)
  const totals = campaignTotals(campaign, index)
  const meta = RESULT_OF[campaign.objective]

  return (
    <>
      <Section>
        <SectionLabel>
          Campanha
          <StatusPill $tone={delivery.tone}>{delivery.label}</StatusPill>
        </SectionLabel>
        {delivery.why && <Muted style={{ display: 'block', fontSize: '0.8125rem', marginBottom: 10 }}>{delivery.why}</Muted>}
        <MiniStats aria-label={`Resultados dos últimos ${days} dias`}>
          <div><small>{capitalize(meta.unit)}</small><strong>{n(meta.pick(totals))}</strong></div>
          <div><small>Custo {meta.costLabel}</small><strong>{money(costPerResult(campaign.objective, totals))}</strong></div>
          <div><small>Cliques</small><strong>{n(totals.clicks)}</strong></div>
          <div><small>Gasto ({days} dias)</small><strong>{formatBRL(totals.spendCents)}</strong></div>
        </MiniStats>
        {canManage && (
          <ActionsRow>
            {!archived && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
                <Switch label={campaign.status === 'ACTIVE' ? 'Pausar campanha' : 'Ligar campanha'} checked={campaign.status === 'ACTIVE'} disabled={setStatus.isPending} onChange={(on) => setStatus.mutate({ campaignId: campaign.id, status: on ? 'ACTIVE' : 'PAUSED' })} />
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{campaign.status === 'ACTIVE' ? 'Ligada' : 'Desligada'}</span>
              </span>
            )}
            <GhostButton type="button" disabled={duplicate.isPending} onClick={() => { if (window.confirm(`Criar uma cópia desta campanha como rascunho? ${AD_EDIT_COPY.DUPLICATE_NO_MEDIA}`)) duplicate.mutate(campaign.id) }}>
              <CopySimple size={15} aria-hidden="true" /> {duplicate.isPending ? 'Copiando…' : 'Duplicar'}
            </GhostButton>
            {!archived && (
              <GhostButton type="button" disabled={setStatus.isPending} onClick={() => { if (window.confirm('Arquivar esta campanha? Ela não poderá ser ligada de novo.')) setStatus.mutate({ campaignId: campaign.id, status: 'ARCHIVED' }) }}>
                <Archive size={15} aria-hidden="true" /> Arquivar
              </GhostButton>
            )}
          </ActionsRow>
        )}
        {(setStatus.isError || duplicate.isError) && <ErrorMsg role="alert">{adsErrorMessage(setStatus.error ?? duplicate.error)}</ErrorMsg>}
      </Section>

      {campaign.adSets.map((set) => (
        <Section key={set.id}>
          <SectionLabel><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><UsersThree size={14} aria-hidden="true" /> Público e orçamento</span></SectionLabel>
          <SectionTitle>{set.name}</SectionTitle>
          <DefList style={{ marginTop: 10 }}>
            <dt>Quem vê</dt><dd>{audienceSummary(set)}{set.automaticAudience && <Muted> (o Votz encontra quem tem mais chance de se interessar)</Muted>}</dd>
            <dt>Orçamento</dt><dd>{formatBRL(set.dailyBudgetCents)} por dia</dd>
            <dt>Período</dt><dd>de {day(set.startAt)}{set.endAt ? ` até ${day(set.endAt)}` : ', sem data para acabar'}</dd>
          </DefList>
          {canManage && !archived && editingSet !== set.id && (
            <ActionsRow><GhostButton type="button" onClick={() => setEditingSet(set.id)}>Editar público e orçamento</GhostButton></ActionsRow>
          )}
          {editingSet === set.id && <AdSetEditForm set={set} companyId={companyId} accountId={accountId} onDone={() => setEditingSet(null)} />}

          {set.ads.map((ad) => {
            const adState = adDelivery(ad, campaign, balanceCents)
            const media = adMediaItems(ad.creative)
            return (
              <AdBox key={ad.id}>
                <SectionLabel>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><StackIcon size={14} aria-hidden="true" /> Anúncio</span>
                  <StatusPill $tone={adState.tone}>{adState.label}</StatusPill>
                </SectionLabel>
                <SectionTitle as="p" style={{ fontSize: '0.9375rem' }}>{ad.creative.headline}</SectionTitle>
                <Muted style={{ display: 'block', fontSize: '0.875rem', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{ad.creative.body}</Muted>
                <AdMedia items={media} maxWidth={280} />
                <DefList style={{ marginTop: 10 }}>
                  <dt>Botão</dt><dd>{ad.creative.ctaLabel}</dd>
                  <dt>Leva para</dt><dd>{destinationText(ad)}</dd>
                </DefList>
                {ad.reviewNote && (
                  <div style={{ marginTop: 10 }}>
                    <Callout tone="action" icon={WarningCircle}><strong>Motivo da recusa:</strong> {ad.reviewNote}</Callout>
                  </div>
                )}
                {canManage && !archived && editingAd !== ad.id && editingMedia !== ad.id && (
                  <ActionsRow>
                    <GhostButton type="button" onClick={() => setEditingAd(ad.id)}>Editar texto</GhostButton>
                    <GhostButton type="button" onClick={() => setEditingMedia(ad.id)}>{media.length ? 'Trocar fotos ou vídeo' : 'Adicionar fotos ou vídeo'}</GhostButton>
                    {(ad.reviewStatus === 'NOT_SUBMITTED' || ad.reviewStatus === 'REJECTED') && (
                      <CtaButton type="button" disabled={submit.isPending} onClick={() => submit.mutate(ad.id)}>
                        {ad.reviewStatus === 'REJECTED' ? 'Corrigi, enviar de novo' : 'Enviar para revisão'}
                      </CtaButton>
                    )}
                  </ActionsRow>
                )}
                {editingMedia === ad.id && <AdMediaEditForm ad={ad} companyId={companyId} accountId={accountId} onDone={() => setEditingMedia(null)} />}
                {editingAd === ad.id && <AdEditForm ad={ad} companyId={companyId} accountId={accountId} onDone={() => setEditingAd(null)} />}
              </AdBox>
            )
          })}
        </Section>
      ))}
      {submit.isError && <ErrorMsg role="alert">{adsErrorMessage(submit.error)}</ErrorMsg>}
    </>
  )
}
