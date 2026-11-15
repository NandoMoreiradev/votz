import * as Dialog from '@radix-ui/react-dialog'
import { Info, X } from '@phosphor-icons/react'
import styled from 'styled-components'
import { ANALYTICS_DEFINITION_DATE, ANALYTICS_METRIC_DICTIONARY, AnalyticsMetricKey } from '@votz/shared-types'

const IconTrigger = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const Overlay = styled(Dialog.Overlay)`
  position: fixed;
  inset: 0;
  background: ${({ theme }) => `${theme.colors.primary}80`};
  backdrop-filter: blur(2px);
  z-index: 900;
`

const Content = styled(Dialog.Content)`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(520px, calc(100vw - 32px));
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  padding: ${({ theme }) => theme.spacing[6]};
  z-index: 901;
`

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing[3]};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`

const Title = styled(Dialog.Title)`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.primary};
  margin: 0;
`

const CloseButton = styled(Dialog.Close)`
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing[3]};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.55;
`

const FormulaBox = styled.code`
  display: block;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing[3]};
  color: ${({ theme }) => theme.colors.primary};
  word-break: break-word;
`

const MetaLine = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
`

interface MetricInfoModalProps {
  metricKey: AnalyticsMetricKey
}

export function MetricInfoModal({ metricKey }: MetricInfoModalProps) {
  const entry = ANALYTICS_METRIC_DICTIONARY[metricKey]
  if (!entry) return null

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <IconTrigger
          type="button"
          title={`Definição de ${entry.name}`}
          aria-label={`Ver definição técnica de ${entry.name}`}
        >
          <Info size={14} weight="bold" aria-hidden="true" />
        </IconTrigger>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Overlay />
        <Content>
          <Header>
            <Title>{entry.name}</Title>
            <CloseButton type="button" aria-label="Fechar definição">
              <X size={16} weight="bold" aria-hidden="true" />
            </CloseButton>
          </Header>
          <Body>
            <Dialog.Description asChild>
              <p style={{ margin: 0 }}>{entry.definition}</p>
            </Dialog.Description>
            <div>
              <strong>Fórmula oficial:</strong>
              <FormulaBox>{entry.formula}</FormulaBox>
            </div>
            <MetaLine>
              Versão do dicionário: {entry.version} · Vigência: {ANALYTICS_DEFINITION_DATE}
            </MetaLine>
          </Body>
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
