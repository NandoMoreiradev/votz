import {
  Category,
  ReportStatus,
  formatDateBr,
  getAccountabilityStatusLabel,
  getAlertFrequencyLabel,
  getAlertRuleTypeLabel,
  getReportStatusLabel,
  getShareCardFormatLabel,
  getWebhookDeliveryStatusLabel,
  getWebhookEventLabel,
} from '@votz/shared-types'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import styled from 'styled-components'
import { PlanLockedPreview } from '../components/analytics/PlanLockedPreview'
import { PageNavbar } from '../components/layout/StudioEmbed'
import { CATEGORY_CONFIG } from '../components/ui/Badge'
import { extractPlanRequired } from '../hooks/useAnalytics'
import {
  AlertChannel,
  AlertFrequency,
  AlertRuleType,
  MandateInboxItem,
  MandateSortBy,
  WebhookEventType,
  useAccountabilityReports,
  useAddOrgNote,
  useAddOrgTag,
  useAlertHistory,
  useAlertRules,
  useCreateAccountabilityReport,
  useCreateAlertRule,
  useCreateReplyTemplate,
  useCreateWebhook,
  useDeleteAlertRule,
  useDeleteOrgTag,
  useDeleteReplyTemplate,
  useDeleteWebhook,
  useDigestSettings,
  useGenerateShareCard,
  useMandateInbox,
  useMandateOnboarding,
  useQuickRespond,
  useReplyTemplates,
  useShareCards,
  useToggleAlertRule,
  useUpdateDigestSettings,
  useUpdateMandateGoal,
  useUpdateOnboarding,
  useWebhookDeliveries,
  useWebhooks,
} from '../hooks/useMandate'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'

const Page = styled.main`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
  padding-bottom: ${({ theme }) => theme.spacing[8]};
`

const Container = styled.div`
  max-width: 1480px;
  margin: 0 auto;
  padding: 24px 32px;

  @media (max-width: 820px) { padding: 16px; }
`

/** Lista de cartões em colunas (alertas, modelos, relatos...). */
const ItemsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(480px, 1fr));
  gap: ${({ theme }) => theme.spacing[4]};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
  align-items: start;

  & > section { margin-bottom: 0; }

  @media (max-width: 560px) { grid-template-columns: minmax(0, 1fr); }
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
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const Subtitle = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  margin-top: ${({ theme }) => theme.spacing[1]};
`

const NavTabs = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing[2]};
  margin-bottom: ${({ theme }) => theme.spacing[5]};
`

const TabLink = styled(Link)<{ $active: boolean }>`
  padding: 8px 16px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.white};
  color: ${({ theme, $active }) =>
    $active ? theme.colors.white : theme.colors.text};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: 600;
`

const Card = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing[5]};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`

const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: ${({ theme }) => theme.spacing[4]};

  @media (max-width: 820px) { grid-template-columns: minmax(0, 1fr); }
`

const KpiBox = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 14px 16px;
`

const KpiLabel = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
  font-weight: 600;
`

const KpiValue = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 1.5rem;
  line-height: 1.2;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
  margin-top: ${({ theme }) => theme.spacing[1]};
`

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.spacing[3]};
`

const Input = styled.input`
  padding: ${({ theme }) => theme.spacing[2]} ${({ theme }) => theme.spacing[3]};
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`

const Select = styled.select`
  padding: ${({ theme }) => theme.spacing[2]} ${({ theme }) => theme.spacing[3]};
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`

const Textarea = styled.textarea`
  width: 100%;
  min-height: 90px;
  padding: ${({ theme }) => theme.spacing[3]};
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-family: ${({ theme }) => theme.fonts.body};
`

const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  padding: ${({ theme }) => theme.spacing[2]} ${({ theme }) => theme.spacing[4]};
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid
    ${({ theme, $variant }) =>
      $variant === 'danger'
        ? theme.colors.action
        : $variant === 'secondary'
          ? theme.colors.border
          : theme.colors.primary};
  background: ${({ theme, $variant }) =>
    $variant === 'danger'
      ? theme.colors.action
      : $variant === 'secondary'
        ? theme.colors.white
        : theme.colors.primary};
  color: ${({ theme, $variant }) =>
    $variant === 'secondary' ? theme.colors.text : theme.colors.white};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: 600;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const TagBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing[1]};
  padding: 2px ${({ theme }) => theme.spacing[2]};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.text};
`

const MutedNote = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
`

const ErrorBox = styled.div`
  padding: ${({ theme }) => theme.spacing[3]};
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.action};
  background: ${({ theme }) => theme.colors.surfaceHover};
  color: ${({ theme }) => theme.colors.action};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-bottom: ${({ theme }) => theme.spacing[3]};
`

const SecretBanner = styled.div`
  padding: ${({ theme }) => theme.spacing[4]};
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.positive};
  background: ${({ theme }) => theme.colors.surfaceHover};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
  word-break: break-all;
`

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
]

function ReportInboxCard({
  item,
  canUseTemplates,
  templates,
}: {
  item: MandateInboxItem
  canUseTemplates: boolean
  templates: Array<{ id: string; title: string; body: string }>
}) {
  const [expanded, setExpanded] = useState(false)
  const [message, setMessage] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [newStatus, setNewStatus] = useState<ReportStatus | ''>('')
  const [tagInput, setTagInput] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [errMsg, setErrMsg] = useState('')

  const respondMut = useQuickRespond()
  const addTagMut = useAddOrgTag()
  const delTagMut = useDeleteOrgTag()
  const addNoteMut = useAddOrgNote()

  const handleSubmitResponse = async () => {
    setErrMsg('')
    try {
      await respondMut.mutateAsync({
        reportId: item.id,
        message: templateId ? undefined : message || undefined,
        templateId: templateId || undefined,
        newStatus: newStatus || undefined,
        advocate: true,
      })
      setMessage('')
      setTemplateId('')
      setExpanded(false)
    } catch (e: unknown) {
      setErrMsg((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao responder')
    }
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Row style={{ gap: 8, marginBottom: 6 }}>
            <TagBadge>#{item.protocol}</TagBadge>
            <TagBadge>{CATEGORY_CONFIG[item.category]?.label ?? item.category}</TagBadge>
            <TagBadge>{getReportStatusLabel(item.status)}</TagBadge>
            <TagBadge>Pressão {Math.round(item.pressureScore)}</TagBadge>
            {item.advocatedByMe && <TagBadge>Avocado pelo gabinete</TagBadge>}
          </Row>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>{item.title}</h3>
          <MutedNote>
            {item.neighborhood ? `${item.neighborhood} · ` : ''}
            {item.city}/{item.state} · {item.supportCount} apoios ·{' '}
            {new Date(item.createdAt).toLocaleDateString('pt-BR')}
          </MutedNote>
        </div>

        <Row>
          <Link to={`/relatos/${item.id}`} style={{ fontSize: 13 }}>
            Ver relato público
          </Link>
          <Button type="button" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Fechar' : 'Atuar neste relato'}
          </Button>
        </Row>
      </Row>

      {item.internalTags.length > 0 && (
        <Row style={{ marginTop: 10 }}>
          <MutedNote>Tags internas (uso exclusivo do gabinete):</MutedNote>
          {item.internalTags.map((t) => (
            <TagBadge key={t.id}>
              {t.label}
              {canUseTemplates && (
                <button
                  type="button"
                  aria-label={`Remover tag ${t.label}`}
                  onClick={() => delTagMut.mutate({ reportId: item.id, tagId: t.id })}
                  style={{ border: 'none', background: 'transparent', fontWeight: 700 }}
                >
                  ×
                </button>
              )}
            </TagBadge>
          ))}
        </Row>
      )}

      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          {errMsg && <ErrorBox>{errMsg}</ErrorBox>}

          <Row style={{ marginBottom: 10 }}>
            {canUseTemplates && templates.length > 0 && (
              <Select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                aria-label="Selecionar modelo de resposta"
              >
                <option value="">Resposta personalizada</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    Modelo: {tpl.title}
                  </option>
                ))}
              </Select>
            )}

            <Select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as ReportStatus | '')}
              aria-label="Alterar status"
            >
              <option value="">Manter status atual ({getReportStatusLabel(item.status)})</option>
              <option value={ReportStatus.UNDER_REVIEW}>Em análise</option>
              <option value={ReportStatus.IN_PROGRESS}>Em andamento</option>
              <option value={ReportStatus.RESOLVED}>Resolvido</option>
            </Select>
          </Row>

          {!templateId && (
            <Textarea
              placeholder="Escreva a resposta oficial do mandato (visível ao cidadão na linha do tempo)..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          )}

          <Row style={{ marginTop: 10 }}>
            <Button
              type="button"
              disabled={respondMut.isPending}
              onClick={handleSubmitResponse}
            >
              {respondMut.isPending ? 'Enviando...' : 'Avocar e enviar andamento'}
            </Button>
          </Row>

          {canUseTemplates && (
            <div style={{ marginTop: 16 }}>
              <MutedNote style={{ marginBottom: 6 }}>
                Anotações e tags internas (visíveis apenas à sua equipe, nunca exibidas ao público):
              </MutedNote>
              <Row style={{ marginBottom: 8 }}>
                <Input
                  placeholder="Nova tag interna (ex: Secretaria de Obras)"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                />
                <Button
                  type="button"
                  $variant="secondary"
                  disabled={!tagInput.trim() || addTagMut.isPending}
                  onClick={async () => {
                    await addTagMut.mutateAsync({ reportId: item.id, label: tagInput.trim() })
                    setTagInput('')
                  }}
                >
                  + Tag interna
                </Button>
              </Row>

              <Row>
                <Input
                  style={{ flex: 1, minWidth: 240 }}
                  placeholder="Adicionar nota interna do gabinete..."
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                />
                <Button
                  type="button"
                  $variant="secondary"
                  disabled={!noteInput.trim() || addNoteMut.isPending}
                  onClick={async () => {
                    await addNoteMut.mutateAsync({ reportId: item.id, content: noteInput.trim() })
                    setNoteInput('')
                  }}
                >
                  Salvar nota interna
                </Button>
              </Row>

              {item.internalNotes.map((n) => (
                <MutedNote key={n.id} style={{ marginTop: 6 }}>
                  • {n.content} ({new Date(n.createdAt).toLocaleDateString('pt-BR')})
                </MutedNote>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export function MandatoPortal() {
  const { pathname } = useLocation()
  const { activeContext } = useAuthStore()

  const activeTab = pathname.startsWith('/mandato/alertas')
    ? 'alertas'
    : pathname.startsWith('/mandato/modelos')
      ? 'modelos'
      : pathname.startsWith('/mandato/prestacao')
        ? 'prestacao'
        : pathname.startsWith('/mandato/cartoes')
          ? 'cartoes'
          : pathname.startsWith('/mandato/webhooks')
            ? 'webhooks'
            : pathname.startsWith('/mandato/resumo')
              ? 'resumo'
              : 'caixa'

  // Inbox filters state
  const [statusFilter, setStatusFilter] = useState<ReportStatus | ''>('')
  const [qFilter, setQFilter] = useState('')
  const [sortBy, setSortBy] = useState<MandateSortBy>('pressure')
  const [catFilter, setCatFilter] = useState<Category | ''>('')
  const [stalledFilter, setStalledFilter] = useState<number | ''>('')
  const [onlyUnanswered, setOnlyUnanswered] = useState(false)
  const [onlyAdvocated, setOnlyAdvocated] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')

  const inboxQuery = useMandateInbox(
    {
      status: statusFilter || undefined,
      q: qFilter || undefined,
      sortBy,
      category: catFilter || undefined,
      stalledDays: stalledFilter || undefined,
      onlyUnanswered: onlyUnanswered || undefined,
      onlyAdvocated: onlyAdvocated || undefined,
    },
    activeTab === 'caixa',
  )
  const onboardingQuery = useMandateOnboarding(activeTab === 'caixa')
  const updateOnboardingMut = useUpdateOnboarding()
  const updateGoalMut = useUpdateMandateGoal()

  const templatesQuery = useReplyTemplates(
    activeTab === 'modelos' || activeTab === 'caixa',
  )
  const alertsQuery = useAlertRules(activeTab === 'alertas')
  const alertHistoryQuery = useAlertHistory(activeTab === 'alertas')
  const accQuery = useAccountabilityReports(activeTab === 'prestacao')
  const shareCardsQuery = useShareCards(activeTab === 'cartoes')
  const webhooksQuery = useWebhooks(activeTab === 'webhooks')
  const digestQuery = useDigestSettings(activeTab === 'resumo')

  // Forms local state
  const [alertName, setAlertName] = useState('')
  const [alertType, setAlertType] = useState<AlertRuleType>('NEW_REPORT')
  const [alertMinPressure, setAlertMinPressure] = useState('50')
  const [alertFreq, setAlertFreq] = useState<AlertFrequency>('IMMEDIATE')
  const [alertError, setAlertError] = useState('')
  const createAlertMut = useCreateAlertRule()
  const toggleAlertMut = useToggleAlertRule()
  const deleteAlertMut = useDeleteAlertRule()

  const [tplTitle, setTplTitle] = useState('')
  const [tplBody, setTplBody] = useState(
    'Protocolo {{protocolo}} registrado em {{bairro}} ({{categoria}}). Retorno estimado em {{prazo}}.',
  )
  const [tplErr, setTplErr] = useState('')
  const createTplMut = useCreateReplyTemplate()
  const deleteTplMut = useDeleteReplyTemplate()

  const [pdfFrom, setPdfFrom] = useState(isoDaysAgo(30))
  const [pdfTo, setPdfTo] = useState(isoToday())
  const [pdfErr, setPdfErr] = useState('')
  const createPdfMut = useCreateAccountabilityReport()

  const [cardFormat, setCardFormat] = useState<'FEED' | 'STORIES'>('FEED')
  const [cardFrom, setCardFrom] = useState(isoDaysAgo(30))
  const [cardTo, setCardTo] = useState(isoToday())
  const [cardErr, setCardErr] = useState('')
  const genCardMut = useGenerateShareCard()

  const [whUrl, setWhUrl] = useState('')
  const [whEvents, setWhEvents] = useState<WebhookEventType[]>([
    'REPORT_CREATED',
    'REPORT_STATUS_CHANGED',
  ])
  const [whSecretOnce, setWhSecretOnce] = useState('')
  const [whErr, setWhErr] = useState('')
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null)
  const createWhMut = useCreateWebhook()
  const deleteWhMut = useDeleteWebhook()
  const deliveriesQuery = useWebhookDeliveries(selectedEndpointId)

  const [digestEnabled, setDigestEnabled] = useState<boolean | null>(null)
  const [digestDay, setDigestDay] = useState<number | null>(null)
  const [digestHour, setDigestHour] = useState<number | null>(null)
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [digestSaved, setDigestSaved] = useState('')
  const [digestErr, setDigestErr] = useState('')
  const updateDigestMut = useUpdateDigestSettings()

  const handleDownloadPdf = async (reportId: string) => {
    try {
      const { data } = await api.get<{ signedUrl: string }>(
        `/accountability/reports/${reportId}/download`,
      )
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch {
      setPdfErr('Não foi possível obter o link temporário do PDF.')
    }
  }

  return (
    <Page>
      <PageNavbar />
      <Container>
        <Header>
          <div>
            <Title>Portal do Mandato</Title>
            <Subtitle>
              {activeContext
                ? `Atuando como ${activeContext.name}`
                : 'Troque para o contexto de político ou entidade no menu superior para operar o gabinete.'}
            </Subtitle>
          </div>
          <Link to="/painel-dados">Ir para Painel de Dados →</Link>
        </Header>

        <NavTabs aria-label="Navegação do mandato">
          <TabLink to="/mandato" $active={activeTab === 'caixa'}>
            Caixa do mandato
          </TabLink>
          <TabLink to="/mandato/alertas" $active={activeTab === 'alertas'}>
            Alertas
          </TabLink>
          <TabLink to="/mandato/modelos" $active={activeTab === 'modelos'}>
            Modelos de resposta
          </TabLink>
          <TabLink to="/mandato/prestacao" $active={activeTab === 'prestacao'}>
            Prestação em PDF
          </TabLink>
          <TabLink to="/mandato/cartoes" $active={activeTab === 'cartoes'}>
            Cartões compartilháveis
          </TabLink>
          <TabLink to="/mandato/webhooks" $active={activeTab === 'webhooks'}>
            Webhooks
          </TabLink>
          <TabLink to="/mandato/resumo" $active={activeTab === 'resumo'}>
            Resumo semanal
          </TabLink>
        </NavTabs>

        {activeTab === 'caixa' && (
          <>
            {onboardingQuery.data &&
              !onboardingQuery.data.dismissed &&
              onboardingQuery.data.completedCount < onboardingQuery.data.totalCount && (
                <Card>
                  <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <strong>
                        Primeiros passos do gabinete ({onboardingQuery.data.completedCount}/
                        {onboardingQuery.data.totalCount})
                      </strong>
                      <MutedNote>
                        Configure o território, equipe e metas para aproveitar o mandato no Votz.
                      </MutedNote>
                    </div>
                    <Row>
                      <Button
                        type="button"
                        $variant="secondary"
                        onClick={() => updateOnboardingMut.mutate({ confirmTerritory: true })}
                      >
                        Confirmar território
                      </Button>
                      <Button
                        type="button"
                        $variant="secondary"
                        onClick={() => updateOnboardingMut.mutate({ dismissed: true })}
                      >
                        Ocultar
                      </Button>
                    </Row>
                  </Row>
                  <Row>
                    {onboardingQuery.data.steps.map((s) => (
                      <Link key={s.key} to={s.actionPath}>
                        <TagBadge>
                          {s.completed ? '✓' : '○'} {s.title}
                        </TagBadge>
                      </Link>
                    ))}
                  </Row>
                </Card>
              )}

            {inboxQuery.isError && extractPlanRequired(inboxQuery.error) ? (
              <PlanLockedPreview
                featureName="Caixa do Mandato"
                requiredPlan={extractPlanRequired(inboxQuery.error)?.requiredPlan}
              />
            ) : (
              inboxQuery.data && (
                <>
                  <KpiGrid>
                    <KpiBox>
                      <KpiLabel>RELATOS SEM RESPOSTA NO TERRITÓRIO</KpiLabel>
                      <KpiValue>{inboxQuery.data.kpis.unansweredCount}</KpiValue>
                    </KpiBox>
                    <KpiBox>
                      <KpiLabel>AVOCADOS EM ANDAMENTO</KpiLabel>
                      <KpiValue>{inboxQuery.data.kpis.advocatedInProgressCount}</KpiValue>
                    </KpiBox>
                    <KpiBox>
                      <KpiLabel>RESOLVIDOS NESTE MÊS</KpiLabel>
                      <KpiValue>
                        {inboxQuery.data.kpis.resolvedThisMonthCount}
                        {inboxQuery.data.kpis.monthlyGoal !== null
                          ? ` / ${inboxQuery.data.kpis.monthlyGoal}`
                          : ''}
                      </KpiValue>
                      {inboxQuery.data.capabilities.editableGoal && (
                        <Row style={{ marginTop: 8 }}>
                          <Input
                            type="number"
                            min={1}
                            placeholder="Meta mensal"
                            value={goalDraft}
                            onChange={(e) => setGoalDraft(e.target.value)}
                            style={{ width: 110 }}
                          />
                          <Button
                            type="button"
                            $variant="secondary"
                            onClick={() => {
                              const parsed = Number(goalDraft)
                              if (parsed >= 1) updateGoalMut.mutate(parsed)
                            }}
                          >
                            Definir meta
                          </Button>
                        </Row>
                      )}
                    </KpiBox>
                  </KpiGrid>

                  <Card>
                    <Row style={{ marginBottom: 12 }}>
                      <Input
                        placeholder="Buscar por título ou bairro..."
                        value={qFilter}
                        onChange={(e) => setQFilter(e.target.value)}
                      />
                      <Select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as ReportStatus | '')}
                      >
                        <option value="">Todos os status</option>
                        <option value={ReportStatus.OPEN}>Aberto</option>
                        <option value={ReportStatus.UNDER_REVIEW}>Em análise</option>
                        <option value={ReportStatus.IN_PROGRESS}>Em andamento</option>
                        <option value={ReportStatus.RESOLVED}>Resolvido</option>
                      </Select>
                      <Select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as MandateSortBy)}
                      >
                        <option value="pressure">Maior pressão</option>
                        <option value="oldest">Mais antigos</option>
                        <option value="recent">Mais recentes</option>
                      </Select>
                    </Row>

                    {inboxQuery.data.capabilities.advancedFilters ? (
                      <Row>
                        <Select
                          value={catFilter}
                          onChange={(e) => setCatFilter(e.target.value as Category | '')}
                        >
                          <option value="">Todas categorias (avançado)</option>
                          {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                            <option key={key} value={key}>
                              {cfg.label}
                            </option>
                          ))}
                        </Select>
                        <Input
                          type="number"
                          min={1}
                          placeholder="Parados há N dias"
                          value={stalledFilter}
                          onChange={(e) =>
                            setStalledFilter(e.target.value ? Number(e.target.value) : '')
                          }
                          style={{ width: 160 }}
                        />
                        <label style={{ fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={onlyUnanswered}
                            onChange={(e) => setOnlyUnanswered(e.target.checked)}
                          />{' '}
                          Só sem resposta
                        </label>
                        <label style={{ fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={onlyAdvocated}
                            onChange={(e) => setOnlyAdvocated(e.target.checked)}
                          />{' '}
                          Só avocados por mim
                        </label>
                      </Row>
                    ) : (
                      <MutedNote>
                        Filtros avançados (categoria, célula geográfica e relatos parados) e meta
                        mensal estão disponíveis a partir do plano Mandato.
                      </MutedNote>
                    )}
                  </Card>

                  {inboxQuery.data.items.length === 0 ? (
                    <Card>Nenhum relato encontrado neste recorte territorial.</Card>
                  ) : (
                    <ItemsGrid>
                      {inboxQuery.data.items.map((item) => (
                        <ReportInboxCard
                          key={item.id}
                          item={item}
                          canUseTemplates={inboxQuery.data.capabilities.replyTemplates}
                          templates={templatesQuery.data?.items ?? []}
                        />
                      ))}
                    </ItemsGrid>
                  )}
                </>
              )
            )}
          </>
        )}

        {activeTab === 'alertas' && (
          <>
            {alertsQuery.isError && extractPlanRequired(alertsQuery.error) ? (
              <PlanLockedPreview
                featureName="Alertas configuráveis por regra"
                requiredPlan={extractPlanRequired(alertsQuery.error)?.requiredPlan}
              />
            ) : (
              <>
                <Card>
                  <h2 style={{ fontSize: 18, marginBottom: 12 }}>
                    Regras de alerta ({alertsQuery.data?.rules.length ?? 0}/
                    {alertsQuery.data?.limit ?? '—'})
                  </h2>
                  {alertError && <ErrorBox>{alertError}</ErrorBox>}
                  <Row>
                    <Input
                      placeholder="Nome da regra (ex: Saúde acima de pressão 60)"
                      value={alertName}
                      onChange={(e) => setAlertName(e.target.value)}
                      style={{ minWidth: 260 }}
                    />
                    <Select
                      value={alertType}
                      onChange={(e) => setAlertType(e.target.value as AlertRuleType)}
                    >
                      <option value="NEW_REPORT">Novo relato na área</option>
                      <option value="PRESSURE_THRESHOLD">Pressão acima de X</option>
                      <option value="SURTO">Surto detectado</option>
                      <option value="STALLED_REPORT">Relato parado há N dias</option>
                    </Select>
                    {alertType === 'PRESSURE_THRESHOLD' && (
                      <Input
                        type="number"
                        value={alertMinPressure}
                        onChange={(e) => setAlertMinPressure(e.target.value)}
                        style={{ width: 100 }}
                      />
                    )}
                    <Select
                      value={alertFreq}
                      onChange={(e) => setAlertFreq(e.target.value as AlertFrequency)}
                    >
                      <option value="IMMEDIATE">Imediato</option>
                      <option value="DAILY_DIGEST">Digest diário</option>
                    </Select>
                    <Button
                      type="button"
                      disabled={createAlertMut.isPending || !alertName.trim()}
                      onClick={async () => {
                        setAlertError('')
                        try {
                          await createAlertMut.mutateAsync({
                            name: alertName.trim(),
                            ruleType: alertType,
                            wholeArea: true,
                            minPressure:
                              alertType === 'PRESSURE_THRESHOLD'
                                ? Number(alertMinPressure) || 50
                                : undefined,
                            stalledDays: alertType === 'STALLED_REPORT' ? 7 : undefined,
                            channels: ['IN_APP', 'EMAIL'] as AlertChannel[],
                            frequency: alertFreq,
                          })
                          setAlertName('')
                        } catch (e: unknown) {
                          setAlertError(
                            (e as { response?: { data?: { message?: string } } })?.response?.data
                              ?.message ?? 'Erro ao criar regra',
                          )
                        }
                      }}
                    >
                      Criar alerta
                    </Button>
                  </Row>
                </Card>

                <ItemsGrid>
                {alertsQuery.data?.rules.map((r) => (
                  <Card key={r.id}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <div>
                        <strong>{r.name}</strong>
                        <MutedNote>
                          Tipo: {getAlertRuleTypeLabel(r.ruleType)} · Frequência:{' '}
                          {getAlertFrequencyLabel(r.frequency)} ·{' '}
                          {r.active ? 'Ativa' : 'Pausada'}
                        </MutedNote>
                      </div>
                      <Row>
                        <Button
                          type="button"
                          $variant="secondary"
                          onClick={() =>
                            toggleAlertMut.mutate({ id: r.id, active: !r.active })
                          }
                        >
                          {r.active ? 'Pausar' : 'Ativar'}
                        </Button>
                        <Button
                          type="button"
                          $variant="danger"
                          onClick={() => deleteAlertMut.mutate(r.id)}
                        >
                          Excluir
                        </Button>
                      </Row>
                    </Row>
                  </Card>
                ))}
                </ItemsGrid>

                {alertHistoryQuery.data && alertHistoryQuery.data.length > 0 && (
                  <Card>
                    <h3 style={{ fontSize: 16, marginBottom: 8 }}>Disparos recentes</h3>
                    {alertHistoryQuery.data.map((h) => (
                      <MutedNote key={h.id}>
                        {new Date(h.deliveredAt).toLocaleString('pt-BR')} · {h.rule.name} (
                        {getAlertRuleTypeLabel(h.rule.ruleType)})
                      </MutedNote>
                    ))}
                  </Card>
                )}
              </>
            )}
          </>
        )}

        {activeTab === 'modelos' && (
          <>
            {templatesQuery.isError && extractPlanRequired(templatesQuery.error) ? (
              <PlanLockedPreview
                featureName="Modelos de resposta e anotações internas"
                requiredPlan={extractPlanRequired(templatesQuery.error)?.requiredPlan}
              />
            ) : (
              <>
                <Card>
                  <h2 style={{ fontSize: 18, marginBottom: 10 }}>Novo modelo de resposta</h2>
                  {tplErr && <ErrorBox>{tplErr}</ErrorBox>}
                  <Row style={{ marginBottom: 10 }}>
                    <Input
                      placeholder="Título do modelo"
                      value={tplTitle}
                      onChange={(e) => setTplTitle(e.target.value)}
                      style={{ minWidth: 280 }}
                    />
                    <MutedNote>
                      Variáveis permitidas: {'{{protocolo}}'}, {'{{bairro}}'}, {'{{categoria}}'},
                      {' {{prazo}}'}
                    </MutedNote>
                  </Row>
                  <Textarea
                    value={tplBody}
                    onChange={(e) => setTplBody(e.target.value)}
                  />
                  <Row style={{ marginTop: 10 }}>
                    <Button
                      type="button"
                      disabled={createTplMut.isPending || !tplTitle.trim()}
                      onClick={async () => {
                        setTplErr('')
                        try {
                          await createTplMut.mutateAsync({
                            title: tplTitle.trim(),
                            body: tplBody,
                          })
                          setTplTitle('')
                        } catch (e: unknown) {
                          setTplErr(
                            (e as { response?: { data?: { message?: string } } })?.response?.data
                              ?.message ?? 'Erro ao criar modelo',
                          )
                        }
                      }}
                    >
                      Salvar modelo
                    </Button>
                  </Row>
                </Card>

                <ItemsGrid>
                {templatesQuery.data?.items.map((tpl) => (
                  <Card key={tpl.id}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <div>
                        <strong>{tpl.title}</strong>
                        <MutedNote>Usado {tpl.usageCount} vez(es)</MutedNote>
                        <p style={{ marginTop: 6, fontSize: 14 }}>{tpl.body}</p>
                      </div>
                      <Button
                        type="button"
                        $variant="danger"
                        onClick={() => deleteTplMut.mutate(tpl.id)}
                      >
                        Excluir
                      </Button>
                    </Row>
                  </Card>
                ))}
                </ItemsGrid>
              </>
            )}
          </>
        )}

        {activeTab === 'prestacao' && (
          <>
            {accQuery.isError && extractPlanRequired(accQuery.error) ? (
              <PlanLockedPreview
                featureName="Prestação de contas em PDF"
                requiredPlan={extractPlanRequired(accQuery.error)?.requiredPlan}
              />
            ) : (
              <>
                <Card>
                  <h2 style={{ fontSize: 18, marginBottom: 10 }}>
                    Gerar prestação de contas em PDF (retenção de 7 dias em storage privado)
                  </h2>
                  {pdfErr && <ErrorBox>{pdfErr}</ErrorBox>}
                  <Row>
                    <Input
                      type="date"
                      value={pdfFrom}
                      onChange={(e) => setPdfFrom(e.target.value)}
                    />
                    <Input
                      type="date"
                      value={pdfTo}
                      onChange={(e) => setPdfTo(e.target.value)}
                    />
                    <Button
                      type="button"
                      disabled={createPdfMut.isPending}
                      onClick={async () => {
                        setPdfErr('')
                        try {
                          await createPdfMut.mutateAsync({ from: pdfFrom, to: pdfTo })
                        } catch (e: unknown) {
                          setPdfErr(
                            (e as { response?: { data?: { message?: string } } })?.response?.data
                              ?.message ?? 'Erro ao solicitar PDF',
                          )
                        }
                      }}
                    >
                      {createPdfMut.isPending ? 'Solicitando...' : 'Gerar PDF'}
                    </Button>
                    {accQuery.data?.quota && (
                      <MutedNote>
                        Uso mensal: {accQuery.data.quota.usedThisMonth} /{' '}
                        {accQuery.data.quota.monthlyLimit ?? 'ilimitado'}
                      </MutedNote>
                    )}
                  </Row>
                </Card>

                <ItemsGrid>
                {accQuery.data?.items.map((rep) => (
                  <Card key={rep.id}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <div>
                        <strong>
                          Código {rep.code} · {formatDateBr(rep.periodStart)} a{' '}
                          {formatDateBr(rep.periodEnd)}
                        </strong>
                        <MutedNote>
                          Status: {getAccountabilityStatusLabel(rep.status)} · Versão{' '}
                          {rep.dictionaryVersion}
                        </MutedNote>
                      </div>
                      <Row>
                        <Link to={rep.publicVerificationPath} style={{ fontSize: 13 }}>
                          Verificação pública
                        </Link>
                        {rep.status === 'READY' && rep.hasPdf && (
                          <Button
                            type="button"
                            onClick={() => handleDownloadPdf(rep.id)}
                          >
                            Baixar PDF (URL temporária)
                          </Button>
                        )}
                      </Row>
                    </Row>
                  </Card>
                ))}
                </ItemsGrid>
              </>
            )}
          </>
        )}

        {activeTab === 'cartoes' && (
          <>
            {shareCardsQuery.isError && extractPlanRequired(shareCardsQuery.error) ? (
              <PlanLockedPreview
                featureName="Cartões compartilháveis oficiais"
                requiredPlan={extractPlanRequired(shareCardsQuery.error)?.requiredPlan}
              />
            ) : (
              <>
                <Card>
                  <h2 style={{ fontSize: 18, marginBottom: 10 }}>
                    Gerar cartão factual para redes sociais
                  </h2>
                  {cardErr && <ErrorBox>{cardErr}</ErrorBox>}
                  <Row>
                    <Select
                      value={cardFormat}
                      onChange={(e) => setCardFormat(e.target.value as 'FEED' | 'STORIES')}
                    >
                      <option value="FEED">Feed vertical (1080×1350)</option>
                      <option value="STORIES">Stories (1080×1920)</option>
                    </Select>
                    <Input
                      type="date"
                      value={cardFrom}
                      onChange={(e) => setCardFrom(e.target.value)}
                    />
                    <Input
                      type="date"
                      value={cardTo}
                      onChange={(e) => setCardTo(e.target.value)}
                    />
                    <Button
                      type="button"
                      disabled={genCardMut.isPending}
                      onClick={async () => {
                        setCardErr('')
                        try {
                          await genCardMut.mutateAsync({
                            format: cardFormat,
                            from: cardFrom,
                            to: cardTo,
                          })
                        } catch (e: unknown) {
                          setCardErr(
                            (e as { response?: { data?: { message?: string } } })?.response?.data
                              ?.message ?? 'Erro ao gerar cartão',
                          )
                        }
                      }}
                    >
                      {genCardMut.isPending ? 'Renderizando...' : 'Gerar cartão PNG'}
                    </Button>
                    {shareCardsQuery.data?.quota && (
                      <MutedNote>
                        Cota mensal: {shareCardsQuery.data.quota.usedThisMonth} /{' '}
                        {shareCardsQuery.data.quota.monthlyLimit ?? 'ilimitado'}
                      </MutedNote>
                    )}
                  </Row>
                </Card>

                <ItemsGrid>
                {shareCardsQuery.data?.items.map((c) => (
                  <Card key={c.id}>
                    <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>
                          {getShareCardFormatLabel(c.format)} · {formatDateBr(c.periodStart)} a{' '}
                          {formatDateBr(c.periodEnd)}
                        </strong>
                        <MutedNote>Hash das métricas: {c.metricsHash}</MutedNote>
                        <Row style={{ marginTop: 8 }}>
                          <a href={c.imageUrl} download={`votz-${c.format.toLowerCase()}.png`}>
                            Baixar PNG
                          </a>
                          <Link to={c.publicPageUrl}>Página pública (/p/.../mandato)</Link>
                        </Row>
                      </div>
                      <img
                        src={c.imageUrl}
                        alt={`Cartão ${c.format}`}
                        style={{ maxHeight: 220, borderRadius: 8 }}
                      />
                    </Row>
                  </Card>
                ))}
                </ItemsGrid>
              </>
            )}
          </>
        )}

        {activeTab === 'webhooks' && (
          <>
            {webhooksQuery.isError && extractPlanRequired(webhooksQuery.error) ? (
              <PlanLockedPreview
                featureName="Webhooks assinados (HMAC-SHA256)"
                requiredPlan={extractPlanRequired(webhooksQuery.error)?.requiredPlan}
              />
            ) : (
              <>
                {whSecretOnce && (
                  <SecretBanner>
                    Segredo HMAC exibido uma única vez (salve agora): {whSecretOnce}
                  </SecretBanner>
                )}
                <Card>
                  <h2 style={{ fontSize: 18, marginBottom: 10 }}>
                    Cadastrar endpoint HTTPS ({webhooksQuery.data?.endpoints.length ?? 0}/
                    {webhooksQuery.data?.limit ?? '—'})
                  </h2>
                  {whErr && <ErrorBox>{whErr}</ErrorBox>}
                  <Row style={{ marginBottom: 10 }}>
                    <Input
                      type="url"
                      placeholder="https://gabinete.exemplo.gov.br/hooks/votz"
                      value={whUrl}
                      onChange={(e) => setWhUrl(e.target.value)}
                      style={{ minWidth: 340 }}
                    />
                    <Button
                      type="button"
                      disabled={createWhMut.isPending || !whUrl.trim()}
                      onClick={async () => {
                        setWhErr('')
                        setWhSecretOnce('')
                        try {
                          const res = await createWhMut.mutateAsync({
                            url: whUrl.trim(),
                            events: whEvents,
                          })
                          setWhSecretOnce(res.secretOnce)
                          setWhUrl('')
                        } catch (e: unknown) {
                          setWhErr(
                            (e as { response?: { data?: { message?: string } } })?.response?.data
                              ?.message ?? 'Erro ao cadastrar webhook',
                          )
                        }
                      }}
                    >
                      Adicionar endpoint
                    </Button>
                  </Row>
                  <Row>
                    {(
                      [
                        'REPORT_CREATED',
                        'REPORT_STATUS_CHANGED',
                        'REPORT_PRESSURE_THRESHOLD',
                        'OUTBREAK_DETECTED',
                        'SLA_AT_RISK',
                        'SLA_BREACHED',
                        'REPORT_ASSIGNED',
                      ] as WebhookEventType[]
                    ).map((ev) => (
                      <label key={ev} style={{ fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={whEvents.includes(ev)}
                          onChange={(e) =>
                            setWhEvents((prev) =>
                              e.target.checked
                                ? [...prev, ev]
                                : prev.filter((item) => item !== ev),
                            )
                          }
                        />{' '}
                        {getWebhookEventLabel(ev)}
                      </label>
                    ))}
                  </Row>
                </Card>

                <ItemsGrid>
                {webhooksQuery.data?.endpoints.map((ep) => (
                  <Card key={ep.id}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <div>
                        <strong>{ep.url}</strong>
                        <MutedNote>
                          Prefixo: {ep.secretPrefix} · {ep.active ? 'Ativo' : 'Desativado'} · Falhas
                          consecutivas: {ep.consecutiveFailures}
                        </MutedNote>
                        {ep.disabledReason && <MutedNote>{ep.disabledReason}</MutedNote>}
                      </div>
                      <Row>
                        <Button
                          type="button"
                          $variant="secondary"
                          onClick={() =>
                            setSelectedEndpointId(selectedEndpointId === ep.id ? null : ep.id)
                          }
                        >
                          Ver entregas
                        </Button>
                        <Button
                          type="button"
                          $variant="danger"
                          onClick={() => deleteWhMut.mutate(ep.id)}
                        >
                          Remover
                        </Button>
                      </Row>
                    </Row>
                    {selectedEndpointId === ep.id && deliveriesQuery.data && (
                      <div style={{ marginTop: 12 }}>
                        {deliveriesQuery.data.length === 0 ? (
                          <MutedNote>Nenhuma entrega registrada.</MutedNote>
                        ) : (
                          deliveriesQuery.data.map((d) => (
                            <MutedNote key={d.id}>
                              {getWebhookEventLabel(d.eventType)} ·{' '}
                              {getWebhookDeliveryStatusLabel(d.status)} (HTTP {d.httpStatus ?? '—'},{' '}
                              {d.latencyMs ?? 0}ms, tentativa {d.attemptCount})
                            </MutedNote>
                          ))
                        )}
                      </div>
                    )}
                  </Card>
                ))}
                </ItemsGrid>
              </>
            )}
          </>
        )}

        {activeTab === 'resumo' && (
          <Card>
            <h2 style={{ fontSize: 18, marginBottom: 10 }}>Resumo semanal por e-mail</h2>
            <MutedNote style={{ marginBottom: 14 }}>
              Enviado semanalmente com novos relatos, os 3 não respondidos de maior pressão e
              mediana de resposta comparada à semana anterior. Sem pixel de rastreamento de leitura.
            </MutedNote>
            {digestErr && <ErrorBox>{digestErr}</ErrorBox>}
            {digestSaved && (
              <SecretBanner>{digestSaved}</SecretBanner>
            )}
            {digestQuery.data && (
              <>
                <Row style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 14, fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={digestEnabled ?? digestQuery.data.digestEnabled}
                      onChange={(e) => setDigestEnabled(e.target.checked)}
                    />{' '}
                    Receber resumo semanal por e-mail
                  </label>
                  <Select
                    value={digestDay ?? digestQuery.data.digestDayOfWeek}
                    onChange={(e) => setDigestDay(Number(e.target.value))}
                  >
                    {WEEKDAY_LABELS.map((label, idx) => (
                      <option key={label} value={idx}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={digestHour ?? digestQuery.data.digestHour}
                    onChange={(e) => setDigestHour(Number(e.target.value))}
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, '0')}:00 (Horário de Brasília)
                      </option>
                    ))}
                  </Select>
                </Row>

                <label style={{ display: 'block', fontSize: 13, marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    checked={
                      legalAccepted || Boolean(digestQuery.data.digestLegalBasisAcceptedAt)
                    }
                    onChange={(e) => setLegalAccepted(e.target.checked)}
                  />{' '}
                  Concordo com o recebimento operacional do resumo semanal pela equipe do mandato
                  (base legal registrada para fins da LGPD, revogável em 1 clique).
                </label>

                <Button
                  type="button"
                  disabled={updateDigestMut.isPending}
                  onClick={async () => {
                    setDigestErr('')
                    setDigestSaved('')
                    try {
                      await updateDigestMut.mutateAsync({
                        digestEnabled: digestEnabled ?? digestQuery.data.digestEnabled,
                        digestDayOfWeek: digestDay ?? digestQuery.data.digestDayOfWeek,
                        digestHour: digestHour ?? digestQuery.data.digestHour,
                        legalBasisAccepted:
                          legalAccepted || Boolean(digestQuery.data.digestLegalBasisAcceptedAt),
                      })
                      setDigestSaved('Preferências de resumo semanal atualizadas com sucesso.')
                    } catch (e: unknown) {
                      setDigestErr(
                        (e as { response?: { data?: { message?: string } } })?.response?.data
                          ?.message ?? 'Erro ao salvar preferências',
                      )
                    }
                  }}
                >
                  Salvar preferências
                </Button>
              </>
            )}
          </Card>
        )}
      </Container>
    </Page>
  )
}
