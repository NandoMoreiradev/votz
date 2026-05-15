import { useEffect } from 'react'
import styled from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Button } from '../components/ui/Button'
import { useLogin } from '../hooks/useAuth'
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

interface FormValues {
  email: string
  password: string
}

export function Login() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { mutate: login, isPending, error } = useLogin()

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>()

  useEffect(() => {
    if (user) navigate('/')
  }, [user, navigate])

  function onSubmit(data: FormValues) {
    login(data, { onSuccess: () => navigate('/') })
  }

  return (
    <Page>
      <Card>
        <Logo to="/"><span>◆</span> VOTZ</Logo>
        <Subtitle>Entre para apoiar e cobrar.</Subtitle>

        <Form onSubmit={handleSubmit(onSubmit)}>
          <Field>
            <Label>E-mail</Label>
            <Input
              type="email"
              placeholder="seu@email.com"
              $error={!!errors.email}
              {...register('email', { required: 'Obrigatório' })}
            />
            {errors.email && <ErrorMsg>{errors.email.message}</ErrorMsg>}
          </Field>

          <Field>
            <Label>Senha</Label>
            <Input
              type="password"
              placeholder="••••••••"
              $error={!!errors.password}
              {...register('password', { required: 'Obrigatório' })}
            />
            {errors.password && <ErrorMsg>{errors.password.message}</ErrorMsg>}
          </Field>

          {error && (
            <ErrorMsg>E-mail ou senha incorretos.</ErrorMsg>
          )}

          <Button variant="primary" fullWidth disabled={isPending}>
            {isPending ? 'Entrando...' : 'Entrar'}
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
