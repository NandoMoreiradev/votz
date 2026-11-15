import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import styled from 'styled-components'
import { Navbar } from '../components/layout/Navbar'
import { api } from '../lib/api'

interface PublicAccountabilityResponse {
  code: string
  orgType: 'POLITICIAN' | 'ENTITY'
  orgId: string
  periodStart: string
  periodEnd: string
  dictionaryVersion: string
  computedAt: string
  status: string
  snapshot: {
    orgName: string
    roleOrTypeLabel: string
    territoryLabel: string
    metrics: {
      received: number
      responded: number
      advocated: number
      resolved: number
      medianResponseHours: number | null
      medianResolutionHours: number | null
      responseRatePercent: number | null
      resolutionRatePercent: number | null
      suppressed: boolean
    }
    topCategories: Array<{
      category: string
      receivedCount: number
      resolvedCount: number
    }>
    methodology: {
      dictionaryVersion: string
      timezone: string
      note: string
    }
  }
}

const Page = styled.main`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
  padding-bottom: ${({ theme }) => theme.spacing[8]};
`

const Container = styled.div`
  max-width: 880px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing[6]} ${({ theme }) => theme.spacing[4]};
`

const Card = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing[6]};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`

const CodeBadge = styled.span`
  display: inline-block;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  padding: ${({ theme }) => theme.spacing[1]} ${({ theme }) => theme.spacing[3]};
  border-radius: ${({ theme }) => theme.radii.sm};
  margin-bottom: ${({ theme }) => theme.spacing[3]};
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  color: ${({ theme }) => theme.colors.primary};
  margin-bottom: ${({ theme }) => theme.spacing[1]};
`

const Subtitle = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: ${({ theme }) => theme.spacing[3]};
  margin-top: ${({ theme }) => theme.spacing[4]};
`

const Stat = styled.div`
  background: ${({ theme }) => theme.colors.surfaceHover};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing[4]};
`

const StatLabel = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
`

const StatValue = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
  margin-top: ${({ theme }) => theme.spacing[1]};
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: ${({ theme }) => theme.spacing[3]};
  font-size: ${({ theme }) => theme.fontSizes.sm};

  th,
  td {
    text-align: left;
    padding: ${({ theme }) => theme.spacing[2]} ${({ theme }) => theme.spacing[3]};
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  }

  th {
    color: ${({ theme }) => theme.colors.muted};
    font-weight: 600;
  }
`

export function PrestacaoPublica() {
  const { code = '' } = useParams<{ code: string }>()

  const { data, isLoading, isError } = useQuery<PublicAccountabilityResponse>({
    queryKey: ['accountability', 'public', code],
    queryFn: async () => {
      const { data: res } = await api.get<PublicAccountabilityResponse>(
        `/accountability/public/${encodeURIComponent(code)}`,
      )
      return res
    },
    enabled: Boolean(code),
    retry: false,
  })

  return (
    <Page>
      <Navbar />
      <Container>
        {isLoading && <Card>Carregando registro imutável de prestação de contas...</Card>}
        {isError && (
          <Card>
            <Title>Código de verificação não encontrado</Title>
            <Subtitle>
              Verifique se o código informado corresponde a uma prestação de contas emitida pelo
              Votz.
            </Subtitle>
          </Card>
        )}
        {data && (
          <>
            <Card>
              <CodeBadge>VERIFICAÇÃO PÚBLICA · {data.code}</CodeBadge>
              <Title>{data.snapshot.orgName}</Title>
              <Subtitle>
                {data.snapshot.roleOrTypeLabel} · {data.snapshot.territoryLabel} · Período{' '}
                {data.periodStart} a {data.periodEnd}
              </Subtitle>

              {data.snapshot.metrics.suppressed ? (
                <Subtitle style={{ marginTop: 16 }}>
                  Métricas suprimidas automaticamente por regra de privacidade (menos de 5 relatos
                  no recorte).
                </Subtitle>
              ) : (
                <Grid>
                  <Stat>
                    <StatLabel>Relatos recebidos</StatLabel>
                    <StatValue>{data.snapshot.metrics.received}</StatValue>
                  </Stat>
                  <Stat>
                    <StatLabel>Respondidos</StatLabel>
                    <StatValue>{data.snapshot.metrics.responded}</StatValue>
                  </Stat>
                  <Stat>
                    <StatLabel>Avocados</StatLabel>
                    <StatValue>{data.snapshot.metrics.advocated}</StatValue>
                  </Stat>
                  <Stat>
                    <StatLabel>Resolvidos</StatLabel>
                    <StatValue>{data.snapshot.metrics.resolved}</StatValue>
                  </Stat>
                </Grid>
              )}
            </Card>

            {data.snapshot.topCategories?.length > 0 && (
              <Card>
                <Title>Temas no período</Title>
                <Table>
                  <thead>
                    <tr>
                      <th>Categoria</th>
                      <th>Recebidos</th>
                      <th>Resolvidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.snapshot.topCategories.map((c) => (
                      <tr key={c.category}>
                        <td>{c.category}</td>
                        <td>{c.receivedCount}</td>
                        <td>{c.resolvedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
            )}

            <Card>
              <Subtitle>
                Dicionário metodológico {data.dictionaryVersion} · Calculado em{' '}
                {new Date(data.computedAt).toLocaleString('pt-BR')} ·{' '}
                {data.snapshot.methodology.note}
              </Subtitle>
            </Card>
          </>
        )}
      </Container>
    </Page>
  )
}
