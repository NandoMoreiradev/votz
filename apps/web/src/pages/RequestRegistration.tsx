import { useState } from 'react'
import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Navbar } from '../components/layout/Navbar'
import { useAuthStore } from '../store/auth.store'
import { useCnpj } from '../hooks/useCnpj'
import { api } from '../lib/api'

type RequestType = 'ENTITY' | 'POLITICIAN' | 'COMPANY'

// ── Styled ─────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 680px;
  margin: 0 auto;
  padding: 40px 24px 80px;
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 8px;
`

const Subtitle = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.9375rem;
  margin-bottom: 32px;
  line-height: 1.5;
`

const TypeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 32px;

  @media (max-width: 500px) { grid-template-columns: 1fr; }
`

const TypeCard = styled.button<{ $active: boolean }>`
  padding: 20px 16px;
  border-radius: ${({ theme }) => theme.radii.lg};
  border: 2px solid ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.border};
  background: ${({ $active, theme }) => $active ? theme.colors.primary + '0d' : theme.colors.white};
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;

  &:hover { border-color: ${({ theme }) => theme.colors.primary}; }
`

const TypeLabel = styled.div`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`

const TypeDesc = styled.div`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.4;
`

const Card = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.xl};
  padding: 32px;
`

const SectionTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 20px;
`

const Field = styled.div`
  margin-bottom: 20px;
`

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const Input = styled.input`
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  box-sizing: border-box;
  transition: border-color 0.15s;

  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
  &:disabled { background: ${({ theme }) => theme.colors.neutral}; color: ${({ theme }) => theme.colors.muted}; }
`

const Textarea = styled.textarea`
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  box-sizing: border-box;
  resize: vertical;
  min-height: 100px;
  font-family: inherit;
  transition: border-color 0.15s;

  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  @media (max-width: 500px) { grid-template-columns: 1fr; }
`

const CnpjRow = styled.div`
  display: flex;
  gap: 10px;
  align-items: flex-end;
`

const LookupBtn = styled.button`
  padding: 10px 18px;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s;

  &:hover { opacity: 0.88; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const InfoBox = styled.div<{ $variant: 'success' | 'error' }>`
  padding: 12px 16px;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  margin-bottom: 16px;
  background: ${({ $variant }) => $variant === 'success' ? '#dcfce7' : '#fee2e2'};
  color: ${({ $variant }) => $variant === 'success' ? '#14532d' : '#7f1d1d'};
`

const SubmitBtn = styled.button`
  width: 100%;
  padding: 14px;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 1rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  margin-top: 8px;
  transition: opacity 0.15s;

  &:hover { opacity: 0.88; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const Select = styled.select`
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  box-sizing: border-box;

  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`

// ── Formulários por tipo ───────────────────────────────────────────────────

function EntityForm({ onSubmit, loading }: { onSubmit: (p: Record<string, unknown>) => void; loading: boolean }) {
  const [form, setForm] = useState({ legalName: '', cnpj: '', type: 'CITY_HALL', city: '', state: '', website: '' })
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <>
      <Row>
        <Field>
          <Label>Razão Social *</Label>
          <Input value={form.legalName} onChange={s('legalName')} placeholder="Prefeitura Municipal de..." />
        </Field>
        <Field>
          <Label>CNPJ *</Label>
          <Input value={form.cnpj} onChange={s('cnpj')} placeholder="00.000.000/0001-00" />
        </Field>
      </Row>
      <Field>
        <Label>Tipo de Entidade *</Label>
        <Select value={form.type} onChange={s('type') as React.ChangeEventHandler<HTMLSelectElement>}>
          <option value="CITY_HALL">Prefeitura</option>
          <option value="HOSPITAL">Hospital / UBS</option>
          <option value="CONCESSIONAIRE">Concessionária</option>
          <option value="AUTARCHY">Autarquia</option>
          <option value="SECRETARIAT">Secretaria</option>
          <option value="OTHER">Outro</option>
        </Select>
      </Field>
      <Row>
        <Field>
          <Label>Cidade *</Label>
          <Input value={form.city} onChange={s('city')} placeholder="São Paulo" />
        </Field>
        <Field>
          <Label>Estado *</Label>
          <Input value={form.state} onChange={s('state')} maxLength={2} placeholder="SP" style={{ textTransform: 'uppercase' }} />
        </Field>
      </Row>
      <Field>
        <Label>Site (opcional)</Label>
        <Input value={form.website} onChange={s('website')} placeholder="https://..." />
      </Field>
      <SubmitBtn disabled={loading || !form.legalName || !form.cnpj || !form.city || !form.state}
        onClick={() => onSubmit(form)}>
        {loading ? 'Enviando…' : 'Enviar solicitação'}
      </SubmitBtn>
    </>
  )
}

function PoliticianForm({ onSubmit, loading }: { onSubmit: (p: Record<string, unknown>) => void; loading: boolean }) {
  const [form, setForm] = useState({ name: '', party: '', office: '', state: '', city: '', electoralZone: '', termStart: '', termEnd: '' })
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <>
      <Row>
        <Field>
          <Label>Nome completo *</Label>
          <Input value={form.name} onChange={s('name')} placeholder="Nome do político" />
        </Field>
        <Field>
          <Label>Partido (sigla) *</Label>
          <Input value={form.party} onChange={s('party')} placeholder="PT, PL, MDB..." />
        </Field>
      </Row>
      <Row>
        <Field>
          <Label>Cargo *</Label>
          <Input value={form.office} onChange={s('office')} placeholder="Vereador, Deputado..." />
        </Field>
        <Field>
          <Label>Zona Eleitoral *</Label>
          <Input value={form.electoralZone} onChange={s('electoralZone')} placeholder="Zona Norte" />
        </Field>
      </Row>
      <Row>
        <Field>
          <Label>Estado *</Label>
          <Input value={form.state} onChange={s('state')} maxLength={2} placeholder="SP" style={{ textTransform: 'uppercase' }} />
        </Field>
        <Field>
          <Label>Cidade</Label>
          <Input value={form.city} onChange={s('city')} placeholder="São Paulo" />
        </Field>
      </Row>
      <Row>
        <Field>
          <Label>Início do mandato *</Label>
          <Input type="date" value={form.termStart} onChange={s('termStart')} />
        </Field>
        <Field>
          <Label>Fim do mandato *</Label>
          <Input type="date" value={form.termEnd} onChange={s('termEnd')} />
        </Field>
      </Row>
      <SubmitBtn disabled={loading || !form.name || !form.party || !form.office || !form.state}
        onClick={() => onSubmit(form)}>
        {loading ? 'Enviando…' : 'Enviar solicitação'}
      </SubmitBtn>
    </>
  )
}

function CompanyForm({ onSubmit, loading }: { onSubmit: (p: Record<string, unknown>) => void; loading: boolean }) {
  const { data, loading: cnpjLoading, error: cnpjError, lookup } = useCnpj()
  const [cnpj, setCnpj] = useState('')
  const [form, setForm] = useState({ legalName: '', tradeName: '', sector: 'OTHER', size: 'SMALL', website: '' })
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleLookup = () => {
    lookup(cnpj).then(() => {
      if (data) {
        setForm(f => ({
          ...f,
          legalName:  data.razao_social,
          tradeName:  data.nome_fantasia || data.razao_social,
        }))
      }
    })
  }

  // sync form when cnpj data arrives
  const resolvedName = data?.razao_social ?? form.legalName
  const resolvedTrade = data?.nome_fantasia || resolvedName

  return (
    <>
      <Field>
        <Label>CNPJ *</Label>
        <CnpjRow>
          <Input value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0001-00"
            onKeyDown={e => e.key === 'Enter' && lookup(cnpj)} />
          <LookupBtn onClick={() => lookup(cnpj)} disabled={cnpjLoading || cnpj.replace(/\D/g,'').length < 14}>
            {cnpjLoading ? '…' : 'Buscar'}
          </LookupBtn>
        </CnpjRow>
      </Field>

      {cnpjError && <InfoBox $variant="error">{cnpjError}</InfoBox>}
      {data && <InfoBox $variant="success">✓ {data.razao_social} — {data.municipio}/{data.uf}</InfoBox>}

      <Row>
        <Field>
          <Label>Razão Social *</Label>
          <Input value={data ? data.razao_social : form.legalName}
            onChange={s('legalName')} disabled={!!data} placeholder="Nome empresarial" />
        </Field>
        <Field>
          <Label>Nome Fantasia</Label>
          <Input value={data ? (data.nome_fantasia || data.razao_social) : form.tradeName}
            onChange={s('tradeName')} disabled={!!data} placeholder="Como é conhecido" />
        </Field>
      </Row>
      <Row>
        <Field>
          <Label>Setor *</Label>
          <Select value={form.sector} onChange={s('sector') as React.ChangeEventHandler<HTMLSelectElement>}>
            <option value="TELECOM">Telecomunicações</option>
            <option value="SUPPLEMENTAL_HEALTH">Saúde Suplementar</option>
            <option value="FINANCIAL">Financeiro</option>
            <option value="ENERGY">Energia</option>
            <option value="TRANSPORTATION">Transporte</option>
            <option value="RETAIL">Varejo</option>
            <option value="FOOD">Alimentação</option>
            <option value="CONDOMINIUM">Condomínio</option>
            <option value="OTHER">Outro</option>
          </Select>
        </Field>
        <Field>
          <Label>Porte *</Label>
          <Select value={form.size} onChange={s('size') as React.ChangeEventHandler<HTMLSelectElement>}>
            <option value="MEI">MEI</option>
            <option value="SMALL">Pequena</option>
            <option value="MEDIUM">Média</option>
            <option value="LARGE">Grande</option>
          </Select>
        </Field>
      </Row>
      <Field>
        <Label>Site (opcional)</Label>
        <Input value={form.website} onChange={s('website')} placeholder="https://..." />
      </Field>
      <SubmitBtn
        disabled={loading || (!data && !form.legalName) || !cnpj}
        onClick={() => onSubmit({
          cnpj: cnpj.replace(/\D/g, ''),
          legalName:  data ? data.razao_social  : form.legalName,
          tradeName:  data ? (data.nome_fantasia || data.razao_social) : form.tradeName,
          sector:     form.sector,
          size:       form.size,
          website:    form.website || undefined,
          city:       data?.municipio,
          state:      data?.uf,
        })}>
        {loading ? 'Enviando…' : 'Enviar solicitação'}
      </SubmitBtn>
    </>
  )
}

// ── Componente principal ───────────────────────────────────────────────────

const TYPE_OPTIONS: { value: RequestType; label: string; desc: string }[] = [
  { value: 'ENTITY',    label: 'Entidade Pública', desc: 'Prefeitura, hospital, secretaria, autarquia' },
  { value: 'POLITICIAN', label: 'Político',        desc: 'Vereador, deputado, prefeito, senador' },
  { value: 'COMPANY',   label: 'Empresa',          desc: 'Empresas privadas com CNPJ ativo' },
]

export function RequestRegistration() {
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()
  const [type, setType] = useState<RequestType>('ENTITY')
  const [note, setNote] = useState('')
  const [success, setSuccess] = useState(false)

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post('/registration-requests', { type, payload, note: note || undefined }).then(r => r.data),
    onSuccess: () => setSuccess(true),
  })

  if (!user) {
    return (
      <Page>
        <Navbar />
        <Content>
          <InfoBox $variant="error">Você precisa estar logado para fazer uma solicitação.</InfoBox>
        </Content>
      </Page>
    )
  }

  if (success) {
    return (
      <Page>
        <Navbar />
        <Content>
          <InfoBox $variant="success">
            ✓ Solicitação enviada! Nossa equipe vai revisar em até 48 horas.
          </InfoBox>
          <SubmitBtn onClick={() => navigate('/')} style={{ marginTop: 0 }}>Voltar ao início</SubmitBtn>
        </Content>
      </Page>
    )
  }

  return (
    <Page>
      <Navbar />
      <Content>
        <Title>Solicitar Cadastro</Title>
        <Subtitle>
          Não encontrou a entidade, político ou empresa que procura? Envie uma solicitação
          e nossa equipe vai cadastrar em até 48 horas.
        </Subtitle>

        <TypeGrid>
          {TYPE_OPTIONS.map(opt => (
            <TypeCard key={opt.value} $active={type === opt.value} onClick={() => setType(opt.value)}>
              <TypeLabel>{opt.label}</TypeLabel>
              <TypeDesc>{opt.desc}</TypeDesc>
            </TypeCard>
          ))}
        </TypeGrid>

        <Card>
          <SectionTitle>
            {type === 'ENTITY' && 'Dados da Entidade Pública'}
            {type === 'POLITICIAN' && 'Dados do Político'}
            {type === 'COMPANY' && 'Dados da Empresa'}
          </SectionTitle>

          {type === 'ENTITY'    && <EntityForm    onSubmit={p => mutation.mutate(p)} loading={mutation.isPending} />}
          {type === 'POLITICIAN' && <PoliticianForm onSubmit={p => mutation.mutate(p)} loading={mutation.isPending} />}
          {type === 'COMPANY'   && <CompanyForm   onSubmit={p => mutation.mutate(p)} loading={mutation.isPending} />}

          {mutation.isError && (
            <InfoBox $variant="error" style={{ marginTop: 16 }}>
              Erro ao enviar. Verifique os dados e tente novamente.
            </InfoBox>
          )}

          <Field style={{ marginTop: 24 }}>
            <Label>Contexto adicional (opcional)</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="Explique por que esse cadastro é importante, links de referência, etc." />
          </Field>
        </Card>
      </Content>
    </Page>
  )
}
