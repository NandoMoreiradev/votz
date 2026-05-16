import { useEffect } from 'react'
import styled from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Button } from '../components/ui/Button'
import { GoogleButton } from '../components/ui/GoogleButton'
import { useRegister } from '../hooks/useAuth'
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
  max-width: 420px;
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
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
`

const Hint = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
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
  name: string
  email: string
  password: string
}

export function Register() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { mutate: register_, isPending, error } = useRegister()

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>()

  useEffect(() => {
    if (user) navigate('/')
  }, [user, navigate])

  function onSubmit(data: FormValues) {
    register_(data, { onSuccess: () => navigate('/') })
  }

  return (
    <Page>
      <Card>
        <Logo to="/"><span>◆</span> VOTZ</Logo>
        <Subtitle>Grátis para sempre. Sua voz importa.</Subtitle>

        <Form onSubmit={handleSubmit(onSubmit)}>
          <Field>
            <Label>Nome completo</Label>
            <Input
              type="text"
              placeholder="João Silva"
              $error={!!errors.name}
              {...register('name', { required: 'Obrigatório', minLength: { value: 2, message: 'Mínimo 2 caracteres' } })}
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
              : <Hint>Mínimo 8 caracteres, com uma maiúscula e um número.</Hint>
            }
          </Field>

          {error && <ErrorMsg>Este e-mail já está cadastrado.</ErrorMsg>}

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
