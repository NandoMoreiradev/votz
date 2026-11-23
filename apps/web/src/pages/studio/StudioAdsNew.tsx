import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import styled from 'styled-components'
import {
  AD_CTA_LABELS,
  AD_INTERESTS,
  AD_LIMITS,
  AD_MEDIA_RULES,
  AD_OBJECTIVES,
  AD_OBJECTIVE_LABELS,
  AGE_BANDS,
  DEFAULT_MEDIA_FORMAT,
  MEDIA_FORMATS,
  USER_GENDERS,
  USER_GENDER_LABELS,
  adMediaProblem,
  nearestMediaFormat,
  type AdCtaLabel,
  type AdInterestId,
  type AdObjective,
  type AdReachEstimateInput,
  type AgeBand,
  type CreateAdCampaignInput,
  type MediaFormat,
  type UserGender,
} from '@votz/shared-types'
import { useAuthStore } from '../../store/auth.store'
import { adsErrorMessage, formatBRL, useAdAccounts, useAdReachEstimate, useCreateAdCampaign } from '../../hooks/useAds'
import { AdMediaPicker, useAdMediaFiles } from '../../components/ads/AdMediaPicker'
import { kindOfFile, measureLocal } from '../../lib/local-media'
import { CroppedMedia, INITIAL_VIEW, MediaCropEditor, cropOf, type CropEditorItem, type CropView } from '../../components/media/MediaCropEditor'
import {
  Card,
  CardTitle,
  Chip,
  Chips,
  ErrorMsg,
  Field,
  Grid2,
  Head,
  Hint,
  Input,
  Label,
  PrimaryButton,
  Row,
  SecondaryButton,
  Select,
  Sub,
  TextArea,
  Title,
} from '../../components/ads/ads-ui'

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
const STEPS = ['Objetivo', 'Público e orçamento', 'Anúncio', 'Revisão'] as const

const ReachBox = styled.div`
  margin: 4px 0 16px;
  padding: 14px 16px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme }) => theme.colors.neutral};
`

const ReachLabel = styled.p`
  margin: 0 0 4px;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
`

const ReachValue = styled.p`
  margin: 0 0 6px;
  font-size: 1.125rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`

/** O mesmo valor, mas só depois de ficar parado um tempo (para não perguntar ao servidor a cada letra). */
function useSettled<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return settled
}

const Steps = styled.ol`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  list-style: none;
  padding: 0;
  margin: 0 0 16px;
`

const StepItem = styled.li<{ $state: 'done' | 'current' | 'next' }>`
  padding: 6px 12px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  background: ${({ $state, theme }) => ($state === 'current' ? theme.colors.primary : theme.colors.neutral)};
  color: ${({ $state, theme }) => ($state === 'current' ? theme.colors.white : $state === 'done' ? theme.colors.text : theme.colors.muted)};
`

const ObjectiveOption = styled.button<{ $selected: boolean }>`
  display: block;
  width: 100%;
  text-align: left;
  padding: 14px 16px;
  margin-bottom: 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 2px solid ${({ $selected, theme }) => ($selected ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme }) => theme.colors.white};
  cursor: pointer;
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 2px; }
`

const OptionTitle = styled.span`
  display: block;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`

const Preview = styled.div`
  max-width: 420px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 14px 16px;
  background: ${({ theme }) => theme.colors.white};
`

const Sponsored = styled.p`
  margin: 0 0 6px;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
`

const PreviewCta = styled.span`
  display: inline-block;
  margin-top: 10px;
  padding: 7px 14px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`

const Summary = styled.dl`
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px 14px;
  margin: 0;
  font-size: 0.875rem;
  dt { color: ${({ theme }) => theme.colors.muted}; }
  dd { margin: 0; color: ${({ theme }) => theme.colors.text}; overflow-wrap: anywhere; }
  @media (max-width: 600px) { grid-template-columns: 1fr; dd { margin-bottom: 8px; } }
`

const MediaFrame = styled.div<{ $ratio: string; $maxWidth?: number }>`
  position: relative;
  aspect-ratio: ${({ $ratio }) => $ratio};
  width: 100%;
  max-width: ${({ $maxWidth }) => ($maxWidth ? `${$maxWidth}px` : 'none')};
  margin-top: 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.primary};
`

const FrameStatus = styled.span`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 6px;
  text-align: center;
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.white};
  background: ${({ theme }) => `${theme.colors.primary}99`};
`

const todayIso = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value])
/** "20" ou "20,50" → centavos. */
const reaisToCents = (value: string) => {
  const number = Number(value.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(number) ? Math.round(number * 100) : NaN
}
const isHttpsUrl = (value: string) => {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

/** Estúdio › Anúncios › Criar campanha: objetivo → público e orçamento → anúncio → revisão. Salva como rascunho. */
export function StudioAdsNew() {
  const activeContext = useAuthStore((s) => s.activeContext)
  const companyId = activeContext?.type === 'COMPANY' ? activeContext.id : ''
  const canManage = !!activeContext?.permissions.includes('MANAGE_ADS')
  const [params] = useSearchParams()
  const accounts = useAdAccounts(canManage ? companyId : '')
  const accountId = params.get('conta') ?? accounts.data?.[0]?.id ?? ''
  const create = useCreateAdCampaign(companyId, accountId)
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [objective, setObjective] = useState<AdObjective>('TRAFFIC')
  const [setName_, setSetName] = useState('Público principal')
  const [budget, setBudget] = useState('20')
  const [startAt, setStartAt] = useState(todayIso())
  const [endAt, setEndAt] = useState('')
  const [states, setStates] = useState<string[]>([])
  const [citiesText, setCitiesText] = useState('')
  const [automatic, setAutomatic] = useState(false)
  const [interests, setInterests] = useState<AdInterestId[]>([])
  const [ageBands, setAgeBands] = useState<AgeBand[]>([])
  const [genders, setGenders] = useState<UserGender[]>([])
  const [headline, setHeadline] = useState('')
  const [body, setBody] = useState('')
  const [cta, setCta] = useState<AdCtaLabel>('Saiba mais')
  const [url, setUrl] = useState('https://')
  // Fotos do carrossel (até 5) ou um vídeo sozinho: envio, ordem, enquadramento e regras ficam no seletor.
  const picker = useAdMediaFiles(canManage ? companyId : '')
  const { files, first, format, uploading, hasVideo } = picker

  const cities = useMemo(() => [...new Set(citiesText.split(',').map((city) => city.trim()).filter(Boolean))], [citiesText])
  const budgetCents = reaisToCents(budget)
  // Estimativa de alcance: pergunta ao servidor quando a pessoa para de mexer no público.
  const audience: AdReachEstimateInput = useMemo(
    () => ({ states, cities, interests: automatic ? [] : interests, ageBands: automatic ? [] : ageBands, genders: automatic ? [] : genders, automaticAudience: automatic }),
    [states, cities, interests, ageBands, genders, automatic],
  )
  const settledAudience = useSettled(audience, 500)
  const reach = useAdReachEstimate(canManage ? companyId : '', step === 1 && cities.length <= AD_LIMITS.MAX_CITIES ? settledAudience : null)
  const mediaProblem = picker.problem

  const problems: string[][] = [
    name.trim().length < 2 ? ['Dê um nome à campanha.'] : [],
    [
      ...(setName_.trim().length < 2 ? ['Dê um nome ao público.'] : []),
      ...(!(budgetCents >= AD_LIMITS.MIN_DAILY_BUDGET_CENTS) ? [`O orçamento mínimo é ${formatBRL(AD_LIMITS.MIN_DAILY_BUDGET_CENTS)} por dia.`] : []),
      ...(budgetCents > AD_LIMITS.MAX_DAILY_BUDGET_CENTS ? [`O orçamento máximo é ${formatBRL(AD_LIMITS.MAX_DAILY_BUDGET_CENTS)} por dia.`] : []),
      ...(!startAt || startAt < todayIso() ? ['A campanha não pode começar antes de hoje.'] : []),
      ...(endAt && endAt <= startAt ? ['A data de fim precisa ser depois da data de início.'] : []),
      ...(cities.length > AD_LIMITS.MAX_CITIES ? [`Escolha no máximo ${AD_LIMITS.MAX_CITIES} cidades.`] : []),
    ],
    [
      ...(headline.trim().length < 2 ? ['Escreva o título.'] : []),
      ...(body.trim().length < 2 ? ['Escreva o texto do anúncio.'] : []),
      ...(!isHttpsUrl(url) ? ['O link precisa começar com https:// e ser um endereço válido.'] : []),
      ...(uploading ? ['Espere o envio das fotos ou do vídeo terminar.'] : []),
      ...(mediaProblem ? [mediaProblem] : []),
    ],
    [],
  ]
  const currentProblems = problems[step]

  if (!activeContext || activeContext.type !== 'COMPANY' || !canManage) {
    return <Card><CardTitle>Sem acesso</CardTitle><Hint>Só quem tem permissão de criar anúncios numa empresa pode criar campanhas.</Hint></Card>
  }
  if (accounts.isSuccess && !accountId) {
    return <Card><CardTitle>Crie primeiro a conta de anúncios</CardTitle><Hint><Link to="/estudio/anuncios">Ir para Anúncios</Link></Hint></Card>
  }

  function save(submitForReview: boolean) {
    const input: CreateAdCampaignInput = {
      name: name.trim(),
      objective,
      adSet: {
        name: setName_.trim(),
        dailyBudgetCents: budgetCents,
        startAt,
        endAt: endAt || null,
        states,
        cities,
        interests: automatic ? [] : interests,
        ageBands: automatic ? [] : ageBands,
        genders: automatic ? [] : genders,
        automaticAudience: automatic,
      },
      creative: {
        headline: headline.trim(),
        body: body.trim(),
        ctaLabel: cta,
        destinationUrl: url.trim(),
        mediaItems: picker.inputs().length ? picker.inputs() : undefined,
      },
      submitForReview,
    }
    create.mutate(input, {
      onSuccess: () => {
        // Salvo: o arquivo agora é do anúncio (não apagar no servidor).
        picker.markSaved()
        navigate('/estudio/anuncios')
      },
    })
  }

  const where = cities.length ? cities.join(', ') : states.length ? states.join(', ') : 'Brasil todo'

  return (
    <>
      <Head>
        <div>
          <Title>Criar campanha</Title>
          <Sub>Fica salva como rascunho. Só roda depois que o anúncio for aprovado e a conta tiver saldo.</Sub>
        </div>
        <SecondaryButton as={Link} to="/estudio/anuncios">Cancelar</SecondaryButton>
      </Head>

      <Steps aria-label="Etapas">
        {STEPS.map((label, index) => (
          <StepItem key={label} $state={index < step ? 'done' : index === step ? 'current' : 'next'} aria-current={index === step ? 'step' : undefined}>
            {index + 1}. {label}
          </StepItem>
        ))}
      </Steps>


      <Card>
        {step === 0 && (
          <>
            <Field>
              <Label htmlFor="campaign-name">Nome da campanha</Label>
              <Input id="campaign-name" value={name} maxLength={AD_LIMITS.NAME_MAX} placeholder="Ex.: Promoção de dezembro" onChange={(event) => setName(event.target.value)} />
              <Hint>Só você e sua equipe veem esse nome.</Hint>
            </Field>
            <Label as="p">O que você quer com esta campanha?</Label>
            {AD_OBJECTIVES.map((value) => (
              <ObjectiveOption key={value} type="button" $selected={objective === value} aria-pressed={objective === value} onClick={() => setObjective(value)}>
                <OptionTitle>{AD_OBJECTIVE_LABELS[value].label}</OptionTitle>
                <Hint>{AD_OBJECTIVE_LABELS[value].hint} {AD_OBJECTIVE_LABELS[value].billing}.</Hint>
              </ObjectiveOption>
            ))}
          </>
        )}

        {step === 1 && (
          <>
            <Field>
              <Label htmlFor="set-name">Nome do público</Label>
              <Input id="set-name" value={setName_} maxLength={AD_LIMITS.NAME_MAX} onChange={(event) => setSetName(event.target.value)} />
            </Field>
            <Grid2>
              <Field>
                <Label htmlFor="budget">Orçamento por dia (R$)</Label>
                <Input id="budget" inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} />
                <Hint>Mínimo {formatBRL(AD_LIMITS.MIN_DAILY_BUDGET_CENTS)}. O Votz nunca gasta mais que isso no dia.</Hint>
              </Field>
              <div />
              <Field>
                <Label htmlFor="start">Começa em</Label>
                <Input id="start" type="date" min={todayIso()} value={startAt} onChange={(event) => setStartAt(event.target.value)} />
              </Field>
              <Field>
                <Label htmlFor="end">Termina em (opcional)</Label>
                <Input id="end" type="date" min={startAt} value={endAt} onChange={(event) => setEndAt(event.target.value)} />
              </Field>
            </Grid2>

            <Field>
              <Label as="p">Estados (nenhum: Brasil todo)</Label>
              <Chips>
                {UFS.map((uf) => <Chip key={uf} type="button" $selected={states.includes(uf)} aria-pressed={states.includes(uf)} onClick={() => setStates(toggle(states, uf))}>{uf}</Chip>)}
              </Chips>
            </Field>
            <Field>
              <Label htmlFor="cities">Cidades (opcional, separadas por vírgula)</Label>
              <Input id="cities" value={citiesText} placeholder="Ex.: Campinas, Sorocaba" onChange={(event) => setCitiesText(event.target.value)} />
            </Field>

            <Field>
              <Label as="p">Quem vai ver</Label>
              <Chips>
                <Chip type="button" $selected={!automatic} aria-pressed={!automatic} onClick={() => setAutomatic(false)}>Eu escolho o público</Chip>
                <Chip type="button" $selected={automatic} aria-pressed={automatic} onClick={() => setAutomatic(true)}>Público automático</Chip>
              </Chips>
              <Hint style={{ marginTop: 6 }}>
                {automatic
                  ? 'O Votz encontra quem tem mais chance de se interessar, dentro da região escolhida.'
                  : 'Idade, gênero e interesses só valem para quem permitiu anúncios personalizados. Os outros veem por cidade.'}
              </Hint>
            </Field>

            {!automatic && (
              <>
                <Field>
                  <Label as="p">Faixa de idade (nenhuma: todas)</Label>
                  <Chips>{AGE_BANDS.map((band) => <Chip key={band} type="button" $selected={ageBands.includes(band)} aria-pressed={ageBands.includes(band)} onClick={() => setAgeBands(toggle(ageBands, band))}>{band}</Chip>)}</Chips>
                </Field>
                <Field>
                  <Label as="p">Gênero (nenhum: todos)</Label>
                  <Chips>{USER_GENDERS.filter((gender) => gender !== 'UNDISCLOSED').map((gender) => <Chip key={gender} type="button" $selected={genders.includes(gender)} aria-pressed={genders.includes(gender)} onClick={() => setGenders(toggle(genders, gender))}>{USER_GENDER_LABELS[gender]}</Chip>)}</Chips>
                </Field>
                <Field>
                  <Label as="p">Interesses (nenhum: todos)</Label>
                  <Chips>{AD_INTERESTS.map((interest) => <Chip key={interest.id} type="button" $selected={interests.includes(interest.id)} aria-pressed={interests.includes(interest.id)} onClick={() => setInterests(toggle(interests, interest.id))}>{interest.label}</Chip>)}</Chips>
                  <Hint style={{ marginTop: 6 }}>Não existe segmentação por política, religião, saúde ou outros temas sensíveis.</Hint>
                </Field>
              </>
            )}

            <ReachBox aria-live="polite" data-testid="reach-estimate">
              <ReachLabel>Quantas pessoas podem ver</ReachLabel>
              {reach.data ? (
                <>
                  <ReachValue>{reach.data.label}</ReachValue>
                  <Hint>{reach.data.note}</Hint>
                </>
              ) : reach.isError ? (
                <Hint>Não deu para estimar agora. Você pode continuar mesmo assim.</Hint>
              ) : (
                <Hint>Calculando…</Hint>
              )}
            </ReachBox>
          </>
        )}

        {step === 2 && (
          <Grid2>
            <div>
              <Field>
                <Label htmlFor="headline">Título</Label>
                <Input id="headline" value={headline} maxLength={AD_LIMITS.HEADLINE_MAX} onChange={(event) => setHeadline(event.target.value)} />
                <Hint>{headline.length}/{AD_LIMITS.HEADLINE_MAX}</Hint>
              </Field>
              <Field>
                <Label htmlFor="body">Texto</Label>
                <TextArea id="body" value={body} maxLength={AD_LIMITS.BODY_MAX} onChange={(event) => setBody(event.target.value)} />
                <Hint>{body.length}/{AD_LIMITS.BODY_MAX}</Hint>
              </Field>
              <Field>
                <Label htmlFor="cta">Texto do botão</Label>
                <Select id="cta" value={cta} onChange={(event) => setCta(event.target.value as AdCtaLabel)}>
                  {AD_CTA_LABELS.map((label) => <option key={label} value={label}>{label}</option>)}
                </Select>
              </Field>
              <Field>
                <Label htmlFor="url">Link do botão</Label>
                <Input id="url" type="url" value={url} maxLength={AD_LIMITS.URL_MAX} onChange={(event) => setUrl(event.target.value)} />
                <Hint>Precisa começar com https://.</Hint>
              </Field>
              <Field>
                <AdMediaPicker picker={picker} />
              </Field>
            </div>
            <div>
              <Label as="p">Como vai aparecer no feed</Label>
              <Preview aria-label="Prévia do anúncio">
                <Sponsored>{activeContext.name} · Patrocinado</Sponsored>
                <OptionTitle>{headline || 'Seu título'}</OptionTitle>
                <Hint>{body || 'Seu texto aparece aqui.'}</Hint>
                {first && (
                  <MediaFrame $ratio={`${MEDIA_FORMATS[format].width} / ${MEDIA_FORMATS[format].height}`}>
                    <CroppedMedia item={first} format={format} label="Prévia da foto ou do vídeo do anúncio" />
                    {first.status === 'uploading' && <FrameStatus role="status">Enviando {first.progress}%</FrameStatus>}
                    {files.length > 1 && <FrameStatus>1 de {files.length}</FrameStatus>}
                  </MediaFrame>
                )}
                <PreviewCta>{cta}</PreviewCta>
              </Preview>
            </div>
          </Grid2>
        )}

        {step === 3 && (
          <>
            <Summary>
              <dt>Campanha</dt><dd>{name}</dd>
              <dt>Objetivo</dt><dd>{AD_OBJECTIVE_LABELS[objective].label} ({AD_OBJECTIVE_LABELS[objective].billing.toLowerCase()})</dd>
              <dt>Orçamento</dt><dd>{formatBRL(budgetCents)} por dia, de {startAt.split('-').reverse().join('/')}{endAt ? ` até ${endAt.split('-').reverse().join('/')}` : ' sem data para acabar'}</dd>
              <dt>Onde</dt><dd>{where}</dd>
              <dt>Quem</dt><dd>{automatic ? 'Público automático' : [ageBands.length ? `${ageBands.join(', ')} anos` : 'Todas as idades', genders.map((gender) => USER_GENDER_LABELS[gender]).join(', '), interests.map((id) => AD_INTERESTS.find((interest) => interest.id === id)?.label).join(', ')].filter(Boolean).join(' · ')}</dd>
              <dt>Anúncio</dt><dd>{headline} · botão "{cta}" → {url}</dd>
              <dt>Foto ou vídeo</dt><dd>{first ? `${hasVideo ? 'Vídeo' : files.length > 1 ? `Carrossel com ${files.length} fotos` : 'Foto'} no formato ${MEDIA_FORMATS[format].label.toLowerCase()} (${MEDIA_FORMATS[format].ratioLabel})` : 'Só texto'}</dd>
            </Summary>
            <Hint style={{ marginTop: 14 }}>
              Ao enviar para revisão, o Votz confere se o anúncio segue a política de anúncios. Política, órgãos públicos, apostas e
              temas sensíveis são proibidos.
            </Hint>
          </>
        )}

        {currentProblems.length > 0 && step < 3 && <ErrorMsg role="alert">{currentProblems[0]}</ErrorMsg>}
        {create.isError && <ErrorMsg role="alert">{adsErrorMessage(create.error)}</ErrorMsg>}

        <Row style={{ marginTop: 18, justifyContent: 'space-between' }}>
          <SecondaryButton type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>Voltar</SecondaryButton>
          {step < 3 ? (
            <PrimaryButton type="button" disabled={currentProblems.length > 0} onClick={() => setStep(step + 1)}>Continuar</PrimaryButton>
          ) : (
            <Row>
              <SecondaryButton type="button" disabled={create.isPending} onClick={() => save(false)}>Salvar rascunho</SecondaryButton>
              <PrimaryButton type="button" disabled={create.isPending} onClick={() => save(true)}>{create.isPending ? 'Salvando…' : 'Salvar e enviar para revisão'}</PrimaryButton>
            </Row>
          )}
        </Row>
      </Card>
    </>
  )
}
