import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Button } from '../components/ui/Button'
import { GoogleButton } from '../components/ui/GoogleButton'
import { ProfileSelectModal } from '../components/ui/ProfileSelectModal'
import { useLogin, useMfaVerify, useMfaSetupForced, useMfaEnableForced, useMyProfiles, useSwitchContext } from '../hooks/useAuth'
import { useAuthStore } from '../store/auth.store'
import { AuthUser } from '../types/api'

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
  max-width: 400px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 40px;
`

const Logo = styled(Link)`
  display: block;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.5rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.primary};
  text-align: center;
  margin-bottom: 8px;

  span { color: ${({ theme }) => theme.colors.action}; }
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
  border: 1.5px solid ${({ $error, theme }) => $error ? theme.colors.action : theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  outline: none;
  transition: border-color 0.15s;

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
`

const ErrorMsg = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.action};
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

interface CredentialsForm {
  email: string
  password: string
}

interface MfaForm {
  code: string
}

export function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/'
  const user = useAuthStore((s) => s.user)
  const setAuth = useAuthStore((s) => s.setAuth)
  const { mutate: login, isPending: loginPending, error: loginError } = useLogin()
  const { mutate: verifyMfa, isPending: mfaPending, error: mfaError } = useMfaVerify()
  const { mutate: switchContext, isPending: switchPending, isError: switchError } = useSwitchContext()

  const [mfaToken, setMfaToken] = useState<string | null>(null)
  const [mfaSetupToken, setMfaSetupToken] = useState<string | null>(null)
  const [mfaSetupStep, setMfaSetupStep] = useState<'intro' | 'qr' | 'code' | 'backup'>('intro')
  const [qrData, setQrData] = useState<{ qrCode: string; secret: string } | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [pendingAuth, setPendingAuth] = useState<{ user: AuthUser; accessToken: string } | null>(null)

  const { mutate: startSetup, isPending: setupPending } = useMfaSetupForced(mfaSetupToken ?? '')
  const { mutate: enableForced, isPending: enablePending, error: enableError } = useMfaEnableForced(mfaSetupToken ?? '')

  const { data: profiles } = useMyProfiles(!!pendingAuth)

  const { register: regCreds, handleSubmit: handleCreds, formState: { errors: credErrors } } = useForm<CredentialsForm>()
  const { register: regMfa, handleSubmit: handleMfa, formState: { errors: mfaErrors } } = useForm<MfaForm>()

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
          setMfaToken(result.mfaToken)
        } else if (result.requiresMfaSetup) {
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
        <Page>
          <Card>
            <Logo to="/"><span>◆</span> VOTZ</Logo>
            <Subtitle>Segurança obrigatória</Subtitle>
            <p style={{ fontSize: '0.9375rem', color: '#374151', marginBottom: 24, lineHeight: 1.6 }}>
              Sua conta exige autenticação em dois fatores (MFA). Configure agora para continuar.
            </p>
            <p style={{ fontSize: '0.875rem', color: '#6B7280', marginBottom: 24 }}>
              Você vai precisar de um app autenticador como <strong>Google Authenticator</strong> ou <strong>Authy</strong>.
            </p>
            <Button variant="primary" fullWidth disabled={setupPending} onClick={onStartMfaSetup}>
              {setupPending ? 'Gerando QR code...' : 'Configurar agora'}
            </Button>
          </Card>
        </Page>
      )
    }

    if (mfaSetupStep === 'qr' && qrData) {
      return (
        <Page>
          <Card>
            <Logo to="/"><span>◆</span> VOTZ</Logo>
            <Subtitle>Escaneie o QR code</Subtitle>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <img src={qrData.qrCode} alt="QR Code MFA" style={{ width: 200, height: 200 }} />
            </div>
            <p style={{ fontSize: '0.8125rem', color: '#6B7280', textAlign: 'center', marginBottom: 8 }}>
              Ou insira o código manualmente:
            </p>
            <code style={{ display: 'block', background: '#F3F4F6', padding: '8px 12px', borderRadius: 6, fontSize: '0.875rem', textAlign: 'center', letterSpacing: 2, marginBottom: 24 }}>
              {qrData.secret}
            </code>
            <Button variant="primary" fullWidth onClick={() => setMfaSetupStep('code')}>
              Já escaneei — inserir código
            </Button>
          </Card>
        </Page>
      )
    }

    if (mfaSetupStep === 'code') {
      return (
        <Page>
          <Card>
            <Logo to="/"><span>◆</span> VOTZ</Logo>
            <Subtitle>Confirme o código</Subtitle>
            <Form onSubmit={handleMfa(onConfirmMfaSetup)}>
              <Field>
                <Label>Código do autenticador (6 dígitos)</Label>
                <Input
                  type="text"
                  placeholder="000000"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  $error={!!mfaErrors.code}
                  {...regMfa('code', { required: 'Obrigatório' })}
                />
                {mfaErrors.code && <ErrorMsg>{mfaErrors.code.message}</ErrorMsg>}
              </Field>
              {enableError && <ErrorMsg>Código inválido. Tente novamente.</ErrorMsg>}
              <Button variant="primary" fullWidth disabled={enablePending}>
                {enablePending ? 'Verificando...' : 'Confirmar e entrar'}
              </Button>
            </Form>
            <Footer>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }} onClick={() => setMfaSetupStep('qr')}>
                ← Voltar
              </button>
            </Footer>
          </Card>
        </Page>
      )
    }

    if (mfaSetupStep === 'backup') {
      return (
        <Page>
          <Card>
            <Logo to="/"><span>◆</span> VOTZ</Logo>
            <Subtitle>Guarde seus códigos de backup</Subtitle>
            <p style={{ fontSize: '0.875rem', color: '#374151', marginBottom: 16, lineHeight: 1.5 }}>
              Se perder acesso ao autenticador, use um destes códigos. Cada um funciona uma única vez.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24 }}>
              {backupCodes.map((code) => (
                <code key={code} style={{ background: '#F3F4F6', padding: '6px 10px', borderRadius: 4, fontSize: '0.8125rem', textAlign: 'center' }}>
                  {code}
                </code>
              ))}
            </div>
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
        </Page>
      )
    }
  }

  if (mfaToken) {
    return (
      <Page>
        <Card>
          <Logo to="/"><span>◆</span> VOTZ</Logo>
          <Subtitle>Autenticação em dois fatores</Subtitle>

          <Form onSubmit={handleMfa(onMfa)}>
            <Field>
              <Label>Código do autenticador</Label>
              <Input
                type="text"
                placeholder="000000"
                autoComplete="one-time-code"
                inputMode="numeric"
                $error={!!mfaErrors.code}
                {...regMfa('code', { required: 'Obrigatório' })}
              />
              {mfaErrors.code && <ErrorMsg>{mfaErrors.code.message}</ErrorMsg>}
            </Field>

            {mfaError && <ErrorMsg>Código inválido. Tente novamente.</ErrorMsg>}

            <Button variant="primary" fullWidth disabled={mfaPending}>
              {mfaPending ? 'Verificando...' : 'Confirmar'}
            </Button>
          </Form>

          <Footer>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }} onClick={() => setMfaToken(null)}>
              ← Voltar
            </button>
          </Footer>
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
      </Page>
    )
  }

  return (
    <Page>
      <Card>
        <Logo to="/"><span>◆</span> VOTZ</Logo>
        <Subtitle>Entre para apoiar e cobrar.</Subtitle>

        <Form onSubmit={handleCreds(onCredentials)}>
          <Field>
            <Label>E-mail</Label>
            <Input
              type="email"
              placeholder="seu@email.com"
              $error={!!credErrors.email}
              {...regCreds('email', { required: 'Obrigatório' })}
            />
            {credErrors.email && <ErrorMsg>{credErrors.email.message}</ErrorMsg>}
          </Field>

          <Field>
            <Label>Senha</Label>
            <Input
              type="password"
              placeholder="••••••••"
              $error={!!credErrors.password}
              {...regCreds('password', { required: 'Obrigatório' })}
            />
            {credErrors.password && <ErrorMsg>{credErrors.password.message}</ErrorMsg>}
          </Field>

          {loginError && <ErrorMsg>E-mail ou senha incorretos.</ErrorMsg>}

          <Button variant="primary" fullWidth disabled={loginPending}>
            {loginPending ? 'Entrando...' : 'Entrar'}
          </Button>
        </Form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
          <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #E5E5E5' }} />
          <span style={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>ou</span>
          <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #E5E5E5' }} />
        </div>

        <GoogleButton />

        <Footer>
          Não tem conta?{' '}
          <Link to="/cadastro">Cadastre-se grátis</Link>
        </Footer>
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
    </Page>
  )
}
