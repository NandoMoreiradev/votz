import styled from 'styled-components'
import { Navbar } from '../layout/Navbar'

interface LegalPlaceholderPageProps {
  title: string
  version: string
}

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.main`
  max-width: 760px;
  margin: 0 auto;
  padding: ${({ theme }) => `${theme.spacing[10]} ${theme.spacing[6]} ${theme.spacing[16]}`};
`

const Card = styled.article`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing[8]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing[4]};
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.primary};
`

const VersionTag = styled.span`
  display: inline-block;
  align-self: flex-start;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => `${theme.spacing[1]} ${theme.spacing[2]}`};
`

const BodyText = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.6;
`

const ControllerInfo = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  padding-top: ${({ theme }) => theme.spacing[4]};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

export function LegalPlaceholderPage({ title, version }: LegalPlaceholderPageProps) {
  return (
    <Page>
      <Navbar />
      <Content>
        <Card>
          <Title>{title}</Title>
          <VersionTag>Versão: {version}</VersionTag>
          <BodyText>
            Este documento está em elaboração e será publicado antes da abertura ao público. Dúvidas: fernandomoreira.dev@gmail.com.
          </BodyText>
          <ControllerInfo>
            Votz do Brasil · CNPJ 55.188.948/0001-04 · Foro: Aracaju/SE
          </ControllerInfo>
        </Card>
      </Content>
    </Page>
  )
}
