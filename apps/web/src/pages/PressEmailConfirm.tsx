import styled from 'styled-components'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { apiErrorMessage, useConfirmPressEmail } from '../hooks/usePressCredential'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
  display: flex; align-items: center; justify-content: center; padding: 24px;
`
const Card = styled.div`
  width: 100%; max-width: 440px; text-align: center;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 40px 32px;
`
const Title = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.xl};
  color: ${({ theme }) => theme.colors.primary};
  margin: 0 0 8px;
`
const Message = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.fontSizes.md};
  line-height: 1.6; margin: 0 0 20px;
`
const Cta = styled(Link)`
  color: ${({ theme }) => theme.colors.primary};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`

/** Destino do link do e-mail "Confirme o e-mail da redação". Exige estar logado na conta que fez o pedido. */
export function PressEmailConfirm() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const user = useAuthStore((s) => s.user)
  const sessionReady = useAuthStore((s) => s.sessionReady)
  const confirm = useConfirmPressEmail(token, sessionReady && !!user)

  const redirect = encodeURIComponent(`/imprensa/confirmar-email?token=${token ?? ''}`)

  let content: { title: string; message: string; cta?: { to: string; label: string } }
  if (!token) {
    content = { title: 'Link incompleto', message: 'Abra o link direto do e-mail que enviamos.' }
  } else if (!sessionReady) {
    content = { title: 'Confirmando…', message: 'Só um instante.' }
  } else if (!user) {
    content = {
      title: 'Entre na sua conta',
      message: 'Para confirmar o e-mail da redação, entre na mesma conta que fez o pedido de credencial.',
      cta: { to: `/login?redirect=${redirect}`, label: 'Entrar' },
    }
  } else if (confirm.isSuccess) {
    content = {
      title: 'E-mail confirmado',
      message: 'Pronto. Agora a nossa equipe pode analisar o seu pedido. Avisamos aqui e por e-mail.',
      cta: { to: '/imprensa', label: 'Ir para a página de imprensa' },
    }
  } else if (confirm.isError) {
    content = {
      title: 'Não deu certo',
      message: apiErrorMessage(confirm.error, 'Link inválido ou vencido.'),
      cta: { to: '/imprensa', label: 'Voltar e pedir um novo e-mail' },
    }
  } else {
    content = { title: 'Confirmando…', message: 'Só um instante.' }
  }

  return (
    <Page>
      <Card>
        <Title>{content.title}</Title>
        <Message>{content.message}</Message>
        {content.cta && <Cta to={content.cta.to}>{content.cta.label}</Cta>}
      </Card>
    </Page>
  )
}
