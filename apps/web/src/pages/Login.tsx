import { useEffect, useRef, useState, type ReactNode } from 'react'
import styled from 'styled-components'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import {
  ArrowLeft,
  ChartLineUp,
  Eye,
  EyeSlash,
  LockKey,
  Megaphone,
  ShieldCheck,
} from '@phosphor-icons/react'
import { Button } from '../components/ui/Button'
import { GoogleButton } from '../components/ui/GoogleButton'
import { ProfileSelectModal } from '../components/ui/ProfileSelectModal'
import {
  useGooglePendingMfa,
  useLogin,
  useMfaVerify,
  useMfaSetupForced,
  useMfaEnableForced,
  useMyProfiles,
  useSwitchContext,
} from '../hooks/useAuth'
import { useAuthStore } from '../store/auth.store'
import { useAppTheme } from '../theme/ThemeContext'
import { AuthUser } from '../types/api'
import logoLightSrc from '../assets/brand/votz-logo.svg'
import logoDarkSrc from '../assets/brand/votz-logo-dark.svg'

// ── Layout ─────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(380px, 46%) 1fr;
  background: ${({ theme }) => theme.colors.neutral};

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`

const BrandPanel = styled.aside`
  position: relative;
  overflow: hidden;
  background: #141724;
  color: #ffffff;
  padding: 40px 48px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 32px;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(620px circle at 12% 18%, rgba(230, 57, 70, 0.22), transparent 60%),
      radial-gradient(520px circle at 88% 85%, rgba(45, 198, 83, 0.14), transparent 58%);
    pointer-events: none;
  }

  @media (max-width: 960px) {
    display: none;
  }
`

const BrandTop = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
`

const BrandLogoLink = styled(Link)`
  display: inline-flex;
  align-items: center;
`

const BrandLogoImg = styled.img`
  height: 36px;
  width: auto;
  display: block;
`

const BrandCenter = styled.div`
  position: relative;
  z-index: 1;
  max-width: 440px;
`

const BrandEyebrow = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #ff6b76;
  margin-bottom: 16px;
`

const BrandHeadline = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: clamp(1.875rem, 2.6vw, 2.5rem);
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: #ffffff;
  margin-bottom: 16px;
`

const BrandLead = styled.p`
  font-size: 1rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.72);
  margin-bottom: 32px;
`

const Highlights = styled.ul`
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const HighlightItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.86);
`

const HighlightIcon = styled.span`
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
`

const BrandBottom = styled.div`
  position: relative;
  z-index: 1;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.45);
`

const FormPanel = styled.main`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 28px 32px;

  @media (max-width: 640px) {
    padding: 20px 16px 32px;
  }
`

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  max-width: 440px;
  margin: 0 auto 24px;
`

const BackHome = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.muted};
  transition: color 0.15s;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`

const MobileLogo = styled(Link)`
  display: none;

  @media (max-width: 960px) {
    display: inline-flex;
    align-items: center;
  }
`

const MobileLogoImg = styled.img`
  height: 30px;
  width: auto;
  display: block;
`

const FormWrap = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`

const Card = styled.div`
  width: 100%;
  max-width: 440px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 16px;
  box-shadow: ${({ theme }) => theme.shadows.md};
  padding: 36px 36px 32px;

  @media (max-width: 520px) {
    padding: 28px 22px 24px;
  }
`

const CardTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.5rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  letter-spacing: -0.015em;
  margin-bottom: 6px;
`

const Subtitle = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.9375rem;
  line-height: 1.5;
  margin-bottom: 24px;
`

const BodyText = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.6;
  margin-bottom: 16px;
`

const MutedText = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.55;
  margin-bottom: 24px;
`

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
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

const InputWrap = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`

const Input = styled.input<{ $error?: boolean; $hasTrailing?: boolean }>`
  width: 100%;
  height: 44px;
  padding: ${({ $hasTrailing }) => ($hasTrailing ? '0 44px 0 14px' : '0 14px')};
  border: 1.5px solid ${({ $error, theme }) => ($error ? theme.colors.action : theme.colors.border)};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:focus {
    border-color: ${({ theme }) => theme.colors.primaryText};
    box-shadow: 0 0 0 3px ${({ theme }) => `${theme.colors.primaryText}18`};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }
`

const TogglePasswordBtn = styled.button`
  position: absolute;
  right: 8px;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const ErrorMsg = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.action};
`

const ErrorAlert = styled.div`
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => `${theme.colors.action}12`};
  border: 1px solid ${({ theme }) => `${theme.colors.action}38`};
  color: ${({ theme }) => theme.colors.action};
  font-size: 0.875rem;
  line-height: 1.45;
`

const Divider = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: ${({ theme }) => theme.colors.border};
  }

  span {
    font-size: 0.8125rem;
    color: ${({ theme }) => theme.colors.muted};
  }
`

const CardFoot = styled.p`
  text-align: center;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 22px;

  a {
    color: ${({ theme }) => theme.colors.action};
    font-weight: ${({ theme }) => theme.fontWeights.semibold};

    &:hover {
      text-decoration: underline;
    }
  }
`

const BackStepBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`

const QrWrap = styled.div`
  display: flex;
  justify-content: center;
  margin-bottom: 18px;

  img {
    width: 200px;
    height: 200px;
    border-radius: ${({ theme }) => theme.radii.md};
    background: #ffffff;
    padding: 8px;
    border: 1px solid ${({ theme }) => theme.colors.border};
  }
`

const SecretCode = styled.code`
  display: block;
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.mono};
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  text-align: center;
  letter-spacing: 0.14em;
  margin-bottom: 24px;
  word-break: break-all;
`

const BackupGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 24px;

  code {
    background: ${({ theme }) => theme.colors.neutral};
    border: 1px solid ${({ theme }) => theme.colors.border};
    color: ${({ theme }) => theme.colors.text};
    font-family: ${({ theme }) => theme.fonts.mono};
    padding: 8px 10px;
    border-radius: ${({ theme }) => theme.radii.sm};
    font-size: 0.8125rem;
    text-align: center;
  }
`

const MfaBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => `${theme.colors.action}14`};
  color: ${({ theme }) => theme.colors.action};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  margin-bottom: 12px;
`

// ── Shell ──────────────────────────────────────────────────────────────────

function AuthShell({ children }: { children: ReactNode }) {
  const { resolvedMode } = useAppTheme()
  const mobileLogoSrc = resolvedMode === 'dark' ? logoDarkSrc : logoLightSrc

  return (
    <Page>
      <BrandPanel>
        <BrandTop>
          <BrandLogoLink to="/" aria-label="Votz — página inicial">
            <BrandLogoImg src={logoDarkSrc} alt="Votz" />
          </BrandLogoLink>
        </BrandTop>

        <BrandCenter>
          <BrandEyebrow>Accountability cívico</BrandEyebrow>
          <BrandHeadline>
            Reclamação vira registro. Registro vira pressão. Pressão vira ação.
          </BrandHeadline>
          <BrandLead>
            Entre para apoiar relatos da sua cidade, participar de debates públicos e acompanhar o que entidades e políticos realmente entregam.
          </BrandLead>

          <Highlights>
            <HighlightItem>
              <HighlightIcon><Megaphone size={18} weight="bold" /></HighlightIcon>
              <span>Registre problemas reais com foto, vídeo e localização — de graça e com opção de anonimato.</span>
            </HighlightItem>
            <HighlightItem>
              <HighlightIcon><ChartLineUp size={18} weight="bold" /></HighlightIcon>
              <span>Acompanhe prazos, respostas oficiais e o desempenho público de órgãos e mandatos.</span>
            </HighlightItem>
            <HighlightItem>
              <HighlightIcon><ShieldCheck size={18} weight="bold" /></HighlightIcon>
              <span>Histórico público imutável, sem partido e com proteção aos seus dados.</span>
            </HighlightItem>
          </Highlights>
        </BrandCenter>

        <BrandBottom>Dados abertos. Sem partido. Pelo Brasil.</BrandBottom>
      </BrandPanel>

      <FormPanel>
        <TopBar>
          <BackHome to="/">
            <ArrowLeft size={16} weight="bold" />
            Voltar ao início
          </BackHome>
          <MobileLogo to="/" aria-label="Votz — página inicial">
            <MobileLogoImg src={mobileLogoSrc} alt="Votz" />
          </MobileLogo>
        </TopBar>

        <FormWrap>{children}</FormWrap>
      </FormPanel>
    </Page>
  )
}

// ── Types & Component ──────────────────────────────────────────────────────

interface CredentialsForm {
  email: string
  password: string
}

interface MfaForm {
  code: string
}

export function Login() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/'
  const user = useAuthStore((s) => s.user)
  const setAuth = useAuthStore((s) => s.setAuth)
  const { mutate: login, isPending: loginPending, error: loginError } = useLogin()
  const { mutate: verifyMfa, isPending: mfaPending, error: mfaError } = useMfaVerify()
  const { mutate: switchContext, isPending: switchPending, isError: switchError } = useSwitchContext({
    returnTo: redirect,
  })

  const [showPassword, setShowPassword] = useState(false)
  const [mfaToken, setMfaToken] = useState<string | null>(null)
  const [mfaSetupToken, setMfaSetupToken] = useState<string | null>(null)
  const [mfaSetupStep, setMfaSetupStep] = useState<'intro' | 'qr' | 'code' | 'backup'>('intro')
  const [qrData, setQrData] = useState<{ qrCode: string; secret: string } | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [pendingAuth, setPendingAuth] = useState<{ user: AuthUser; accessToken: string } | null>(null)

  const { mutate: startSetup, isPending: setupPending } = useMfaSetupForced(mfaSetupToken ?? '')
  const { mutate: enableForced, isPending: enablePending, error: enableError } = useMfaEnableForced(mfaSetupToken ?? '')

  const { data: profiles } = useMyProfiles(!!pendingAuth)

  // Volta do Google numa conta que exige MFA: busca o desafio (código ou configuração) e
  // segue pelos mesmos passos do login com senha.
  const { mutate: fetchGooglePendingMfa } = useGooglePendingMfa()
  const [googleMfaExpired, setGoogleMfaExpired] = useState(false)
  const googleMfaStarted = useRef(false)
  useEffect(() => {
    if (searchParams.get('google_mfa') !== '1' || googleMfaStarted.current) return
    googleMfaStarted.current = true
    setSearchParams((prev) => { prev.delete('google_mfa'); return prev }, { replace: true })
    fetchGooglePendingMfa(undefined, {
      onSuccess: (data) => {
        if ('mfaToken' in data) {
          setMfaToken(data.mfaToken)
        } else {
          setMfaSetupToken(data.mfaSetupToken)
          setMfaSetupStep('intro')
        }
      },
      onError: () => setGoogleMfaExpired(true),
    })
  }, [searchParams, setSearchParams, fetchGooglePendingMfa])

  const { register: regCreds, handleSubmit: handleCreds, formState: { errors: credErrors } } = useForm<CredentialsForm>({
    defaultValues: { email: '', password: '' },
  })
  const {
    register: regMfa,
    handleSubmit: handleMfa,
    reset: resetMfa,
    setValue: setMfaValue,
    formState: { errors: mfaErrors },
  } = useForm<MfaForm>({
    defaultValues: { code: '' },
  })

  useEffect(() => {
    if (user && !pendingAuth) navigate(redirect, { replace: true })
  }, [user, pendingAuth, navigate, redirect])

  // Quando temos os perfis carregados e há apenas o pessoal, entra direto
  useEffect(() => {
    if (pendingAuth && profiles && profiles.orgs.length === 0) {
      setAuth(pendingAuth.user, pendingAuth.accessToken)
      setPendingAuth(null)
    }
  }, [pendingAuth, profiles, setAuth])

  function enterWithAuth(authResult: { user: AuthUser; accessToken: string }) {
    // Primeiro seta o token para poder chamar /auth/my-profiles autenticado
    setAuth(authResult.user, authResult.accessToken)
    // Guarda pendingAuth para exibir o modal após carregar os perfis
    setPendingAuth(authResult)
  }

  function onCredentials(data: CredentialsForm) {
    login(data, {
      onSuccess: (result) => {
        if (result.requiresMfa) {
          resetMfa({ code: '' })
          setMfaToken(result.mfaToken)
        } else if (result.requiresMfaSetup) {
          resetMfa({ code: '' })
          setMfaSetupToken(result.mfaSetupToken)
          setMfaSetupStep('intro')
        } else {
          enterWithAuth(result)
        }
      },
    })
  }

  const [mfaSetupRequired, setMfaSetupRequired] = useState(false)

  function onProfileSelect(contextType: string, contextId?: string, mfaCode?: string) {
    if (!pendingAuth) return
    setMfaSetupRequired(false)
    switchContext({ contextType, contextId, mfaCode }, {
      onSuccess: (data) => {
        if ('requiresMfaSetup' in data) { setMfaSetupRequired(true); return }
        if ('requiresMfa' in data) return
        setPendingAuth(null)
        navigate(redirect, { replace: true })
      },
    })
  }

  function onStartMfaSetup() {
    startSetup(undefined, {
      onSuccess: (data) => {
        setQrData({ qrCode: data.qrCode, secret: data.secret })
        setMfaSetupStep('qr')
      },
    })
  }

  function onConfirmMfaSetup(data: MfaForm) {
    enableForced(data.code, {
      onSuccess: (result) => {
        setBackupCodes(result.backupCodes)
        enterWithAuth({ user: result.user, accessToken: result.accessToken })
        setMfaSetupStep('backup')
      },
    })
  }

  function onMfa(data: MfaForm) {
    if (!mfaToken) return
    verifyMfa({ mfaToken, code: data.code }, {
      onSuccess: (result) => enterWithAuth(result),
    })
  }

  if (mfaSetupToken) {
    if (mfaSetupStep === 'intro') {
      return (
        <AuthShell>
          <Card>
            <MfaBadge><LockKey size={14} weight="bold" /> Segurança obrigatória</MfaBadge>
            <CardTitle>Configure a verificação em 2 fatores</CardTitle>
            <BodyText>
              Sua conta exige autenticação em dois fatores (MFA). Configure agora para continuar com segurança.
            </BodyText>
            <MutedText>
              Você vai precisar de um app autenticador como <strong>Google Authenticator</strong> ou <strong>Authy</strong>.
            </MutedText>
            <Button variant="primary" fullWidth disabled={setupPending} onClick={onStartMfaSetup}>
              {setupPending ? 'Gerando QR code...' : 'Configurar agora'}
            </Button>
          </Card>
        </AuthShell>
      )
    }

    if (mfaSetupStep === 'qr' && qrData) {
      return (
        <AuthShell>
          <Card>
            <MfaBadge><LockKey size={14} weight="bold" /> Passo 1 de 2</MfaBadge>
            <CardTitle>Escaneie o QR code</CardTitle>
            <Subtitle>Abra seu app autenticador e aponte a câmera para o código abaixo.</Subtitle>
            <QrWrap>
              <img src={qrData.qrCode} alt="QR Code MFA" />
            </QrWrap>
            <MutedText style={{ textAlign: 'center', marginBottom: 8 }}>
              Ou insira o código manualmente:
            </MutedText>
            <SecretCode>{qrData.secret}</SecretCode>
            <Button
              variant="primary"
              fullWidth
              onClick={() => {
                resetMfa({ code: '' })
                setMfaSetupStep('code')
              }}
            >
              Já escaneei — inserir código
            </Button>
          </Card>
        </AuthShell>
      )
    }

    if (mfaSetupStep === 'code') {
      const regCode = regMfa('code', { required: 'Obrigatório' })
      return (
        <AuthShell>
          <Card>
            <MfaBadge><LockKey size={14} weight="bold" /> Passo 2 de 2</MfaBadge>
            <CardTitle>Confirme o código</CardTitle>
            <Subtitle>Digite os 6 dígitos exibidos no seu aplicativo autenticador.</Subtitle>
            <Form key="mfa-setup-form" onSubmit={handleMfa(onConfirmMfaSetup)}>
              <Field>
                <Label htmlFor="mfa-setup-code">Código do autenticador (6 dígitos)</Label>
                <Input
                  key="mfa-setup-code"
                  id="mfa-setup-code"
                  type="text"
                  placeholder="000000"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  $error={!!mfaErrors.code}
                  {...regCode}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
                    e.target.value = digits
                    setMfaValue('code', digits, { shouldValidate: false })
                  }}
                />
                {mfaErrors.code && <ErrorMsg>{mfaErrors.code.message}</ErrorMsg>}
              </Field>
              {enableError && <ErrorAlert>Código inválido. Tente novamente.</ErrorAlert>}
              <Button variant="primary" fullWidth disabled={enablePending}>
                {enablePending ? 'Verificando...' : 'Confirmar e entrar'}
              </Button>
            </Form>
            <CardFoot>
              <BackStepBtn type="button" onClick={() => setMfaSetupStep('qr')}>
                <ArrowLeft size={14} /> Voltar
              </BackStepBtn>
            </CardFoot>
          </Card>
        </AuthShell>
      )
    }

    if (mfaSetupStep === 'backup') {
      return (
        <AuthShell>
          <Card>
            <MfaBadge><ShieldCheck size={14} weight="bold" /> Quase pronto</MfaBadge>
            <CardTitle>Guarde seus códigos de backup</CardTitle>
            <MutedText>
              Se perder acesso ao autenticador, use um destes códigos. Cada um funciona uma única vez.
            </MutedText>
            <BackupGrid>
              {backupCodes.map((code) => (
                <code key={code}>{code}</code>
              ))}
            </BackupGrid>
            <Button
              variant="primary"
              fullWidth
              disabled={!!pendingAuth && !profiles}
              onClick={() => {
                if (!pendingAuth || !profiles || profiles.orgs.length === 0) {
                  setPendingAuth(null)
                  navigate(redirect, { replace: true })
                }
                // se orgs.length > 0: o modal já está renderizado sobre este card
              }}
            >
              {pendingAuth && !profiles ? 'Carregando...' : 'Entendi, já guardei'}
            </Button>
          </Card>
          {pendingAuth && profiles && profiles.orgs.length > 0 && (
            <ProfileSelectModal
              profiles={profiles}
              loading={switchPending}
              error={switchError}
              mfaSetupRequired={mfaSetupRequired}
              onSelect={onProfileSelect}
            />
          )}
        </AuthShell>
      )
    }
  }

  if (mfaToken) {
    const regCode = regMfa('code', { required: 'Obrigatório' })
    return (
      <AuthShell>
        <Card>
          <MfaBadge><LockKey size={14} weight="bold" /> Verificação em 2 fatores</MfaBadge>
          <CardTitle>Confirme sua identidade</CardTitle>
          <Subtitle>Digite o código de 6 dígitos do seu aplicativo autenticador.</Subtitle>

          <Form key="mfa-verify-form" onSubmit={handleMfa(onMfa)}>
            <Field>
              <Label htmlFor="mfa-verify-code">Código do autenticador</Label>
              <Input
                key="mfa-verify-code"
                id="mfa-verify-code"
                type="text"
                placeholder="000000"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                $error={!!mfaErrors.code}
                {...regCode}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
                  e.target.value = digits
                  setMfaValue('code', digits, { shouldValidate: false })
                }}
              />
              {mfaErrors.code && <ErrorMsg>{mfaErrors.code.message}</ErrorMsg>}
            </Field>

            {mfaError && <ErrorAlert>Código inválido. Tente novamente.</ErrorAlert>}

            <Button variant="primary" fullWidth disabled={mfaPending}>
              {mfaPending ? 'Verificando...' : 'Confirmar'}
            </Button>
          </Form>

          <CardFoot>
            <BackStepBtn
              type="button"
              onClick={() => {
                resetMfa({ code: '' })
                setMfaToken(null)
              }}
            >
              <ArrowLeft size={14} /> Voltar
            </BackStepBtn>
          </CardFoot>
        </Card>
        {pendingAuth && profiles && profiles.orgs.length > 0 && (
          <ProfileSelectModal
            profiles={profiles}
            loading={switchPending}
            error={switchError}
            mfaSetupRequired={mfaSetupRequired}
            onSelect={onProfileSelect}
          />
        )}
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <Card>
        <CardTitle>Entrar na sua conta</CardTitle>
        <Subtitle>Entre para apoiar relatos, participar e cobrar soluções.</Subtitle>

        <GoogleButton />

        <Divider>
          <span>ou continue com e-mail</span>
        </Divider>

        <Form key="credentials-form" onSubmit={handleCreds(onCredentials)}>
          <Field>
            <Label htmlFor="login-email">E-mail</Label>
            <Input
              key="cred-email"
              id="login-email"
              type="email"
              placeholder="seu@email.com"
              autoComplete="email"
              $error={!!credErrors.email}
              {...regCreds('email', { required: 'Obrigatório' })}
            />
            {credErrors.email && <ErrorMsg>{credErrors.email.message}</ErrorMsg>}
          </Field>

          <Field>
            <Label htmlFor="login-password">Senha</Label>
            <InputWrap>
              <Input
                key="cred-password"
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="current-password"
                $error={!!credErrors.password}
                $hasTrailing
                {...regCreds('password', { required: 'Obrigatório' })}
              />
              <TogglePasswordBtn
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
              </TogglePasswordBtn>
            </InputWrap>
            {credErrors.password && <ErrorMsg>{credErrors.password.message}</ErrorMsg>}
          </Field>

          {loginError && <ErrorAlert>E-mail ou senha incorretos.</ErrorAlert>}
          {googleMfaExpired && <ErrorAlert>O login com Google expirou. Entre de novo.</ErrorAlert>}

          <Button variant="primary" fullWidth disabled={loginPending}>
            {loginPending ? 'Entrando...' : 'Entrar'}
          </Button>
        </Form>

        <CardFoot>
          Não tem conta?{' '}
          <Link to="/cadastro">Cadastre-se grátis</Link>
        </CardFoot>
      </Card>

      {pendingAuth && profiles && profiles.orgs.length > 0 && (
        <ProfileSelectModal
          profiles={profiles}
          loading={switchPending}
          error={switchError}
          mfaSetupRequired={mfaSetupRequired}
          onSelect={onProfileSelect}
        />
      )}
    </AuthShell>
  )
}
