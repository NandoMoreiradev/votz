import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import styled from 'styled-components'
import { Navbar } from '../components/layout/Navbar'
import { api } from '../lib/api'

interface PreviewResponse {
  valid: boolean
  alreadyUnsubscribed: boolean
  message: string
}

interface ConfirmResponse {
  unsubscribed: boolean
  message: string
}

const Page = styled.main`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Box = styled.section`
  max-width: 600px;
  margin: ${({ theme }) => theme.spacing[8]} auto;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing[6]};
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.xl};
  color: ${({ theme }) => theme.colors.primary};
  margin-bottom: ${({ theme }) => theme.spacing[2]};
`

const Text = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`

const ConfirmButton = styled.button`
  padding: ${({ theme }) => theme.spacing[2]} ${({ theme }) => theme.spacing[4]};
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: 600;
  margin-bottom: ${({ theme }) => theme.spacing[4]};

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

export function DescadastroResumo() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const previewQuery = useQuery<PreviewResponse>({
    queryKey: ['mandate', 'unsubscribe-preview', token],
    queryFn: async () => {
      const { data } = await api.get<PreviewResponse>('/mandate/digest/unsubscribe', {
        params: { token },
      })
      return data
    },
    enabled: token.length >= 16,
    retry: false,
  })

  const confirmMut = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ConfirmResponse>('/mandate/digest/unsubscribe', {
        token,
      })
      return data
    },
  })

  return (
    <Page>
      <Navbar />
      <Box>
        <Title>Preferência de resumo semanal</Title>
        {!token && <Text>Link de descadastro inválido ou incompleto.</Text>}
        {token.length > 0 && previewQuery.isLoading && (
          <Text>Verificando solicitação...</Text>
        )}
        {previewQuery.isError && (
          <Text>Não foi possível validar o token informado.</Text>
        )}

        {previewQuery.data && !confirmMut.data && (
          <>
            <Text>{previewQuery.data.message}</Text>
            {!previewQuery.data.alreadyUnsubscribed && (
              <ConfirmButton
                type="button"
                disabled={confirmMut.isPending}
                onClick={() => confirmMut.mutate()}
              >
                {confirmMut.isPending
                  ? 'Cancelando...'
                  : 'Confirmar cancelamento do resumo semanal'}
              </ConfirmButton>
            )}
          </>
        )}

        {confirmMut.isError && (
          <Text>Não foi possível confirmar o descadastro. Tente novamente.</Text>
        )}
        {confirmMut.data && <Text>{confirmMut.data.message}</Text>}

        <div>
          <Link to="/mandato/resumo">Ir para preferências do resumo semanal →</Link>
        </div>
      </Box>
    </Page>
  )
}
