import styled from 'styled-components'

const Wrap = styled.span<{ $trust: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  padding: 3px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ $trust, theme }) =>
    $trust ? theme.colors.positive + '15' : theme.colors.neutral};
  color: ${({ $trust, theme }) =>
    $trust ? theme.colors.positive : theme.colors.muted};
  border: 1px solid ${({ $trust, theme }) =>
    $trust ? theme.colors.positive + '45' : theme.colors.border};
  letter-spacing: 0.03em;
  text-transform: uppercase;
`

interface Props {
  classification: string
  trustBadge: boolean
}

export function TrustBadge({ classification, trustBadge }: Props) {
  return (
    <Wrap $trust={trustBadge}>
      {trustBadge && '★ '}
      {classification}
    </Wrap>
  )
}
