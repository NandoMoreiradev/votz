import { useState } from 'react'
import styled from 'styled-components'
import {
  CATEGORY_LABELS,
  PRESS_RADAR_FREQUENCY_LABELS,
  PRESS_RADAR_KINDS,
  PRESS_RADAR_KIND_HELP,
  PRESS_RADAR_KIND_LABELS,
  PRESS_RADAR_LIMITS as L,
  getCategoryLabel,
  type Category,
  type PressPlanInfo,
  type PressRadarFrequency,
  type PressRadarKind,
  type PressRadarRuleView,
} from '@votz/shared-types'
import { Button } from '../ui/Button'
import { StateSelect, CitySelect } from '../ui/LocationSelect'
import { apiErrorMessage } from '../../hooks/usePressCredential'
import {
  useCreateRadarRule,
  useDeleteRadarRule,
  useRadarRules,
  useUpdateRadarRule,
} from '../../hooks/usePressTools'
import { SkeletonRows } from '../ui/Skeleton'

const Box = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px 24px;
  margin-bottom: 40px;
  @media (max-width: 640px) { padding: 16px; }
`
const Head = styled.div`display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 6px;`
const Title = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.primary};
  margin: 0;
`
const Text = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.6;
  margin: 0 0 14px;
  max-width: 680px;
`
const RuleRow = styled.div<{ $off?: boolean }>`
  display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 12px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  opacity: ${({ $off }) => ($off ? 0.55 : 1)};
`
const RuleName = styled.div`font-weight: ${({ theme }) => theme.fontWeights.semibold}; color: ${({ theme }) => theme.colors.text};`
const RuleMeta = styled.div`font-size: ${({ theme }) => theme.fontSizes.xs}; color: ${({ theme }) => theme.colors.muted}; margin-top: 2px;`
const Actions = styled.div`display: flex; gap: 8px; flex-wrap: wrap;`
const Grid = styled.div`
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0;
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`
const Field = styled.label<{ $wide?: boolean }>`
  display: flex; flex-direction: column; gap: 4px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  ${({ $wide }) => ($wide ? 'grid-column: 1 / -1;' : '')}
  small { font-weight: 400; color: ${({ theme }) => theme.colors.muted}; }
`
const controlCss = `
  font: inherit; font-size: 0.875rem; font-weight: 400;
  padding: 9px 12px; border-radius: 8px; border: 1px solid #E5E5E5; background: #fff;
  &:focus { outline: 2px solid #1A1A2E; outline-offset: 0; }
  &:disabled { opacity: .5; }
`
const Input = styled.input`${controlCss}`
const Select = styled.select`${controlCss}`
const StateField = styled(StateSelect)`${controlCss}`
const CityField = styled(CitySelect)`${controlCss}`
const Msg = styled.p<{ $error?: boolean }>`
  margin: 10px 0 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme, $error }) => ($error ? theme.colors.action : theme.colors.muted)};
`

export function describeRule(r: PressRadarRuleView): string {
  const parts: string[] = [PRESS_RADAR_KIND_LABELS[r.kind]]
  if (r.kind === 'PRESSURE' && r.minPressure) parts.push(`pressão a partir de ${r.minPressure}`)
  if (r.kind === 'UNANSWERED' && r.stalledDays) parts.push(`${r.stalledDays}+ dias sem resposta`)
  if (r.kind === 'UNANSWERED' && r.minPressure) parts.push(`pressão a partir de ${r.minPressure}`)
  parts.push(r.cities.length ? r.cities.join(', ') + (r.states.length ? `/${r.states.join(', ')}` : '') : r.states.length ? r.states.join(', ') : 'Brasil todo')
  parts.push(r.categories.length ? r.categories.map(getCategoryLabel).join(', ') : 'todos os temas')
  parts.push(PRESS_RADAR_FREQUENCY_LABELS[r.frequency])
  return parts.join(' · ')
}

function RuleForm({ info, onDone }: { info: PressPlanInfo; onDone: () => void }) {
  const create = useCreateRadarRule()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<PressRadarKind>('SURGE')
  const [state, setState] = useState('')
  const [city, setCity] = useState('')
  const [category, setCategory] = useState('')
  const [minPressure, setMinPressure] = useState('')
  const [stalledDays, setStalledDays] = useState('7')
  const [frequency, setFrequency] = useState<PressRadarFrequency>('DAILY')
  const [error, setError] = useState('')
  const canImmediate = info.limits.radarFrequencies.includes('IMMEDIATE')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    create.mutate(
      {
        name,
        kind,
        states: state ? [state] : [],
        cities: city ? [city] : [],
        categories: category ? [category as Category] : [],
        ...(kind === 'PRESSURE' || (kind === 'UNANSWERED' && minPressure) ? { minPressure: Number(minPressure) } : {}),
        ...(kind === 'UNANSWERED' ? { stalledDays: Number(stalledDays) } : {}),
        frequency,
      },
      {
        onSuccess: onDone,
        onError: (err) => setError(apiErrorMessage(err, 'Não foi possível criar o aviso. Confira os campos.')),
      },
    )
  }

  return (
    <form onSubmit={submit}>
      <Grid>
        <Field>
          Nome do aviso
          <Input required minLength={L.NAME_MIN} maxLength={L.NAME_MAX} placeholder="Ex.: Saúde em Campinas" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          Avisar quando
          <Select value={kind} onChange={(e) => setKind(e.target.value as PressRadarKind)}>
            {PRESS_RADAR_KINDS.map((k) => <option key={k} value={k}>{PRESS_RADAR_KIND_LABELS[k]}</option>)}
          </Select>
          <small>{PRESS_RADAR_KIND_HELP[kind]}</small>
        </Field>
        <Field>
          Estado (opcional)
          <StateField value={state} onChange={(v) => { setState(v); setCity('') }} placeholder="Todos os estados" />
        </Field>
        <Field>
          Cidade (opcional)
          <CityField uf={state} value={city} onChange={setCity} placeholder="Todas as cidades" />
        </Field>
        <Field>
          Tema (opcional)
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todos os temas</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field>
          Como receber
          <Select value={frequency} onChange={(e) => setFrequency(e.target.value as PressRadarFrequency)}>
            <option value="DAILY">{PRESS_RADAR_FREQUENCY_LABELS.DAILY}</option>
            <option value="IMMEDIATE" disabled={!canImmediate}>
              {PRESS_RADAR_FREQUENCY_LABELS.IMMEDIATE}{canImmediate ? '' : ' (só no Pro)'}
            </option>
          </Select>
        </Field>
        {(kind === 'PRESSURE' || kind === 'UNANSWERED') && (
          <Field>
            Pressão mínima {kind === 'UNANSWERED' ? '(opcional)' : ''}
            <Input
              type="number" min={L.MIN_PRESSURE_MIN} max={L.MIN_PRESSURE_MAX} step="any"
              required={kind === 'PRESSURE'} value={minPressure} onChange={(e) => setMinPressure(e.target.value)}
            />
            <small>A pressão aparece em cada relato. Comece perto de 50 e ajuste.</small>
          </Field>
        )}
        {kind === 'UNANSWERED' && (
          <Field>
            Dias sem resposta
            <Input type="number" min={L.STALLED_DAYS_MIN} max={L.STALLED_DAYS_MAX} required value={stalledDays} onChange={(e) => setStalledDays(e.target.value)} />
          </Field>
        )}
      </Grid>
      <Text>Você só recebe o que for novo a partir de agora. O que já existe hoje não vira e-mail.</Text>
      {error && <Msg $error>{error}</Msg>}
      <Actions style={{ marginTop: 12 }}>
        <Button type="submit" variant="action" disabled={create.isPending}>{create.isPending ? 'Criando…' : 'Criar aviso'}</Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={create.isPending}>Cancelar</Button>
      </Actions>
    </form>
  )
}

export function PressRadarPanel({ info }: { info: PressPlanInfo }) {
  const { data: rules, isLoading } = useRadarRules(true)
  const update = useUpdateRadarRule()
  const remove = useDeleteRadarRule()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const used = rules?.length ?? 0
  const full = used >= info.limits.maxRadarRules

  return (
    <Box>
      <Head>
        <Title>Radar de avisos</Title>
        {!adding && (
          <Button variant="action" size="sm" onClick={() => setAdding(true)} disabled={full}>+ Novo aviso</Button>
        )}
      </Head>
      <Text>
        Receba por e-mail (e no sino do Votz) o que importa para a sua cobertura: surtos, relatos com muita pressão e relatos sem
        resposta da entidade. Você está usando {used} de {info.limits.maxRadarRules} avisos.
        {full && ' Apague um para criar outro.'}
      </Text>

      {adding && <RuleForm info={info} onDone={() => setAdding(false)} />}

      {isLoading && <SkeletonRows rows={4} height={70} />}
      {!isLoading && used === 0 && !adding && (
        <Msg>Você ainda não criou nenhum aviso. Sem avisos próprios, você continua recebendo o e-mail padrão de todo surto detectado.</Msg>
      )}
      {(rules ?? []).map((r) => (
        <RuleRow key={r.id} $off={!r.active}>
          <div>
            <RuleName>{r.name}{!r.active ? ' (pausado)' : ''}</RuleName>
            <RuleMeta>{describeRule(r)}</RuleMeta>
          </div>
          <Actions>
            <Button
              variant="outline" size="sm" disabled={update.isPending}
              onClick={() => { setError(''); update.mutate({ id: r.id, active: !r.active }, { onError: (e) => setError(apiErrorMessage(e, 'Não foi possível mudar o aviso.')) }) }}
            >
              {r.active ? 'Pausar' : 'Religar'}
            </Button>
            <Button
              variant="ghost" size="sm" disabled={remove.isPending}
              onClick={() => { if (window.confirm(`Apagar o aviso "${r.name}"?`)) { setError(''); remove.mutate(r.id, { onError: (e) => setError(apiErrorMessage(e, 'Não foi possível apagar.')) }) } }}
            >
              Apagar
            </Button>
          </Actions>
        </RuleRow>
      ))}
      {error && <Msg $error>{error}</Msg>}
    </Box>
  )
}
