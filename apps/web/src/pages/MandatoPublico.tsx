import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import styled from 'styled-components'
import { Navbar } from '../components/layout/Navbar'
import { api } from '../lib/api'
import { SkeletonRows } from '../components/ui/Skeleton'

interface PublicMandateMeta {
  politician: {
    id: string
    name: string
    office: string
    state: string
    city: string | null
    party: string | null
  }
  roleLabel: string
  territoryLabel: string
  periodStart: string
  periodEnd: string
  metrics: {
    received: number | null
    resolved: number | null
    medianResponseHours: number | null
    suppressed: boolean
  }
  metricsHash: string
  images: {
    feed: string
    stories: string
  }
  verificationNote: string
}

const Page = styled.main`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
  padding-bottom: ${({ theme }) => theme.spacing[8]};
`

const Container = styled.div`
  max-width: 960px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing[6]} ${({ theme }) => theme.spacing[4]};
`

const Card = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing[6]};
  margin-bottom: ${({ theme }) => theme.spacing[5]};
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  color: ${({ theme }) => theme.colors.primary};
`

const Sub = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-top: ${({ theme }) => theme.spacing[1]};
`

const MetricsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing[3]};
  margin-top: ${({ theme }) => theme.spacing[4]};
`

const MetricBox = styled.div`
  background: ${({ theme }) => theme.colors.surfaceHover};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing[4]};
`

const MetricNum = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
  margin-top: ${({ theme }) => theme.spacing[1]};
`

const TabRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing[2]};
  margin-bottom: ${({ theme }) => theme.spacing[3]};
`

const FormatButton = styled.button<{ $active: boolean }>`
  padding: ${({ theme }) => theme.spacing[2]} ${({ theme }) => theme.spacing[4]};
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.white};
  color: ${({ theme, $active }) =>
    $active ? theme.colors.white : theme.colors.text};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: 600;
`

const PreviewImage = styled.img`
  max-width: 420px;
  width: 100%;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
`

export function MandatoPublico() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [format, setFormat] = useState<'FEED' | 'STORIES'>('FEED')

  const { data, isLoading, isError } = useQuery<PublicMandateMeta>({
    queryKey: ['share-cards', 'public', slug],
    queryFn: async () => {
      const { data: res } = await api.get<PublicMandateMeta>(
        `/share-cards/public/${encodeURIComponent(slug)}/meta`,
      )
      return res
    },
    enabled: Boolean(slug),
    retry: false,
  })

  return (
    <Page>
      <Navbar />
      <Container>
        {isLoading && <SkeletonRows rows={4} height={90} label="Carregando dados do mandato" />}
        {isError && <Card>Mandato não encontrado.</Card>}
        {data && (
          <>
            <Card>
              <Title>{data.politician.name}</Title>
              <Sub>
                {data.roleLabel} · {data.territoryLabel} · Período {data.periodStart} a{' '}
                {data.periodEnd}
              </Sub>

              {data.metrics.suppressed ? (
                <Sub>
                  Volume insuficiente (&lt; 5 relatos no período) para exibição pública estatística.
                </Sub>
              ) : (
                <MetricsRow>
                  <MetricBox>
                    <Sub>Relatos no território</Sub>
                    <MetricNum>{data.metrics.received ?? '—'}</MetricNum>
                  </MetricBox>
                  <MetricBox>
                    <Sub>Relatos resolvidos</Sub>
                    <MetricNum>{data.metrics.resolved ?? '—'}</MetricNum>
                  </MetricBox>
                  <MetricBox>
                    <Sub>Mediana de resposta</Sub>
                    <MetricNum>
                      {data.metrics.medianResponseHours !== null
                        ? `${Math.round(data.metrics.medianResponseHours)}h`
                        : '—'}
                    </MetricNum>
                  </MetricBox>
                </MetricsRow>
              )}

              <Sub style={{ marginTop: 16 }}>
                {data.verificationNote}{' '}
                <Link to={`/politico/${data.politician.id}`}>
                  Ver perfil completo do mandato →
                </Link>
              </Sub>
            </Card>

            <Card>
              <TabRow>
                <FormatButton
                  type="button"
                  $active={format === 'FEED'}
                  onClick={() => setFormat('FEED')}
                >
                  Cartão Feed (1080×1350)
                </FormatButton>
                <FormatButton
                  type="button"
                  $active={format === 'STORIES'}
                  onClick={() => setFormat('STORIES')}
                >
                  Cartão Stories (1080×1920)
                </FormatButton>
              </TabRow>
              <PreviewImage
                src={format === 'FEED' ? data.images.feed : data.images.stories}
                alt={`Resumo público do mandato de ${data.politician.name}`}
              />
            </Card>
          </>
        )}
      </Container>
    </Page>
  )
}
