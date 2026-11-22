import { useMemo, useState } from 'react'
import {
  AD_CTA_LABELS,
  AD_EDIT_COPY,
  AD_INTERESTS,
  AD_LIMITS,
  AGE_BANDS,
  USER_GENDERS,
  USER_GENDER_LABELS,
  type AdCtaLabel,
  type AdInterestId,
  type AdSetView,
  type AdView,
  type AgeBand,
  type UpdateAdInput,
  type UpdateAdSetInput,
  type UserGender,
} from '@votz/shared-types'
import { adsErrorMessage, formatBRL, useUpdateAd, useUpdateAdSet } from '../../hooks/useAds'
import { Chip, Chips, ErrorMsg, Field, Grid2, Hint, Input, Label, PrimaryButton, Row, SecondaryButton, Select, TextArea } from './ads-ui'

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value])
/** "20" ou "20,50" → centavos. Vazio ou inválido: NaN. */
const reaisToCents = (value: string) => {
  const number = Number(value.replace(/\./g, '').replace(',', '.'))
  return value.trim() && Number.isFinite(number) ? Math.round(number * 100) : NaN
}
const centsToReais = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')
const todayIso = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
const isHttpsUrl = (value: string) => {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

/** Editar o texto, o botão e o link do anúncio. Aprovado ou em revisão volta para a revisão ao salvar. */
export function AdEditForm({ ad, companyId, accountId, onDone }: { ad: AdView; companyId: string; accountId: string; onDone: () => void }) {
  const update = useUpdateAd(companyId, accountId)
  const [headline, setHeadline] = useState(ad.creative.headline)
  const [body, setBody] = useState(ad.creative.body)
  const [cta, setCta] = useState<AdCtaLabel>(ad.creative.ctaLabel as AdCtaLabel)
  const [url, setUrl] = useState(ad.creative.destinationUrl)

  const changed =
    headline.trim() !== ad.creative.headline || body.trim() !== ad.creative.body || cta !== ad.creative.ctaLabel || url.trim() !== ad.creative.destinationUrl
  const problem =
    headline.trim().length < 2 ? 'Escreva o título.'
    : body.trim().length < 2 ? 'Escreva o texto do anúncio.'
    : !isHttpsUrl(url.trim()) ? 'O link precisa começar com https:// e ser um endereço válido.'
    : null
  const warning = ad.reviewStatus === 'APPROVED' ? AD_EDIT_COPY.REVIEW_AGAIN : ad.reviewStatus === 'PENDING' ? AD_EDIT_COPY.REVIEW_PENDING : null

  function save() {
    const input: UpdateAdInput = { headline: headline.trim(), body: body.trim(), ctaLabel: cta, destinationUrl: url.trim() }
    update.mutate({ adId: ad.id, ...input }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); if (!problem && changed) save() }} aria-label="Editar anúncio" style={{ marginTop: 12 }}>
      <Field>
        <Label htmlFor={`edit-headline-${ad.id}`}>Título</Label>
        <Input id={`edit-headline-${ad.id}`} value={headline} maxLength={AD_LIMITS.HEADLINE_MAX} onChange={(event) => setHeadline(event.target.value)} />
        <Hint>{headline.length}/{AD_LIMITS.HEADLINE_MAX}</Hint>
      </Field>
      <Field>
        <Label htmlFor={`edit-body-${ad.id}`}>Texto</Label>
        <TextArea id={`edit-body-${ad.id}`} value={body} maxLength={AD_LIMITS.BODY_MAX} onChange={(event) => setBody(event.target.value)} />
        <Hint>{body.length}/{AD_LIMITS.BODY_MAX}</Hint>
      </Field>
      <Grid2>
        <Field>
          <Label htmlFor={`edit-cta-${ad.id}`}>Texto do botão</Label>
          <Select id={`edit-cta-${ad.id}`} value={cta} onChange={(event) => setCta(event.target.value as AdCtaLabel)}>
            {AD_CTA_LABELS.map((label) => <option key={label} value={label}>{label}</option>)}
          </Select>
        </Field>
        <Field>
          <Label htmlFor={`edit-url-${ad.id}`}>Link do botão</Label>
          <Input id={`edit-url-${ad.id}`} type="url" value={url} maxLength={AD_LIMITS.URL_MAX} onChange={(event) => setUrl(event.target.value)} />
        </Field>
      </Grid2>
      <Hint>A foto ou o vídeo não mudam por aqui: crie uma cópia da campanha para usar outro arquivo.</Hint>
      {warning && <Hint style={{ color: 'inherit', fontWeight: 600 }}>{warning}</Hint>}
      {problem && changed && <ErrorMsg role="alert">{problem}</ErrorMsg>}
      {update.isError && <ErrorMsg role="alert">{adsErrorMessage(update.error)}</ErrorMsg>}
      <Row style={{ marginTop: 10 }}>
        <PrimaryButton type="submit" disabled={update.isPending || !changed || !!problem}>{update.isPending ? 'Salvando…' : 'Salvar'}</PrimaryButton>
        <SecondaryButton type="button" onClick={onDone}>Cancelar</SecondaryButton>
      </Row>
    </form>
  )
}

/** Editar público e orçamento. Não precisa de nova revisão. A data de início não muda. */
export function AdSetEditForm({ set, companyId, accountId, onDone }: { set: AdSetView; companyId: string; accountId: string; onDone: () => void }) {
  const update = useUpdateAdSet(companyId, accountId)
  const [name, setName] = useState(set.name)
  const [budget, setBudget] = useState(centsToReais(set.dailyBudgetCents))
  const [bid, setBid] = useState(set.bidCapCents ? centsToReais(set.bidCapCents) : '')
  const [endAt, setEndAt] = useState(set.endAt ? set.endAt.slice(0, 10) : '')
  const [states, setStates] = useState<string[]>(set.states)
  const [citiesText, setCitiesText] = useState(set.cities.join(', '))
  const [automatic, setAutomatic] = useState(set.automaticAudience)
  const [interests, setInterests] = useState<AdInterestId[]>(set.interests as AdInterestId[])
  const [ageBands, setAgeBands] = useState<AgeBand[]>(set.ageBands as AgeBand[])
  const [genders, setGenders] = useState<UserGender[]>(set.genders)

  const cities = useMemo(() => [...new Set(citiesText.split(',').map((city) => city.trim()).filter(Boolean))], [citiesText])
  const budgetCents = reaisToCents(budget)
  const bidCents = bid.trim() ? reaisToCents(bid) : null
  const started = set.startAt.slice(0, 10)
  const problem =
    name.trim().length < 2 ? 'Dê um nome ao público.'
    : !(budgetCents >= AD_LIMITS.MIN_DAILY_BUDGET_CENTS) ? `O orçamento mínimo é ${formatBRL(AD_LIMITS.MIN_DAILY_BUDGET_CENTS)} por dia.`
    : budgetCents > AD_LIMITS.MAX_DAILY_BUDGET_CENTS ? `O orçamento máximo é ${formatBRL(AD_LIMITS.MAX_DAILY_BUDGET_CENTS)} por dia.`
    : bidCents !== null && !(bidCents >= 1 && bidCents <= 100_000) ? 'O lance máximo precisa ser maior que zero e até R$ 1.000,00.'
    : endAt && endAt <= started ? 'A data de fim precisa ser depois da data de início.'
    : endAt && endAt < todayIso() ? 'A data de fim não pode ser antes de hoje.'
    : cities.length > AD_LIMITS.MAX_CITIES ? `Escolha no máximo ${AD_LIMITS.MAX_CITIES} cidades.`
    : null

  function save() {
    const input: UpdateAdSetInput = {
      name: name.trim(),
      dailyBudgetCents: budgetCents,
      bidCapCents: bidCents,
      endAt: endAt || null,
      states,
      cities,
      automaticAudience: automatic,
      ...(automatic ? {} : { interests, ageBands, genders }),
    }
    update.mutate({ adSetId: set.id, ...input }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); if (!problem) save() }} aria-label="Editar público e orçamento" style={{ marginTop: 12 }}>
      <Field>
        <Label htmlFor={`edit-set-name-${set.id}`}>Nome do público</Label>
        <Input id={`edit-set-name-${set.id}`} value={name} maxLength={AD_LIMITS.NAME_MAX} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Grid2>
        <Field>
          <Label htmlFor={`edit-budget-${set.id}`}>Orçamento por dia (R$)</Label>
          <Input id={`edit-budget-${set.id}`} inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} />
          <Hint>Mínimo {formatBRL(AD_LIMITS.MIN_DAILY_BUDGET_CENTS)}. Vale a partir de agora.</Hint>
        </Field>
        <Field>
          <Label htmlFor={`edit-bid-${set.id}`}>Lance máximo (R$, opcional)</Label>
          <Input id={`edit-bid-${set.id}`} inputMode="decimal" value={bid} placeholder="O Votz decide" onChange={(event) => setBid(event.target.value)} />
        </Field>
        <Field>
          <Label htmlFor={`edit-end-${set.id}`}>Termina em (opcional)</Label>
          <Input id={`edit-end-${set.id}`} type="date" min={todayIso()} value={endAt} onChange={(event) => setEndAt(event.target.value)} />
          <Hint>Começou em {new Date(set.startAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}; a data de início não muda.</Hint>
        </Field>
      </Grid2>

      <Field>
        <Label as="p">Estados (nenhum: Brasil todo)</Label>
        <Chips>
          {UFS.map((uf) => <Chip key={uf} type="button" $selected={states.includes(uf)} aria-pressed={states.includes(uf)} onClick={() => setStates(toggle(states, uf))}>{uf}</Chip>)}
        </Chips>
      </Field>
      <Field>
        <Label htmlFor={`edit-cities-${set.id}`}>Cidades (opcional, separadas por vírgula)</Label>
        <Input id={`edit-cities-${set.id}`} value={citiesText} onChange={(event) => setCitiesText(event.target.value)} />
      </Field>

      <Field>
        <Label as="p">Quem vai ver</Label>
        <Chips>
          <Chip type="button" $selected={!automatic} aria-pressed={!automatic} onClick={() => setAutomatic(false)}>Eu escolho o público</Chip>
          <Chip type="button" $selected={automatic} aria-pressed={automatic} onClick={() => setAutomatic(true)}>Público automático</Chip>
        </Chips>
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
          </Field>
        </>
      )}

      {problem && <ErrorMsg role="alert">{problem}</ErrorMsg>}
      {update.isError && <ErrorMsg role="alert">{adsErrorMessage(update.error)}</ErrorMsg>}
      <Row style={{ marginTop: 10 }}>
        <PrimaryButton type="submit" disabled={update.isPending || !!problem}>{update.isPending ? 'Salvando…' : 'Salvar'}</PrimaryButton>
        <SecondaryButton type="button" onClick={onDone}>Cancelar</SecondaryButton>
      </Row>
    </form>
  )
}
