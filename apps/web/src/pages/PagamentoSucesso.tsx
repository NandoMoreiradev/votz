import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'

export function PagamentoSucesso() {
  return (
    <Page>
      <Navbar />
      <Content>
        <Icon>✓</Icon>
        <Title>Plano ativado com sucesso!</Title>
        <Sub>
          Seu pagamento foi confirmado. O plano já está ativo na sua organização.
          Em alguns instantes as funcionalidades estarão disponíveis.
        </Sub>
        <Actions>
          <PrimaryBtn to="/">Ir para o início</PrimaryBtn>
          <SecondaryBtn to="/planos">Ver meus planos</SecondaryBtn>
        </Actions>
      </Content>
    </Page>
  )
}

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 480px;
  margin: 80px auto;
  text-align: center;
  padding: 0 24px;
`

const Icon = styled.div`
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.positive};
  color: white;
  font-size: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
  margin-bottom: 12px;
`

const Sub = styled.p`
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.6;
  margin-bottom: 32px;
`

const Actions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
`

const PrimaryBtn = styled(Link)`
  padding: 10px 24px;
  background: ${({ theme }) => theme.colors.positive};
  color: white;
  border-radius: 8px;
  font-weight: 600;
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  &:hover { opacity: 0.88; }
`

const SecondaryBtn = styled(Link)`
  padding: 10px 24px;
  background: transparent;
  color: ${({ theme }) => theme.colors.primary};
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  font-weight: 600;
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  &:hover { background: ${({ theme }) => theme.colors.surfaceHover}; }
`
