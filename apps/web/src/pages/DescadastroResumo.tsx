import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import styled from 'styled-components'
import { Navbar } from '../components/layout/Navbar'
import { api } from '../lib/api'

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

export function DescadastroResumo() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const { data, isLoading, isError } = useQuery<{ unsubscribed: boolean; message: string }>({
    queryKey: ['mandate', 'unsubscribe', token],
    queryFn: async () => {
      const { data: res } = await api.get<{ unsubscribed: boolean; message: string }>(
        '/mandate/digest/unsubscribe',
        { params: { token } },
      )
      return res
    },
    enabled: token.length >= 16,
    retry: false,
  })

  return (
    <Page>
      <Navbar />
      <Box>
        <Title>Preferência de resumo semanal</Title>
        {!token && (
          <Text>Link de descadastro inválido ou incompleto.</Text>
        )}
        {isLoading && <Text>Processando solicitação com 1 clique...</Text>}
        {isError && (
          <Text>Não foi possível confirmar o token informado.</Text>
        )}
        {data && <Text>{data.message}</Text>}
        <Link to="/mandato/resumo">Ir para preferências do resumo semanal →</Link>
      </Box>
    </Page>
  )
}
