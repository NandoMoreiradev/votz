import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import styled from 'styled-components'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'

// ── Styled ──────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
`

const Card = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 40px 36px;
  width: 100%;
  max-width: 440px;
  box-shadow: ${({ theme }) => theme.shadows.lg};
  text-align: center;
`

const Logo = styled(Link)`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.5rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.primary};
  display: inline-block;
  margin-bottom: 32px;
`

const OrgAvatar = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: 1.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 10px;
`

const Subtitle = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 28px;
  line-height: 1.5;
`

const RolePill = styled.span`
  display: inline-block;
  padding: 4px 14px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  margin-bottom: 28px;
`

const AcceptBtn = styled.button`
  width: 100%;
  padding: 13px;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  cursor: pointer;
  transition: opacity 0.15s;
  margin-bottom: 12px;
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const LoginLink = styled(Link)`
  display: block;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 8px;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`

const StateMsg = styled.p<{ $type?: 'error' | 'success' }>`
  font-size: 0.9375rem;
  color: ${({ theme, $type }) =>
    $type === 'error' ? theme.colors.action :
    $type === 'success' ? theme.colors.positive :
    theme.colors.muted};
  margin-top: 12px;
`

const Spinner = styled.div`
  width: 36px;
  height: 36px;
  border: 3px solid ${({ theme }) => theme.colors.border};
  border-top-color: ${({ theme }) => theme.colors.primary};
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  margin: 24px auto;
  @keyframes spin { to { transform: rotate(360deg); } }
`

// ── Tipos ────────────────────────────────────────────────────────────────────

interface InvitePreview {
  orgType: string
  orgId: string
  orgName: string
  roleName: string
  email: string
  expiresAt: string
  alreadyAccepted: boolean
  expired: boolean
}

// ── Componente ───────────────────────────────────────────────────────────────

export function AcceptInvite() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const sessionReady = useAuthStore((s) => s.sessionReady)
  const [accepted, setAccepted] = useState(false)
  const [acceptError, setAcceptError] = useState('')

  const { data: preview, isLoading, isError } = useQuery<InvitePreview>({
    queryKey: ['invite-preview', token],
    queryFn: () => api.get(`/org-memberships/invites/${token}`).then((r) => r.data),
    enabled: !!token,
    retry: false,
  })

  const acceptMutation = useMutation({
    mutationFn: () => api.post(`/org-memberships/invites/${token}/accept`).then((r) => r.data),
    onSuccess: () => {
      setAccepted(true)
      setTimeout(() => navigate('/'), 2500)
    },
    onError: (e: any) => {
      setAcceptError(e?.response?.data?.message ?? 'Erro ao aceitar convite.')
    },
  })

  // Redirect to login preserving this URL so user comes back after auth
  function handleLoginRedirect() {
    navigate(`/entrar?redirect=/convite/${token}`)
  }

  // After login, if redirect param matches, come back here automatically
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const redirect = params.get('redirect')
    if (redirect && user && sessionReady) {
      navigate(redirect, { replace: true })
    }
  }, [user, sessionReady])

  if (!sessionReady || isLoading) {
    return (
      <Page>
        <Card>
          <Logo to="/">Votz</Logo>
          <Spinner />
        </Card>
      </Page>
    )
  }

  if (isError || !preview) {
    return (
      <Page>
        <Card>
          <Logo to="/">Votz</Logo>
          <Title>Convite inválido</Title>
          <Subtitle>Este link de convite não existe ou foi removido.</Subtitle>
          <LoginLink to="/">← Voltar para o início</LoginLink>
        </Card>
      </Page>
    )
  }

  if (preview.expired) {
    return (
      <Page>
        <Card>
          <Logo to="/">Votz</Logo>
          <Title>Convite expirado</Title>
          <Subtitle>
            Este convite expirou em {new Date(preview.expiresAt).toLocaleDateString('pt-BR')}.
            Peça para a organização enviar um novo convite.
          </Subtitle>
          <LoginLink to="/">← Voltar para o início</LoginLink>
        </Card>
      </Page>
    )
  }

  if (preview.alreadyAccepted || accepted) {
    return (
      <Page>
        <Card>
          <Logo to="/">Votz</Logo>
          <OrgAvatar>{preview.orgName.charAt(0)}</OrgAvatar>
          <Title>Você já faz parte da equipe!</Title>
          <Subtitle>
            {accepted
              ? `Bem-vindo à equipe de ${preview.orgName}. Redirecionando...`
              : `Este convite já foi utilizado. Você já é membro de ${preview.orgName}.`}
          </Subtitle>
          <LoginLink to="/">← Ir para o início</LoginLink>
        </Card>
      </Page>
    )
  }

  return (
    <Page>
      <Card>
        <Logo to="/">Votz</Logo>
        <OrgAvatar>{preview.orgName.charAt(0)}</OrgAvatar>
        <Title>Você foi convidado!</Title>
        <Subtitle>
          <strong>{preview.orgName}</strong> convidou você para fazer parte da equipe no Votz.
        </Subtitle>
        <RolePill>{preview.roleName}</RolePill>

        {!user ? (
          <>
            <AcceptBtn onClick={handleLoginRedirect}>
              Entrar para aceitar
            </AcceptBtn>
            <StateMsg>
              Você precisa estar logado para aceitar o convite.
            </StateMsg>
            <LoginLink to={`/cadastro?redirect=/convite/${token}`}>
              Não tem conta? Cadastre-se
            </LoginLink>
          </>
        ) : (
          <>
            <AcceptBtn
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending}
            >
              {acceptMutation.isPending ? 'Aceitando...' : 'Aceitar convite'}
            </AcceptBtn>
            {acceptError && <StateMsg $type="error">{acceptError}</StateMsg>}
            <StateMsg>
              Logado como <strong>{user.name}</strong>
            </StateMsg>
          </>
        )}
      </Card>
    </Page>
  )
}
