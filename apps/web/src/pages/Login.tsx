import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Button } from '../components/ui/Button'
import { useLogin, useMfaVerify } from '../hooks/useAuth'
import { useAuthStore } from '../store/auth.store'

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
  const user = useAuthStore((s) => s.user)
  const setAuth = useAuthStore((s) => s.setAuth)
  const { mutate: login, isPending: loginPending, error: loginError } = useLogin()
  const { mutate: verifyMfa, isPending: mfaPending, error: mfaError } = useMfaVerify()

  const [mfaToken, setMfaToken] = useState<string | null>(null)

  const { register: regCreds, handleSubmit: handleCreds, formState: { errors: credErrors } } = useForm<CredentialsForm>()
  const { register: regMfa, handleSubmit: handleMfa, formState: { errors: mfaErrors } } = useForm<MfaForm>()

  useEffect(() => {
    if (user) navigate('/')
  }, [user, navigate])

  function onCredentials(data: CredentialsForm) {
    login(data, {
      onSuccess: (result) => {
        if (result.requiresMfa) {
          setMfaToken(result.mfaToken)
        } else {
          setAuth(result.user, result.accessToken)
          navigate('/')
        }
      },
    })
  }

  function onMfa(data: MfaForm) {
    if (!mfaToken) return
    verifyMfa({ mfaToken, code: data.code }, { onSuccess: () => navigate('/') })
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

        <Footer>
          Não tem conta?{' '}
          <Link to="/cadastro">Cadastre-se grátis</Link>
        </Footer>
      </Card>
    </Page>
  )
}
