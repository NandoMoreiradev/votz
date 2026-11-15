import { Link } from 'react-router-dom'
import styled from 'styled-components'
import { Lock } from '@phosphor-icons/react'

const Wrapper = styled.div`
  position: relative;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme }) => theme.colors.white};
  overflow: hidden;
  min-height: 260px;
`

const BlurredSample = styled.div`
  filter: blur(5px);
  opacity: 0.45;
  pointer-events: none;
  user-select: none;
  padding: ${({ theme }) => theme.spacing[6]};
`

const SampleBars = styled.div`
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: ${({ theme }) => theme.spacing[3]};
  align-items: end;
  height: 150px;
`

const SampleBar = styled.div<{ $h: number }>`
  height: ${({ $h }) => $h}%;
  background: ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.radii.sm};
`

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: ${({ theme }) => theme.spacing[6]};
  background: ${({ theme }) => `${theme.colors.white}cc`};
`

const ExampleBadge = styled.span`
  display: inline-block;
  padding: 2px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-transform: uppercase;
  margin-bottom: ${({ theme }) => theme.spacing[2]};
`

const Title = styled.h3`
  margin: 0 0 6px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.primary};
  display: flex;
  align-items: center;
  gap: 8px;
`

const Desc = styled.p`
  margin: 0 0 16px;
  max-width: 420px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
`

const CtaLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  padding: 10px 20px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-decoration: none;

  &:hover {
    opacity: 0.92;
  }
`

interface PlanLockedPreviewProps {
  featureName: string
  requiredPlan?: string
  description?: string
}

export function PlanLockedPreview({
  featureName,
  requiredPlan,
  description = 'Disponível nos planos avançados. Os números abaixo são meramente ilustrativos.',
}: PlanLockedPreviewProps) {
  return (
    <Wrapper aria-label={`${featureName} — bloqueado pelo plano atual`}>
      <BlurredSample aria-hidden="true">
        <SampleBars>
          <SampleBar $h={42} />
          <SampleBar $h={68} />
          <SampleBar $h={55} />
          <SampleBar $h={92} />
          <SampleBar $h={74} />
          <SampleBar $h={85} />
        </SampleBars>
      </BlurredSample>
      <Overlay>
        <ExampleBadge>Exemplo ilustrativo</ExampleBadge>
        <Title>
          <Lock size={18} weight="bold" aria-hidden="true" />
          {featureName}
        </Title>
        <Desc>
          {description}
          {requiredPlan ? ` Plano necessário: ${requiredPlan}.` : ''}
        </Desc>
        <CtaLink to="/planos">Ver planos</CtaLink>
      </Overlay>
    </Wrapper>
  )
}
