import styled from 'styled-components'
import { ProfileMetrics } from '../../types/api'

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: ${({ theme }) => theme.colors.border};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
  margin: 16px 0 0;
`

const Cell = styled.div`
  background: ${({ theme }) => theme.colors.white};
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 3px;
`

const Value = styled.span<{ $color?: string }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ $color, theme }) => $color ?? theme.colors.text};
`

const Label = styled.span`
  font-size: 0.6875rem;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

interface Props {
  metrics: ProfileMetrics
}

export function MetricsBar({ metrics }: Props) {
  return (
    <Grid>
      <Cell>
        <Value
          $color={undefined}
          style={{
            color: metrics.responseRate >= 70 ? '#2DC653' : metrics.responseRate >= 40 ? '#F59E0B' : '#E63946',
          }}
        >
          {metrics.responseRate}%
        </Value>
        <Label>Respondidos</Label>
      </Cell>
      <Cell>
        <Value
          style={{
            color: metrics.resolutionRate >= 70 ? '#2DC653' : metrics.resolutionRate >= 40 ? '#F59E0B' : '#E63946',
          }}
        >
          {metrics.resolutionRate}%
        </Value>
        <Label>Resolvidos</Label>
      </Cell>
      <Cell>
        <Value
          style={{
            color: metrics.contestationRate <= 10 ? '#2DC653' : metrics.contestationRate <= 30 ? '#F59E0B' : '#E63946',
          }}
        >
          {metrics.contestationRate}%
        </Value>
        <Label>Contestados</Label>
      </Cell>
    </Grid>
  )
}
