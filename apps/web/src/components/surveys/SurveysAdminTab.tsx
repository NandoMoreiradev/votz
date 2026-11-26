import { useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import {
  SURVEY_DEFAULTS,
  SURVEY_KIND_LABELS,
  SURVEY_ORIGIN_LABELS,
  SURVEY_REVIEW_LABELS,
  type SurveyDistributionMode,
  type SurveyKind,
  type SurveyMethodologyType,
  type SurveyOrigin,
  type SurveyQuestionType,
  type SurveyResultsVisibility,
  type SurveyScope,
  type SurveyVerificationLevel,
} from '@votz/shared-types'
import { api } from '../../lib/api'
import {
  useAdminInstitutes,
  useAdminSurveys,
  useCancelSurvey,
  useCloseSurvey,
  useCreateInstitute,
  useCreateSurvey,
  useDrainSurveyMixPool,
  useDrawSurveySample,
  usePublishSurvey,
  useReviewSurvey,
  useSurveysConfig,
  type CreateSurveyPayload,
} from '../../hooks/useSurveys'

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`

const Banner = styled.div<{ $warn?: boolean }>`
  padding: 12px 16px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ $warn, theme }) => ($warn ? theme.colors.warning : theme.colors.border)};
  background: ${({ $warn, theme }) => ($warn ? '#FEF3C7' : theme.colors.white)};
  color: ${({ $warn, theme }) => ($warn ? '#78350F' : theme.colors.text)};
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`

const PrimaryBtn = styled.button`
  padding: 9px 16px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: none;
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const SecondaryBtn = styled.button<{ $danger?: boolean }>`
  padding: 6px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.borderStrong)};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.text)};
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const Card = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px;
`

const Grid2 = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  @media (max-width: 720px) { grid-template-columns: 1fr; }
`

const Grid3 = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  @media (max-width: 820px) { grid-template-columns: 1fr; }
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
`

const Label = styled.label`
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  display: inline-flex;
  align-items: center;
  gap: 6px;
`

const TooltipWrap = styled.span`
  position: relative;
  display: inline-flex;
  align-items: center;

  &:hover > span,
  &:focus-within > span {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }
`

const TooltipTrigger = styled.button`
  width: 17px;
  height: 17px;
  border-radius: 50%;
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.neutral};
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: help;
  padding: 0;
  &:hover, &:focus-visible {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
    outline: none;
  }
`

const TooltipBubble = styled.span`
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  width: 310px;
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.45;
  box-shadow: ${({ theme }) => theme.shadows.md};
  opacity: 0;
  pointer-events: none;
  transform: translateY(4px);
  transition: opacity 0.14s ease, transform 0.14s ease;
  z-index: 40;
`

const Input = styled.input`
  height: 38px;
  padding: 0 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
`

const Select = styled.select`
  height: 38px;
  padding: 0 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
`

const Textarea = styled.textarea`
  padding: 10px 12px;
  min-height: 76px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: inherit;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  resize: vertical;
`

const QuestionBox = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 14px;
  background: ${({ theme }) => theme.colors.neutral};
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const OptionRow = styled.div`
  display: grid;
  grid-template-columns: 1.5fr 1fr auto auto;
  gap: 8px;
  align-items: center;
  @media (max-width: 720px) { grid-template-columns: 1fr; }
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  overflow: hidden;

  th, td {
    padding: 12px 14px;
    text-align: left;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    font-size: 0.875rem;
  }
  th {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${({ theme }) => theme.colors.muted};
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-block;
  padding: 3px 9px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: 0.75rem;
  font-weight: 700;
  background: ${({ $status }) =>
    $status === 'OPEN'
      ? '#DCFCE7'
      : $status === 'CLOSED'
        ? '#E0E7FF'
        : $status === 'CANCELLED'
          ? '#FEE2E2'
          : '#F3F4F6'};
  color: ${({ $status }) =>
    $status === 'OPEN'
      ? '#166534'
      : $status === 'CLOSED'
        ? '#1E3A8A'
        : $status === 'CANCELLED'
          ? '#991B1B'
          : '#374151'};
`

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.action};
  font-size: 0.875rem;
  font-weight: 600;
`

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  SCHEDULED: 'Agendada',
  OPEN: 'Aberta',
  CLOSED: 'Encerrada',
  ARCHIVED: 'Arquivada',
  CANCELLED: 'Cancelada',
}

interface DraftOption {
  label: string
  subtitle: string
  imageUrl?: string
  politicianId?: string
  isPinnedBottom: boolean
}

interface PoliticianSearchItem {
  id: string
  name: string
  avatarUrl?: string | null
  party?: { abbreviation?: string } | null
}

interface DraftQuestion {
  prompt: string
  type: SurveyQuestionType
  required: boolean
  maxSelections: number
  randomizeOptions: boolean
  options: DraftOption[]
}

function defaultQuestion(): DraftQuestion {
  return {
    prompt: '',
    type: 'SINGLE_CHOICE',
    required: true,
    maxSelections: 1,
    randomizeOptions: true,
    options: [
      { label: '', subtitle: '', isPinnedBottom: false },
      { label: '', subtitle: '', isPinnedBottom: false },
      { label: 'Branco / Nulo', subtitle: '', isPinnedBottom: true },
      { label: 'Não sei / Indeciso', subtitle: '', isPinnedBottom: true },
    ],
  }
}

function apiError(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  return Array.isArray(msg) ? msg[0] || fallback : msg || fallback
}

export function SurveysAdminTab() {
  const { data: config } = useSurveysConfig()
  const { data: surveys, isLoading } = useAdminSurveys(true)
  const { data: institutes } = useAdminInstitutes(true)
  const createMut = useCreateSurvey()
  const publishMut = usePublishSurvey()
  const closeMut = useCloseSurvey()
  const cancelMut = useCancelSurvey()
  const reviewMut = useReviewSurvey()
  const drawSampleMut = useDrawSurveySample()
  const drainMut = useDrainSurveyMixPool()
  const createInstMut = useCreateInstitute()

  const [showForm, setShowForm] = useState(false)
  const [showInstForm, setShowInstForm] = useState(false)
  const [instName, setInstName] = useState('')
  const [instLegal, setInstLegal] = useState('')
  const [instCnpj, setInstCnpj] = useState('')
  const [instLead, setInstLead] = useState('')
  const [instConre, setInstConre] = useState('')
  const [polQuery, setPolQuery] = useState('')
  const [polResults, setPolResults] = useState<PoliticianSearchItem[]>([])
  const [feedback, setFeedback] = useState<{ msg: string; error?: boolean } | null>(null)

  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<SurveyKind>('CIVIC_TOPIC')
  const [origin, setOrigin] = useState<SurveyOrigin>('VOTZ')
  const [distributionMode, setDistributionMode] = useState<SurveyDistributionMode>('OPEN')
  const [methodologyType, setMethodologyType] = useState<SurveyMethodologyType>('OPEN_PANEL')
  const [scope, setScope] = useState<SurveyScope>('NATIONAL')
  const [targetState, setTargetState] = useState('')
  const [targetCity, setTargetCity] = useState('')
  const [topicKey, setTopicKey] = useState('')
  const [cooldownDays, setCooldownDays] = useState('30')
  const [instituteId, setInstituteId] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [contractorName, setContractorName] = useState('')
  const [verificationLevel, setVerificationLevel] = useState<SurveyVerificationLevel>('STANDARD')
  const [resultsVisibility, setResultsVisibility] = useState<SurveyResultsVisibility>('AFTER_VOTE')
  const [minQuorumToPublish, setMinQuorumToPublish] = useState(String(SURVEY_DEFAULTS.MIN_QUORUM_TO_PUBLISH))
  const [kAnonymityThreshold, setKAnonymityThreshold] = useState(String(SURVEY_DEFAULTS.K_ANONYMITY_THRESHOLD))
  const [featuredInFeed, setFeaturedInFeed] = useState(true)
  const [endsAt, setEndsAt] = useState('')
  const [isElectoral, setIsElectoral] = useState(false)
  const [tseRegistrationCode, setTseRegistrationCode] = useState('')
  const [statisticianName, setStatisticianName] = useState('')
  const [statisticianConre, setStatisticianConre] = useState('')
  const [methodologyNote, setMethodologyNote] = useState(
    'Coleta anônima entre usuários verificados do Votz com separação criptográfica entre identidade e cédula (Mix Pool + k-anonimato). Amostra não probabilística.',
  )
  const [disclaimerText, setDisclaimerText] = useState(
    'Os resultados refletem a opinião dos participantes do Votz no período informado. O voto é secreto, definitivo e não alimenta publicidade.',
  )
  const [questions, setQuestions] = useState<DraftQuestion[]>([defaultQuestion()])

  function handleKindChange(next: SurveyKind) {
    setKind(next)
    if (next === 'VOTING_INTENTION') {
      setIsElectoral(true)
      setVerificationLevel('VERIFIED_CPF')
      setResultsVisibility('AFTER_CLOSE')
    } else {
      setIsElectoral(false)
      setVerificationLevel('STANDARD')
      setResultsVisibility('AFTER_VOTE')
    }
  }

  function updateQuestion(idx: number, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)))
  }

  function updateOption(qIdx: number, oIdx: number, patch: Partial<DraftOption>) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIdx
          ? { ...q, options: q.options.map((o, j) => (j === oIdx ? { ...o, ...patch } : o)) }
          : q,
      ),
    )
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)

    const payload: CreateSurveyPayload = {
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      description: description.trim(),
      kind,
      origin,
      distributionMode,
      methodologyType,
      scope,
      targetState: scope !== 'NATIONAL' && targetState.trim() ? targetState.trim().toUpperCase() : undefined,
      targetCity: scope === 'MUNICIPAL' && targetCity.trim() ? targetCity.trim() : undefined,
      instituteId: instituteId || undefined,
      topicKey: topicKey.trim() || undefined,
      cooldownDays: Number(cooldownDays) || 30,
      partnerName: partnerName.trim() || undefined,
      contractorName: contractorName.trim() || undefined,
      verificationLevel,
      resultsVisibility,
      minQuorumToPublish: Number(minQuorumToPublish) || SURVEY_DEFAULTS.MIN_QUORUM_TO_PUBLISH,
      kAnonymityThreshold: Number(kAnonymityThreshold) || SURVEY_DEFAULTS.K_ANONYMITY_THRESHOLD,
      featuredInFeed,
      endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
      isElectoral,
      tseRegistrationCode: tseRegistrationCode.trim() || undefined,
      statisticianName: statisticianName.trim() || undefined,
      statisticianConre: statisticianConre.trim() || undefined,
      methodologyNote: methodologyNote.trim(),
      disclaimerText: disclaimerText.trim(),
      questions: questions.map((q) => ({
        prompt: q.prompt.trim(),
        type: q.type,
        required: q.required,
        maxSelections: q.type === 'MULTIPLE_CHOICE' ? q.maxSelections : 1,
        randomizeOptions: q.randomizeOptions,
        options: q.options
          .filter((o) => o.label.trim().length > 0)
          .map((o) => ({
            label: o.label.trim(),
            subtitle: o.subtitle.trim() || undefined,
            imageUrl: o.imageUrl,
            politicianId: o.politicianId,
            isPinnedBottom: o.isPinnedBottom,
          })),
      })),
    }

    createMut.mutate(payload, {
      onSuccess: () => {
        setFeedback({ msg: 'Pesquisa criada em rascunho. Revise e clique em "Publicar" quando estiver pronta.' })
        setShowForm(false)
        setTitle('')
        setSubtitle('')
        setDescription('')
        setQuestions([defaultQuestion()])
      },
      onError: (err) => setFeedback({ msg: apiError(err, 'Erro ao criar pesquisa.'), error: true }),
    })
  }

  async function searchPoliticians(q: string) {
    setPolQuery(q)
    if (q.trim().length < 2) {
      setPolResults([])
      return
    }
    try {
      const res = await api.get<{ data?: PoliticianSearchItem[] }>('/politicians', {
        params: { search: q.trim(), limit: 6 },
      })
      setPolResults(res.data?.data ?? [])
    } catch {
      setPolResults([])
    }
  }

  function addPoliticianOption(qIdx: number, pol: PoliticianSearchItem) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q
        const regular = q.options.filter((o) => !o.isPinnedBottom && o.label.trim().length > 0)
        const pinned = q.options.filter((o) => o.isPinnedBottom)
        return {
          ...q,
          options: [
            ...regular,
            {
              label: pol.name,
              subtitle: pol.party?.abbreviation ?? '',
              imageUrl: pol.avatarUrl ?? undefined,
              politicianId: pol.id,
              isPinnedBottom: false,
            },
            ...pinned,
          ],
        }
      }),
    )
    setPolQuery('')
    setPolResults([])
  }

  function handleCreateInstitute(e: React.FormEvent) {
    e.preventDefault()
    createInstMut.mutate(
      {
        name: instName.trim(),
        legalName: instLegal.trim(),
        cnpj: instCnpj.trim() || undefined,
        statisticianLead: instLead.trim() || undefined,
        conreLead: instConre.trim() || undefined,
      },
      {
        onSuccess: () => {
          setFeedback({ msg: `Instituto "${instName}" cadastrado.` })
          setShowInstForm(false)
          setInstName('')
          setInstLegal('')
          setInstCnpj('')
          setInstLead('')
          setInstConre('')
        },
        onError: (err) => setFeedback({ msg: apiError(err, 'Erro ao cadastrar instituto.'), error: true }),
      },
    )
  }

  return (
    <Wrap>
      <Banner $warn={!config?.enabled}>
        <span>
          <strong>Pesquisa Votz:</strong>{' '}
          {config?.enabled
            ? 'Ativa para os cidadãos.'
            : 'Desligada para o público (defina OFFICIAL_SURVEYS_ENABLED=true na API para liberar).'}
          {config?.electoralLockEnabled && ' · Trava eleitoral TSE (PesqEle + CONRE) ATIVA.'}
        </span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <SecondaryBtn type="button" onClick={() => setShowInstForm((v) => !v)}>
            {showInstForm ? 'Fechar institutos' : `Institutos (${institutes?.length ?? 0})`}
          </SecondaryBtn>
          <PrimaryBtn type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Fechar formulário' : '+ Nova Pesquisa Votz'}
          </PrimaryBtn>
        </div>
      </Banner>

      {showInstForm && (
        <Card>
          <form onSubmit={handleCreateInstitute} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0 }}>Cadastrar Instituto de Pesquisa Credenciado</h3>
            <Grid3>
              <Field>
                <Label>Nome fantasia *</Label>
                <Input value={instName} onChange={(e) => setInstName(e.target.value)} required placeholder="Ex.: Instituto Alfa" />
              </Field>
              <Field>
                <Label>Razão social *</Label>
                <Input value={instLegal} onChange={(e) => setInstLegal(e.target.value)} required />
              </Field>
              <Field>
                <Label>CNPJ</Label>
                <Input value={instCnpj} onChange={(e) => setInstCnpj(e.target.value)} placeholder="00.000.000/0001-00" />
              </Field>
              <Field>
                <Label>Estatístico responsável</Label>
                <Input value={instLead} onChange={(e) => setInstLead(e.target.value)} />
              </Field>
              <Field>
                <Label>CONRE</Label>
                <Input value={instConre} onChange={(e) => setInstConre(e.target.value)} placeholder="CONRE-3 0000" />
              </Field>
            </Grid3>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <PrimaryBtn type="submit" disabled={createInstMut.isPending}>
                {createInstMut.isPending ? 'Salvando…' : 'Cadastrar instituto'}
              </PrimaryBtn>
            </div>
          </form>
        </Card>
      )}

      {feedback && (
        <Banner $warn={feedback.error}>
          <span>{feedback.msg}</span>
        </Banner>
      )}

      {showForm && (
        <Card>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ margin: 0 }}>Nova Pesquisa Oficial (Rascunho)</h3>

            <Grid2>
              <Field>
                <Label>Título *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={5} maxLength={180} placeholder="Ex.: Pesquisa Votz — Prioridades de São Paulo 2027" />
              </Field>
              <Field>
                <Label>Subtítulo</Label>
                <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={320} placeholder="Resumo curto exibido no card" />
              </Field>
            </Grid2>

            <Field>
              <Label>Descrição *</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} required minLength={10} placeholder="Explique o objetivo da pesquisa em português simples." />
            </Field>

            <Grid3>
              <Field>
                <Label>Modalidade</Label>
                <Select value={kind} onChange={(e) => handleKindChange(e.target.value as SurveyKind)}>
                  <option value="CIVIC_TOPIC">Pesquisa cívica / temática</option>
                  <option value="APPROVAL_RATING">Avaliação de gestão</option>
                  <option value="VOTING_INTENTION">Intenção de voto</option>
                </Select>
              </Field>
              <Field>
                <Label>Origem</Label>
                <Select value={origin} onChange={(e) => setOrigin(e.target.value as SurveyOrigin)}>
                  <option value="VOTZ">Pesquisa Votz · Oficial</option>
                  <option value="PARTNER_INSTITUTE">Instituto Credenciado</option>
                  <option value="PUBLIC_ENTITY">Consulta Pública (Entidade)</option>
                </Select>
              </Field>
              <Field>
                <Label>Distribuição</Label>
                <Select value={distributionMode} onChange={(e) => setDistributionMode(e.target.value as SurveyDistributionMode)}>
                  <option value="OPEN">Aberta (vitrine /pesquisas)</option>
                  <option value="INVITED_SAMPLE">Amostra sorteada (com quarentena)</option>
                </Select>
              </Field>
              <Field>
                <Label>Metodologia</Label>
                <Select value={methodologyType} onChange={(e) => setMethodologyType(e.target.value as SurveyMethodologyType)}>
                  <option value="OPEN_PANEL">Sondagem aberta (painel Votz)</option>
                  <option value="WEIGHTED_QUOTA">Amostra ponderada (cotas IBGE)</option>
                  <option value="REGISTERED_TSE">Pesquisa registrada no TSE</option>
                </Select>
              </Field>
            </Grid3>

            <Grid3>
              <Field>
                <Label>
                  Chave de tema/cargo (quarentena &amp; comparador)
                  <TooltipWrap>
                    <TooltipTrigger type="button" aria-label="Como funciona a chave de tema/cargo">?</TooltipTrigger>
                    <TooltipBubble role="tooltip">
                      <strong>Etiqueta que agrupa pesquisas do mesmo cargo ou tema.</strong>
                      <br /><br />
                      <strong>1. Quarentena:</strong> em amostras sorteadas, quem já recebeu convite nesta chave fica bloqueado pelos dias de quarentena (evita repetir a mesma pergunta entre institutos).
                      <br /><br />
                      <strong>2. Comparador:</strong> pesquisas encerradas com a mesma chave aparecem juntas no comparador histórico.
                      <br /><br />
                      <em>Ex.: PRESIDENTE:BR:2026 ou PREFEITO:SP:SAO_PAULO:2028. Deixe vazio para pesquisa única.</em>
                    </TooltipBubble>
                  </TooltipWrap>
                </Label>
                <Input value={topicKey} onChange={(e) => setTopicKey(e.target.value.toUpperCase())} placeholder="Ex.: PREFEITO:SP:SAO_PAULO:2028" />
              </Field>
              <Field>
                <Label>Quarentena entre institutos (dias)</Label>
                <Input type="number" min={1} max={365} value={cooldownDays} onChange={(e) => setCooldownDays(e.target.value)} />
              </Field>
              <Field>
                <Label>Instituto credenciado (opcional)</Label>
                <Select value={instituteId} onChange={(e) => setInstituteId(e.target.value)}>
                  <option value="">Nenhum / Próprio Votz</option>
                  {(institutes ?? []).map((inst) => (
                    <option key={inst.id} value={inst.id}>{inst.name}</option>
                  ))}
                </Select>
              </Field>
            </Grid3>

            <Grid3>
              <Field>
                <Label>Escopo territorial</Label>
                <Select value={scope} onChange={(e) => setScope(e.target.value as SurveyScope)}>
                  <option value="NATIONAL">Nacional</option>
                  <option value="STATE">Estadual (UF)</option>
                  <option value="MUNICIPAL">Municipal</option>
                </Select>
              </Field>
              {scope !== 'NATIONAL' && (
                <Field>
                  <Label>UF (2 letras)</Label>
                  <Input value={targetState} onChange={(e) => setTargetState(e.target.value.toUpperCase())} maxLength={2} placeholder="SP" />
                </Field>
              )}
              {scope === 'MUNICIPAL' && (
                <Field>
                  <Label>Cidade</Label>
                  <Input value={targetCity} onChange={(e) => setTargetCity(e.target.value)} placeholder="São Paulo" />
                </Field>
              )}
            </Grid3>

            <Grid3>
              <Field>
                <Label>Nível de verificação</Label>
                <Select value={verificationLevel} onChange={(e) => setVerificationLevel(e.target.value as SurveyVerificationLevel)}>
                  <option value="STANDARD">Padrão (e-mail verificado)</option>
                  <option value="VERIFIED_CPF">CPF verificado (dedup por CPF)</option>
                </Select>
              </Field>
              <Field>
                <Label>Divulgação de resultados</Label>
                <Select value={resultsVisibility} onChange={(e) => setResultsVisibility(e.target.value as SurveyResultsVisibility)}>
                  <option value="AFTER_CLOSE">Apenas após encerrar</option>
                  <option value="AFTER_VOTE">Parciais após atingir quórum</option>
                </Select>
              </Field>
              <Field>
                <Label>Encerramento (opcional)</Label>
                <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </Field>
            </Grid3>

            <Grid3>
              <Field>
                <Label>Quórum mínimo para publicar</Label>
                <Input type="number" min={10} value={minQuorumToPublish} onChange={(e) => setMinQuorumToPublish(e.target.value)} />
              </Field>
              <Field>
                <Label>K-anonimato mínimo por recorte</Label>
                <Input type="number" min={10} value={kAnonymityThreshold} onChange={(e) => setKAnonymityThreshold(e.target.value)} />
              </Field>
              <Field style={{ justifyContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={featuredInFeed} onChange={(e) => setFeaturedInFeed(e.target.checked)} />
                  Destacar no feed dos cidadãos
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', cursor: 'pointer', marginTop: 6 }}>
                  <input type="checkbox" checked={isElectoral} onChange={(e) => setIsElectoral(e.target.checked)} />
                  Pesquisa eleitoral (sujeita à trava TSE)
                </label>
              </Field>
            </Grid3>

            {(origin !== 'VOTZ' || isElectoral) && (
              <Grid3>
                <Field>
                  <Label>Instituto / Entidade parceira</Label>
                  <Input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} placeholder="Ex.: Instituto Alfa" />
                </Field>
                <Field>
                  <Label>Contratante / Financiador</Label>
                  <Input value={contractorName} onChange={(e) => setContractorName(e.target.value)} placeholder="Quem financiou a pesquisa" />
                </Field>
                <Field>
                  <Label>Registro TSE (PesqEle)</Label>
                  <Input value={tseRegistrationCode} onChange={(e) => setTseRegistrationCode(e.target.value)} placeholder="BR-00000/2026" />
                </Field>
                <Field>
                  <Label>Estatístico responsável</Label>
                  <Input value={statisticianName} onChange={(e) => setStatisticianName(e.target.value)} />
                </Field>
                <Field>
                  <Label>CONRE</Label>
                  <Input value={statisticianConre} onChange={(e) => setStatisticianConre(e.target.value)} placeholder="CONRE-3 0000" />
                </Field>
              </Grid3>
            )}

            <Grid2>
              <Field>
                <Label>Nota metodológica *</Label>
                <Textarea value={methodologyNote} onChange={(e) => setMethodologyNote(e.target.value)} required minLength={10} />
              </Field>
              <Field>
                <Label>Aviso de transparência *</Label>
                <Textarea value={disclaimerText} onChange={(e) => setDisclaimerText(e.target.value)} required minLength={10} />
              </Field>
            </Grid2>

            {/* Perguntas */}
            <TopBar>
              <h4 style={{ margin: 0 }}>Perguntas ({questions.length})</h4>
              <SecondaryBtn type="button" onClick={() => setQuestions((p) => [...p, defaultQuestion()])}>
                + Adicionar pergunta
              </SecondaryBtn>
            </TopBar>

            {questions.map((q, qIdx) => (
              <QuestionBox key={qIdx}>
                <TopBar>
                  <strong>Pergunta {qIdx + 1}</strong>
                  {questions.length > 1 && (
                    <SecondaryBtn type="button" $danger onClick={() => setQuestions((p) => p.filter((_, i) => i !== qIdx))}>
                      Remover
                    </SecondaryBtn>
                  )}
                </TopBar>
                <Input
                  value={q.prompt}
                  onChange={(e) => updateQuestion(qIdx, { prompt: e.target.value })}
                  placeholder="Enunciado da pergunta (ex.: Se a eleição fosse hoje, em quem você votaria?)"
                  required
                />
                <Grid3>
                  <Select value={q.type} onChange={(e) => updateQuestion(qIdx, { type: e.target.value as SurveyQuestionType })}>
                    <option value="SINGLE_CHOICE">Escolha única</option>
                    <option value="MULTIPLE_CHOICE">Múltipla escolha</option>
                    <option value="SCALE_5">Escala (1 a 5)</option>
                  </Select>
                  {q.type === 'MULTIPLE_CHOICE' && (
                    <Input
                      type="number"
                      min={2}
                      max={10}
                      value={q.maxSelections}
                      onChange={(e) => updateQuestion(qIdx, { maxSelections: Number(e.target.value) || 2 })}
                      placeholder="Máx. escolhas"
                    />
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem' }}>
                    <input
                      type="checkbox"
                      checked={q.randomizeOptions}
                      onChange={(e) => updateQuestion(qIdx, { randomizeOptions: e.target.checked })}
                    />
                    Embaralhar ordem das opções
                  </label>
                </Grid3>

                {q.options.map((o, oIdx) => (
                  <OptionRow key={oIdx}>
                    <Input
                      value={o.label}
                      onChange={(e) => updateOption(qIdx, oIdx, { label: e.target.value })}
                      placeholder={`Opção ${oIdx + 1}`}
                    />
                    <Input
                      value={o.subtitle}
                      onChange={(e) => updateOption(qIdx, oIdx, { subtitle: e.target.value })}
                      placeholder="Subtítulo (ex.: partido)"
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={o.isPinnedBottom}
                        onChange={(e) => updateOption(qIdx, oIdx, { isPinnedBottom: e.target.checked })}
                      />
                      Fixar no fim
                    </label>
                    {q.options.length > 2 && (
                      <SecondaryBtn
                        type="button"
                        onClick={() =>
                          updateQuestion(qIdx, { options: q.options.filter((_, j) => j !== oIdx) })
                        }
                      >
                        ✕
                      </SecondaryBtn>
                    )}
                  </OptionRow>
                ))}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <SecondaryBtn
                    type="button"
                    onClick={() =>
                      updateQuestion(qIdx, {
                        options: [...q.options, { label: '', subtitle: '', isPinnedBottom: false }],
                      })
                    }
                  >
                    + Opção manual
                  </SecondaryBtn>
                  <Input
                    style={{ maxWidth: 260, height: 32 }}
                    value={polQuery}
                    onChange={(e) => void searchPoliticians(e.target.value)}
                    placeholder="Buscar político do Votz para adicionar…"
                  />
                </div>
                {polResults.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {polResults.map((pol) => (
                      <SecondaryBtn key={pol.id} type="button" onClick={() => addPoliticianOption(qIdx, pol)}>
                        + {pol.name}{pol.party?.abbreviation ? ` (${pol.party.abbreviation})` : ''}
                      </SecondaryBtn>
                    ))}
                  </div>
                )}
              </QuestionBox>
            ))}

            {createMut.isError && <ErrorText>{apiError(createMut.error, 'Erro ao criar pesquisa.')}</ErrorText>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <SecondaryBtn type="button" onClick={() => setShowForm(false)}>Cancelar</SecondaryBtn>
              <PrimaryBtn type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? 'Salvando…' : 'Salvar rascunho'}
              </PrimaryBtn>
            </div>
          </form>
        </Card>
      )}

      {isLoading ? (
        <Card>Carregando pesquisas…</Card>
      ) : !surveys?.length ? (
        <Card>Nenhuma Pesquisa Votz cadastrada ainda.</Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Pesquisa</th>
              <th>Tipo / Origem</th>
              <th>Status</th>
              <th>Participações / Mix</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {surveys.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.title}</strong>
                  <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 2 }}>
                    {s.scope === 'NATIONAL' ? 'Nacional' : s.scope === 'STATE' ? `UF: ${s.targetState}` : `${s.targetCity}/${s.targetState}`}
                    {' · '}
                    {s.verificationLevel === 'VERIFIED_CPF' ? 'CPF verificado' : 'Conta padrão'}
                    {s.saltDestroyedAt && ' · Salt destruído'}
                  </div>
                </td>
                <td>
                  <div>{SURVEY_KIND_LABELS[s.kind]}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                    {s.partnerName ? `${SURVEY_ORIGIN_LABELS[s.origin]} (${s.partnerName})` : SURVEY_ORIGIN_LABELS[s.origin]}
                  </div>
                </td>
                <td>
                  <StatusBadge $status={s.status}>{STATUS_LABEL[s.status] ?? s.status}</StatusBadge>
                  {s.reviewStatus !== 'APPROVED' && (
                    <div style={{ fontSize: '0.75rem', color: '#B45309', fontWeight: 600, marginTop: 4 }}>
                      Revisão: {SURVEY_REVIEW_LABELS[s.reviewStatus]}
                    </div>
                  )}
                </td>
                <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem' }}>
                  {s.totalBallots} apuradas
                  <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                    {s._count.participations} part. · {s._count.pendingBallots} no mix
                    {s.distributionMode === 'INVITED_SAMPLE' ? ` · ${s._count.invitations} convites` : ''}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {s.reviewStatus === 'PENDING_REVIEW' && (
                      <>
                        <SecondaryBtn
                          type="button"
                          disabled={reviewMut.isPending}
                          onClick={() =>
                            reviewMut.mutate(
                              { id: s.id, reviewStatus: 'APPROVED' },
                              {
                                onSuccess: () => setFeedback({ msg: `Consulta "${s.title}" aprovada na revisão editorial.` }),
                                onError: (err) => setFeedback({ msg: apiError(err, 'Erro na revisão.'), error: true }),
                              },
                            )
                          }
                        >
                          Aprovar
                        </SecondaryBtn>
                        <SecondaryBtn
                          type="button"
                          $danger
                          disabled={reviewMut.isPending}
                          onClick={() => {
                            const note = window.prompt('Motivo / ajustes necessários:')
                            if (!note) return
                            reviewMut.mutate(
                              { id: s.id, reviewStatus: 'CHANGES_REQUESTED', reviewNote: note },
                              { onSuccess: () => setFeedback({ msg: `Ajustes solicitados para "${s.title}".` }) },
                            )
                          }}
                        >
                          Pedir ajustes
                        </SecondaryBtn>
                      </>
                    )}
                    {s.distributionMode === 'INVITED_SAMPLE' && (s.status === 'OPEN' || s.status === 'DRAFT' || s.status === 'SCHEDULED') && (
                      <SecondaryBtn
                        type="button"
                        disabled={drawSampleMut.isPending}
                        onClick={() => {
                          const raw = window.prompt('Quantos cidadãos sortear para a amostra (respeitando quarentena)?', '500')
                          const count = Number(raw)
                          if (!count || count < 1) return
                          drawSampleMut.mutate(
                            { id: s.id, count },
                            {
                              onSuccess: (r) =>
                                setFeedback({
                                  msg: `Amostra sorteada: ${r.invited} convites enviados de um pool elegível de ${r.eligiblePoolSize} (quarentena ${r.cooldownDays}d).`,
                                }),
                              onError: (err) => setFeedback({ msg: apiError(err, 'Erro ao sortear amostra.'), error: true }),
                            },
                          )
                        }}
                      >
                        Sortear amostra
                      </SecondaryBtn>
                    )}
                    {(s.status === 'DRAFT' || s.status === 'SCHEDULED') && s.reviewStatus === 'APPROVED' && (
                      <SecondaryBtn
                        type="button"
                        disabled={publishMut.isPending}
                        onClick={() =>
                          publishMut.mutate(s.id, {
                            onSuccess: () => setFeedback({ msg: `Pesquisa "${s.title}" publicada.` }),
                            onError: (err) => setFeedback({ msg: apiError(err, 'Não foi possível publicar.'), error: true }),
                          })
                        }
                      >
                        Publicar
                      </SecondaryBtn>
                    )}
                    {s.status === 'OPEN' && (
                      <>
                        <Link to={`/pesquisas/${s.slug}`} style={{ fontSize: '0.8125rem', alignSelf: 'center', textDecoration: 'underline' }}>
                          Abrir
                        </Link>
                        {s._count.pendingBallots > 0 && (
                          <SecondaryBtn
                            type="button"
                            disabled={drainMut.isPending}
                            onClick={() =>
                              drainMut.mutate(s.id, {
                                onSuccess: (r) => setFeedback({ msg: `Mix Pool apurado: +${r.committed} cédulas (total ${r.totalBallots}).` }),
                                onError: (err) => setFeedback({ msg: apiError(err, 'Erro ao apurar Mix Pool.'), error: true }),
                              })
                            }
                          >
                            Apurar Mix ({s._count.pendingBallots})
                          </SecondaryBtn>
                        )}
                        <SecondaryBtn
                          type="button"
                          disabled={closeMut.isPending}
                          onClick={() => {
                            if (!window.confirm('Encerrar pesquisa agora? O Mix Pool será drenado e o salt criptográfico será destruído permanentemente (crypto-shredding).')) return
                            closeMut.mutate(s.id, {
                              onSuccess: () => setFeedback({ msg: `Pesquisa "${s.title}" encerrada e salt destruído.` }),
                              onError: (err) => setFeedback({ msg: apiError(err, 'Erro ao encerrar.'), error: true }),
                            })
                          }}
                        >
                          Encerrar
                        </SecondaryBtn>
                      </>
                    )}
                    {s.status !== 'CLOSED' && s.status !== 'ARCHIVED' && s.status !== 'CANCELLED' && (
                      <SecondaryBtn
                        type="button"
                        $danger
                        disabled={cancelMut.isPending}
                        onClick={() => {
                          const reason = window.prompt('Motivo do cancelamento (mín. 5 caracteres):')
                          if (!reason || reason.trim().length < 5) return
                          cancelMut.mutate(
                            { id: s.id, reason: reason.trim() },
                            {
                              onSuccess: () => setFeedback({ msg: `Pesquisa "${s.title}" cancelada.` }),
                              onError: (err) => setFeedback({ msg: apiError(err, 'Erro ao cancelar.'), error: true }),
                            },
                          )
                        }}
                      >
                        Cancelar
                      </SecondaryBtn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Wrap>
  )
}
