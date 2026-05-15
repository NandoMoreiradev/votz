import styled from 'styled-components'

const MAX_SCORE = 200

function getPressureColor(score: number): string {
  if (score >= 120) return '#E63946'
  if (score >= 60)  return '#F59E0B'
  return '#9CA3AF'
}

const Track = styled.div`
  width: 100%;
  height: 4px;
  background: ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.full};
  overflow: hidden;
`

const Fill = styled.div<{ $width: number; $color: string }>`
  height: 100%;
  width: ${({ $width }) => $width}%;
  background: ${({ $color }) => $color};
  border-radius: ${({ theme }) => theme.radii.full};
  transition: width 0.4s ease;
`

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const Label = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const ScoreText = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
`

const PressureLabel = styled.span`
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
`

interface PressureBarProps {
  score: number
  showLabel?: boolean
}

export function PressureBar({ score, showLabel = true }: PressureBarProps) {
  const pct = Math.min((score / MAX_SCORE) * 100, 100)
  const color = getPressureColor(score)

  return (
    <Wrapper>
      {showLabel && (
        <Label>
          <PressureLabel>Pressão</PressureLabel>
          <ScoreText>{score.toFixed(0)} pts</ScoreText>
        </Label>
      )}
      <Track>
        <Fill $width={pct} $color={color} />
      </Track>
    </Wrapper>
  )
}
