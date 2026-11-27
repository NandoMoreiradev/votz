import styled from 'styled-components'
import type { Mandatometer, ProfileMetrics } from '../../types/api'

const Wrap = styled.section`
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const Title = styled.h3`
  margin: 0 0 4px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.text};
`

const Sub = styled.p`
  margin: 0 0 12px;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
`

type Tone = 'positive' | 'info' | 'warning' | 'action' | 'muted'

const Cell = styled.div<{ $tone: Tone }>`
  padding: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-top: 3px solid
    ${({ $tone, theme }) =>
      $tone === 'positive' ? theme.colors.positive : $tone === 'info' ? theme.colors.info : $tone === 'warning' ? theme.colors.warning : $tone === 'action' ? theme.colors.action : theme.colors.muted};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surface};
`

const Value = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const Label = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 2px;
`

const Facts = styled.ul`
  margin: 12px 0 0;
  padding-left: 18px;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.6;
`

/** Bloco do Mandatômetro com o que o político assumiu (avocou) e a qualidade das resoluções. */
export function MandatometerCommitments({ m, metrics }: { m: Mandatometer | null | undefined; metrics?: ProfileMetrics }) {
  const c = m?.commitments
  if (!m || !c) return null
  return (
    <Wrap aria-label="Compromissos assumidos">
      <Title>Compromissos assumidos</Title>
      <Sub>
        Relatos que este político avocou: assumiu em público o compromisso de acompanhar até a solução, mesmo quando o
        problema era de outro órgão.
      </Sub>
      <Grid>
        <Cell $tone="muted">
          <Value>{c.total}</Value>
          <Label>Avocados</Label>
        </Cell>
        <Cell $tone="positive">
          <Value>{c.fulfilled}</Value>
          <Label>Cumpridos (resolvidos)</Label>
        </Cell>
        <Cell $tone="info">
          <Value>{c.inProgress}</Value>
          <Label>Em acompanhamento</Label>
        </Cell>
        <Cell $tone="warning">
          <Value>{c.overdue}</Value>
          <Label>Com prazo vencido</Label>
        </Cell>
        <Cell $tone="action">
          <Value>{c.withdrawn + c.abandoned}</Value>
          <Label>Desistiu ou deixou sem solução</Label>
        </Cell>
      </Grid>
      {metrics && (
        <Facts>
          {typeof metrics.commitmentRate === 'number' && c.total - c.inProgress > 0 && (
            <li>{metrics.commitmentRate}% dos compromissos já encerrados foram cumpridos.</li>
          )}
          {typeof metrics.confirmedRate === 'number' && m.resolved > 0 && (
            <li>Em {metrics.confirmedRate}% dos relatos resolvidos, quem fez o relato confirmou a solução.</li>
          )}
          {typeof metrics.disputesUpheldRate === 'number' && (m.disputesUpheld ?? 0) > 0 && (
            <li>{metrics.disputesUpheldRate}% das contestações foram aceitas pela moderação (o relato voltou a andar).</li>
          )}
        </Facts>
      )}
    </Wrap>
  )
}
