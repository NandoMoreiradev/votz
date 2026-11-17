import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { MIN_AGE, PRIVACY_VERSION, TERMS_VERSION } from '@votz/shared-types'
import { Button } from '../components/ui/Button'
import { GoogleButton } from '../components/ui/GoogleButton'
import { CepInput, ManualAddressFields, EditLink, type CepAddressResult } from '../components/ui/CepInput'
import { PhoneInput } from '../components/ui/PhoneInput'
import { useRegister, type RegisterPayload } from '../hooks/useAuth'
import { useAuthStore } from '../store/auth.store'
import logoSrc from '../assets/brand/votz-logo.svg'

// ── Styled ─────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
`

const Card = styled.div`
  width: 100%;
  max-width: 460px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 40px;
`

const Logo = styled(Link)`
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
`

const LogoImg = styled.img`
  height: 44px;
  width: auto;
  display: block;
`

const Subtitle = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.9375rem;
  margin-bottom: 32px;
`

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const SectionLabel = styled.p`
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 8px;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text};
`

const Input = styled.input<{ $error?: boolean }>`
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid ${({ $error, theme }) => ($error ? theme.colors.action : theme.colors.border)};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  outline: none;
  transition: border-color 0.15s;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
`

const TwoCol = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
`

const Hint = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
`

const ErrorMsg = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.action};
`

const ConsentBox = styled.label<{ $error?: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.875rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  padding: 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1.5px solid ${({ $error, theme }) => ($error ? theme.colors.action : theme.colors.border)};
  background: ${({ theme }) => theme.colors.surfaceHover};

  input {
    margin-top: 3px;
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    accent-color: ${({ theme }) => theme.colors.primary};
    cursor: pointer;
  }

  a {
    color: ${({ theme }) => theme.colors.primary};
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
    text-decoration: underline;
  }
`

const Footer = styled.p`
  text-align: center;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 20px;
  a {
    color: ${({ theme }) => theme.colors.primary};
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
  }
`

// ── Tipos ─────────────────────────────────────────────────────────────────

interface FormValues {
  name: string
  email: string
  password: string
  zipCode: string
  streetNumber: string
  complement?: string
}

// ── Componente ─────────────────────────────────────────────────────────────

export function Register() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/'
  const convite = searchParams.get('convite')
  const user = useAuthStore((s) => s.user)
  const { mutate: register_, isPending, error } = useRegister()

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormValues>()

  // Phone state
  const [phoneE164, setPhoneE164] = useState('')
  const [phoneError, setPhoneError] = useState('')

  // CEP state — campos vindos do BrasilAPI
  const [zipCode, setZipCode] = useState('')
  const [cepError, setCepError] = useState('')
  const [address, setAddress] = useState<CepAddressResult | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [street, setStreet] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [acceptedLegal, setAcceptedLegal] = useState(false)
  const [legalError, setLegalError] = useState('')

  useEffect(() => {
    if (user) navigate(redirect, { replace: true })
  }, [user, navigate, redirect])

  function handleCepChange(digits: string) {
    setZipCode(digits)
    if (digits.length === 8) setCepError('')
  }

  function handleAddressFetched(data: CepAddressResult) {
    setAddress(data)
    setStreet(data.street)
    setNeighborhood(data.neighborhood)
    setCepError('')
    setValue('zipCode', data.zipCode)
  }

  function onSubmit(data: FormValues) {
    let hasError = false

    if (!phoneE164) {
      setPhoneError('Telefone obrigatório.')
      hasError = true
    } else {
      setPhoneError('')
    }

    if (!address) {
      setCepError('Digite um CEP válido para continuar.')
      hasError = true
    }

    if (!acceptedLegal) {
      setLegalError(`Confirme que você tem ${MIN_AGE} anos ou mais e concorda com os termos para continuar.`)
      hasError = true
    } else {
      setLegalError('')
    }

    if (hasError) return

    const payload: RegisterPayload = {
      name: data.name,
      email: data.email,
      password: data.password,
      phone: phoneE164,
      zipCode: address!.zipCode,
      streetNumber: data.streetNumber,
      complement: data.complement,
      street: street || address!.street,
      neighborhood: neighborhood || address!.neighborhood,
      city: address!.city,
      state: address!.state,
      latitude: address!.latitude,
      longitude: address!.longitude,
      acceptedTermsVersion: TERMS_VERSION,
      acceptedPrivacyVersion: PRIVACY_VERSION,
      confirmAge18: true,
    }

    register_(payload, { onSuccess: () => navigate(redirect, { replace: true }) })
  }

  return (
    <Page>
      <Card>
        <Logo to="/" aria-label="Votz — página inicial"><LogoImg src={logoSrc} alt="Votz" /></Logo>
        <Subtitle>Grátis para sempre. Sua voz importa.</Subtitle>

        {convite && (
          <div
            style={{
              background: 'rgba(45, 198, 83, 0.1)',
              border: '1px solid rgba(45, 198, 83, 0.35)',
              borderRadius: 10,
              padding: '10px 14px',
              marginBottom: 20,
              fontSize: '0.875rem',
              color: '#166534',
              textAlign: 'center',
            }}
          >
            Você recebeu um convite para entrar no Votz! Crie sua conta gratuita abaixo.
          </div>
        )}

        <Form onSubmit={handleSubmit(onSubmit)}>
          {/* ── Dados pessoais ── */}
          <SectionLabel>Dados pessoais</SectionLabel>

          <Field>
            <Label>Nome completo</Label>
            <Input
              type="text"
              placeholder="João Silva"
              $error={!!errors.name}
              {...register('name', {
                required: 'Obrigatório',
                minLength: { value: 2, message: 'Mínimo 2 caracteres' },
              })}
            />
            {errors.name && <ErrorMsg>{errors.name.message}</ErrorMsg>}
          </Field>

          <Field>
            <Label>E-mail</Label>
            <Input
              type="email"
              placeholder="joao@email.com"
              $error={!!errors.email}
              {...register('email', { required: 'Obrigatório' })}
            />
            {errors.email && <ErrorMsg>{errors.email.message}</ErrorMsg>}
          </Field>

          <Field>
            <Label>Telefone</Label>
            <PhoneInput
              value={phoneE164}
              onChange={(e164) => { setPhoneE164(e164); if (e164) setPhoneError('') }}
              error={phoneError}
            />
          </Field>

          <Field>
            <Label>Senha</Label>
            <Input
              type="password"
              placeholder="Mínimo 8 caracteres"
              $error={!!errors.password}
              {...register('password', {
                required: 'Obrigatório',
                minLength: { value: 8, message: 'Mínimo 8 caracteres' },
                pattern: { value: /[A-Z]/, message: 'Precisa ter uma letra maiúscula' },
              })}
            />
            {errors.password
              ? <ErrorMsg>{errors.password.message}</ErrorMsg>
              : <Hint>Mínimo 8 caracteres, com maiúscula e número.</Hint>
            }
          </Field>

          {/* ── Localização ── */}
          <SectionLabel>Localização</SectionLabel>

          <Field>
            <Label>CEP</Label>
            <CepInput
              value={zipCode}
              onChange={handleCepChange}
              onAddressFetched={handleAddressFetched}
              error={cepError}
            />
            {address && !showManual && (
              <EditLink type="button" onClick={() => setShowManual(true)}>
                Editar endereço manualmente
              </EditLink>
            )}
          </Field>

          {showManual && address && (
            <ManualAddressFields
              street={street}
              neighborhood={neighborhood}
              onStreetChange={setStreet}
              onNeighborhoodChange={setNeighborhood}
              city={address.city}
              state={address.state}
            />
          )}

          <TwoCol>
            <Field>
              <Label>Número</Label>
              <Input
                type="text"
                placeholder="1000"
                $error={!!errors.streetNumber}
                {...register('streetNumber', {
                  required: 'Obrigatório',
                  maxLength: { value: 20, message: 'Máximo 20 caracteres' },
                })}
              />
              {errors.streetNumber && <ErrorMsg>{errors.streetNumber.message}</ErrorMsg>}
            </Field>

            <Field>
              <Label>Complemento</Label>
              <Input
                type="text"
                placeholder="Apto 42"
                {...register('complement', {
                  maxLength: { value: 60, message: 'Máximo 60 caracteres' },
                })}
              />
            </Field>
          </TwoCol>

          {/* ── Aceite legal e idade mínima ── */}
          <Field>
            <ConsentBox $error={!!legalError}>
              <input
                type="checkbox"
                checked={acceptedLegal}
                onChange={(e) => {
                  setAcceptedLegal(e.target.checked)
                  if (e.target.checked) setLegalError('')
                }}
              />
              <span>
                Tenho {MIN_AGE} anos ou mais e li e concordo com os{' '}
                <Link to="/termos" target="_blank" rel="noopener noreferrer">Termos de Uso</Link>{' '}
                e a{' '}
                <Link to="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</Link>.
              </span>
            </ConsentBox>
            {legalError && <ErrorMsg>{legalError}</ErrorMsg>}
          </Field>

          {/* ── Erro geral ── */}
          {error && (
            <ErrorMsg>
              {(error as { response?: { data?: { message?: string } } })?.response?.data?.message
                ?? 'Não foi possível criar a conta. Verifique os dados e tente novamente.'}
            </ErrorMsg>
          )}

          <Button variant="action" fullWidth disabled={isPending}>
            {isPending ? 'Criando conta...' : 'Criar conta grátis'}
          </Button>
        </Form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
          <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #E5E5E5' }} />
          <span style={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>ou</span>
          <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #E5E5E5' }} />
        </div>

        <GoogleButton label="Cadastrar com Google" />

        <Footer>
          Já tem conta? <Link to="/entrar">Entrar</Link>
        </Footer>
      </Card>
    </Page>
  )
}
