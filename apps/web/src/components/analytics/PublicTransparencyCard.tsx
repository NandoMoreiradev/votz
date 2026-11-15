import { useState } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import {
  AnalyticsPeriodPreset,
  usePublicEntityAnalytics,
  usePublicPoliticianAnalytics,
} from '../../hooks/useAnalytics'
import { MetricInfoModal } from './MetricInfoModal'

const Box = styled.section`
  margin-top: ${({ theme }) => theme.spacing[4]};
  padding: ${({ theme }) => theme.spacing[4]};
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
`

const TopRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: ${({ theme }) => theme.spacing[3]};
`

const Title = styled.h4`
  margin: 0;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.primary};
`

const PeriodSelect = styled.select`
  padding: 4px 8px;
  border-radius: ${({ theme }) => theme.radii.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.text};
`

const MetricsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: ${({ theme }) => theme.spacing[3]};
`

const Item = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 10px 12px;
`

const ItemHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
`

const ItemVal = styled.div`
  margin-top: 4px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.primary};
`

const Footer = styled.div`
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
`

const SuppressedMsg = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
`

interface PublicTransparencyCardProps {
  orgType: 'ENTITY' | 'POLITICIAN'
  orgId: string
  showOwnerPanelLink?: boolean
}

export function PublicTransparencyCard({
  orgType,
  orgId,
  showOwnerPanelLink,
}: PublicTransparencyCardProps) {
  const [period, setPeriod] = useState<AnalyticsPeriodPreset>('30d')

  const entityQ = usePublicEntityAnalytics(orgType === 'ENTITY' ? orgId : undefined, period)
  const politicianQ = usePublicPoliticianAnalytics(
    orgType === 'POLITICIAN' ? orgId : undefined,
    period,
  )
  const activeQ = orgType === 'ENTITY' ? entityQ : politicianQ

  if (activeQ.isLoading) {
    return (
      <Box>
        <SuppressedMsg>Carregando indicadores públicos de transparência...</SuppressedMsg>
      </Box>
    )
  }

  if (activeQ.isError || !activeQ.data) {
    return null
  }

  const data = activeQ.data

  return (
    <Box aria-label="Transparência pública de atendimento">
      <TopRow>
        <Title>Indicadores públicos de atendimento</Title>
        <PeriodSelect
          aria-label="Período dos indicadores públicos"
          value={period}
          onChange={(e) => setPeriod(e.target.value as AnalyticsPeriodPreset)}
        >
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="90d">Últimos 90 dias</option>
          <option value="365d">Últimos 12 meses</option>
        </PeriodSelect>
      </TopRow>

      {data.suppressed ? (
        <SuppressedMsg>
          Poucos relatos para mostrar com segurança neste recorte (mínimo de {data.minCellSize}{' '}
          relatos por k-anonimato).
        </SuppressedMsg>
      ) : (
        <MetricsRow>
          <Item>
            <ItemHead>
              <span>Volume</span>
              <MetricInfoModal metricKey="volume" />
            </ItemHead>
            <ItemVal>{data.kpis.volume}</ItemVal>
          </Item>
          <Item>
            <ItemHead>
              <span>Resolução</span>
              <MetricInfoModal metricKey="resolution_rate" />
            </ItemHead>
            <ItemVal>
              {data.kpis.resolutionRate.value !== null ? `${data.kpis.resolutionRate.value}%` : '—'}
            </ItemVal>
          </Item>
          <Item>
            <ItemHead>
              <span>1ª resposta (p50)</span>
              <MetricInfoModal metricKey="first_response_median_h" />
            </ItemHead>
            <ItemVal>
              {data.kpis.firstResponseMedianH !== null ? `${data.kpis.firstResponseMedianH}h` : '—'}
            </ItemVal>
          </Item>
          <Item>
            <ItemHead>
              <span>Taxa de resposta</span>
              <MetricInfoModal metricKey="response_rate" />
            </ItemHead>
            <ItemVal>
              {data.kpis.responseRate.value !== null ? `${data.kpis.responseRate.value}%` : '—'}
            </ItemVal>
          </Item>
        </MetricsRow>
      )}

      <Footer>
        <span>
          Amostra: {data.sampleSize ?? '<10'} · Definição {data.definitionVersion}
        </span>
        {showOwnerPanelLink && (
          <Link to="/painel-dados" style={{ fontWeight: 600 }}>
            Abrir Painel de Dados completo →
          </Link>
        )}
      </Footer>
    </Box>
  )
}
