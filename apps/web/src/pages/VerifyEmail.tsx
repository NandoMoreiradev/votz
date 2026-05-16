import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'

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
  padding: 48px 40px;
  text-align: center;
`

const Logo = styled(Link)`
  display: block;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.5rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.primary};
  margin-bottom: 32px;

  span { color: ${({ theme }) => theme.colors.action}; }
`

const Icon = styled.div<{ $success?: boolean }>`
  font-size: 3rem;
  margin-bottom: 16px;
`

const Title = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.25rem;
  color: ${({ theme }) => theme.colors.primary};
  margin-bottom: 8px;
`

const Message = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.9375rem;
  line-height: 1.6;
  margin-bottom: 24px;
`

const HomeLink = styled(Link)`
  color: ${({ theme }) => theme.colors.primary};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: 0.9375rem;
`

type Status = 'loading' | 'success' | 'already' | 'error'

export function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) { setStatus('error'); return }

    api.post('/auth/verify-email', { token })
      .then(({ data }) => {
        setStatus(data.message === 'Email already verified' ? 'already' : 'success')
      })
      .catch(() => setStatus('error'))
  }, [searchParams])

  const content: Record<Status, { icon: string; title: string; message: string }> = {
    loading: { icon: '⏳', title: 'Verificando...', message: 'Aguarde um instante.' },
    success: { icon: '✅', title: 'E-mail confirmado!', message: 'Sua conta está ativa. Agora você pode criar relatos e apoiar causas.' },
    already: { icon: 'ℹ️', title: 'E-mail já confirmado', message: 'Sua conta já estava ativa. Pode entrar normalmente.' },
    error: { icon: '❌', title: 'Link inválido ou expirado', message: 'O link de verificação é inválido ou já expirou. Faça login e solicite um novo.' },
  }

  const { icon, title, message } = content[status]

  return (
    <Page>
      <Card>
        <Logo to="/"><span>◆</span> VOTZ</Logo>
        <Icon>{icon}</Icon>
        <Title>{title}</Title>
        <Message>{message}</Message>
        <HomeLink to="/entrar">Ir para o login</HomeLink>
      </Card>
    </Page>
  )
}
