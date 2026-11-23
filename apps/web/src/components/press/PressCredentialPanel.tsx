import { useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import {
  PRESS_CREDENTIAL_LIMITS as L,
  PRESS_CREDENTIAL_STATUS_LABELS,
  PRESS_OUTLET_LABELS,
  PRESS_OUTLET_TYPES,
  type MyPressCredential,
  type PressOutletType,
} from '@votz/shared-types'
import { Button } from '../ui/Button'
import { useAuthStore } from '../../store/auth.store'
import {
  apiErrorMessage,
  useCreatePressCredential,
  useMyPressCredential,
  useResendPressEmail,
} from '../../hooks/usePressCredential'

const Box = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 24px 28px;
  margin-bottom: 40px;
  @media (max-width: 640px) { padding: 18px 16px; }
`
const Title = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.primary};
  margin: 0 0 6px;
`
const Text = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.6;
  margin: 0 0 14px;
  max-width: 640px;
`
const List = styled.ul`
  margin: 0 0 16px;
  padding-left: 18px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.6;
`
const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`
const Field = styled.label<{ $wide?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  ${({ $wide }) => ($wide ? 'grid-column: 1 / -1;' : '')}
  small { font-weight: 400; color: ${({ theme }) => theme.colors.muted}; }
`
const inputCss = `
  font: inherit; font-size: 0.875rem; font-weight: 400;
  padding: 10px 12px; border-radius: 8px; border: 1px solid #E5E5E5; background: #fff;
  &:focus { outline: 2px solid #1A1A2E; outline-offset: 0; }
`
const Input = styled.input`${inputCss}`
const Select = styled.select`${inputCss}`
const TextArea = styled.textarea`${inputCss} resize: vertical; min-height: 64px;`
const Row = styled.div`display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px;`
const Msg = styled.div<{ $error?: boolean }>`
  margin-top: 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme, $error }) => ($error ? theme.colors.action : theme.colors.muted)};
`
const Badge = styled.span<{ $tone: 'wait' | 'ok' | 'bad' }>`
  display: inline-block;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  padding: 3px 8px;
  border-radius: ${({ theme }) => theme.radii.sm};
  margin-bottom: 10px;
  color: #fff;
  background: ${({ theme, $tone }) => ($tone === 'ok' ? theme.colors.positive : $tone === 'bad' ? theme.colors.action : theme.colors.primary)};
`

interface FormState {
  outletName: string
  outletType: PressOutletType
  jobTitle: string
  website: string
  newsroomEmail: string
  coverageArea: string
  portfolio: string[]
  note: string
}

const EMPTY: FormState = {
  outletName: '', outletType: 'PORTAL', jobTitle: '', website: '', newsroomEmail: '',
  coverageArea: '', portfolio: [''], note: '',
}

function CredentialForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState('')
  const create = useCreatePressCredential()
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const portfolioUrls = form.portfolio.map((u) => u.trim()).filter(Boolean)
    if (portfolioUrls.length === 0) {
      setError('Coloque ao menos 1 link de matéria publicada.')
      return
    }
    create.mutate(
      {
        outletName: form.outletName,
        outletType: form.outletType,
        jobTitle: form.jobTitle || undefined,
        website: form.website,
        newsroomEmail: form.newsroomEmail,
        coverageArea: form.coverageArea || undefined,
        portfolioUrls,
        note: form.note || undefined,
      },
      {
        onSuccess: onDone,
        onError: (err) => setError(apiErrorMessage(err, 'Não foi possível enviar o pedido. Confira os campos e tente de novo.')),
      },
    )
  }

  return (
    <form onSubmit={submit}>
      <Grid>
        <Field>
          Nome do veículo (ou o seu nome, se for freelancer)
          <Input required minLength={2} maxLength={L.OUTLET_NAME_MAX} value={form.outletName} onChange={(e) => set('outletName', e.target.value)} />
        </Field>
        <Field>
          Tipo
          <Select value={form.outletType} onChange={(e) => set('outletType', e.target.value as PressOutletType)}>
            {PRESS_OUTLET_TYPES.map((t) => <option key={t} value={t}>{PRESS_OUTLET_LABELS[t]}</option>)}
          </Select>
        </Field>
        <Field>
          Site ou perfil público do veículo
          <Input required type="url" placeholder="https://..." maxLength={L.WEBSITE_MAX} value={form.website} onChange={(e) => set('website', e.target.value)} />
        </Field>
        <Field>
          E-mail da redação
          <Input required type="email" maxLength={L.EMAIL_MAX} value={form.newsroomEmail} onChange={(e) => set('newsroomEmail', e.target.value)} />
          <small>Vamos mandar um link para você confirmar. Quanto mais ligado ao veículo, mais rápida a análise.</small>
        </Field>
        <Field>
          Sua função (opcional)
          <Input maxLength={L.JOB_TITLE_MAX} placeholder="Repórter, editor, apresentador..." value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} />
        </Field>
        <Field>
          O que você cobre (opcional)
          <Input maxLength={L.COVERAGE_MAX} placeholder="Saúde e transporte na região de..." value={form.coverageArea} onChange={(e) => set('coverageArea', e.target.value)} />
        </Field>
        <Field $wide>
          Links de matérias que você assinou ou publicou (de 1 a {L.PORTFOLIO_MAX})
          {form.portfolio.map((url, i) => (
            <Input
              key={i}
              type="url"
              placeholder="https://..."
              maxLength={L.WEBSITE_MAX}
              value={url}
              onChange={(e) => set('portfolio', form.portfolio.map((u, j) => (j === i ? e.target.value : u)))}
            />
          ))}
          {form.portfolio.length < L.PORTFOLIO_MAX && (
            <Button type="button" variant="ghost" size="sm" onClick={() => set('portfolio', [...form.portfolio, ''])}>
              + Outro link
            </Button>
          )}
        </Field>
        <Field $wide>
          Quer dizer mais alguma coisa para a nossa equipe? (opcional)
          <TextArea maxLength={L.NOTE_MAX} value={form.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
      </Grid>
      {error && <Msg $error>{error}</Msg>}
      <Row>
        <Button type="submit" variant="action" disabled={create.isPending}>
          {create.isPending ? 'Enviando…' : 'Enviar pedido'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={create.isPending}>Cancelar</Button>
      </Row>
    </form>
  )
}

function PendingView({ credential }: { credential: MyPressCredential }) {
  const resend = useResendPressEmail()
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')

  function onResend() {
    setInfo('')
    setError('')
    resend.mutate(undefined, {
      onSuccess: (r) => setInfo(r.alreadyConfirmed ? 'O e-mail já está confirmado.' : 'Enviamos um novo e-mail. Veja a caixa de entrada e o spam.'),
      onError: (err) => setError(apiErrorMessage(err, 'Não foi possível reenviar agora.')),
    })
  }

  return (
    <>
      <Badge $tone="wait">{PRESS_CREDENTIAL_STATUS_LABELS.PENDING}</Badge>
      <Title>Pedido enviado: {credential.outletName}</Title>
      {credential.emailConfirmed ? (
        <Text>E-mail da redação confirmado. Agora é só esperar a nossa equipe analisar. Avisamos aqui e por e-mail.</Text>
      ) : (
        <>
          <Text>
            <b>Falta um passo:</b> abra o e-mail que mandamos para <b>{credential.newsroomEmail}</b> e clique em "Confirmar e-mail".
            A nossa equipe só analisa o pedido depois disso. O link vale por 48 horas.
          </Text>
          <Row>
            <Button variant="outline" size="sm" onClick={onResend} disabled={resend.isPending}>
              {resend.isPending ? 'Enviando…' : 'Reenviar e-mail'}
            </Button>
          </Row>
        </>
      )}
      {info && <Msg>{info}</Msg>}
      {error && <Msg $error>{error}</Msg>}
    </>
  )
}

export function PressCredentialPanel() {
  const user = useAuthStore((s) => s.user)
  const sessionReady = useAuthStore((s) => s.sessionReady)
  const [open, setOpen] = useState(false)
  const loggedIn = !!user
  const { data: mine, isLoading } = useMyPressCredential(loggedIn)

  if (!sessionReady) return null

  if (!loggedIn) {
    return (
      <Box>
        <Title>Você é jornalista?</Title>
        <Text>
          Peça a credencial de imprensa do Votz: baixe os relatos em planilha (CSV) e receba um e-mail quando um surto de
          relatos for detectado. É de graça para quem comprovar que trabalha com jornalismo.
        </Text>
        <Link to="/login?redirect=/imprensa"><Button variant="action">Entrar para pedir a credencial</Button></Link>
      </Box>
    )
  }

  if (isLoading) return null

  if (mine?.status === 'PENDING') {
    return <Box><PendingView credential={mine} /></Box>
  }

  if (mine?.status === 'APPROVED') {
    return (
      <Box>
        <Badge $tone="ok">{PRESS_CREDENTIAL_STATUS_LABELS.APPROVED}</Badge>
        <Title>Credencial aprovada: {mine.outletName}</Title>
        <Text>Se o painel de imprensa ainda não apareceu aqui em cima, recarregue a página.</Text>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Recarregar</Button>
      </Box>
    )
  }

  return (
    <Box>
      {mine && (mine.status === 'REJECTED' || mine.status === 'REVOKED') && (
        <>
          <Badge $tone="bad">{PRESS_CREDENTIAL_STATUS_LABELS[mine.status]}</Badge>
          <Text>
            {mine.status === 'REJECTED' ? 'Seu último pedido não foi aprovado.' : 'Sua credencial foi cancelada.'}
            {mine.reviewNote ? <> <b>Motivo:</b> {mine.reviewNote}</> : null}
            {' '}Você pode corrigir os dados e pedir de novo depois de alguns dias.
          </Text>
        </>
      )}
      <Title>Credencial de imprensa</Title>
      {open ? (
        <CredentialForm onDone={() => setOpen(false)} />
      ) : (
        <>
          <Text>Para jornalistas, veículos e freelancers. É de graça e a nossa equipe confere cada pedido. Você vai ter:</Text>
          <List>
            <li>Baixar os relatos em planilha (CSV), com filtro por estado, cidade e tema;</li>
            <li>E-mail de alerta quando o Votz detectar um surto de relatos;</li>
            <li>O selo de verificado na sua conta.</li>
          </List>
          <Text>Você vai precisar do site do veículo, de um e-mail da redação e de links de matérias publicadas.</Text>
          <Button variant="action" onClick={() => setOpen(true)}>Pedir credencial</Button>
        </>
      )}
    </Box>
  )
}
