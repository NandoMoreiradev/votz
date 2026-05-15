import styled from 'styled-components'
import { theme } from '../theme'

const Container = styled.main`
  max-width: 1200px;
  margin: 0 auto;
  padding: ${theme.spacing[6]};
`

const Hero = styled.section`
  text-align: center;
  padding: ${theme.spacing[16]} ${theme.spacing[6]};
`

const Title = styled.h1`
  font-size: ${theme.fontSizes['4xl']};
  color: ${theme.colors.primary};
  margin-bottom: ${theme.spacing[4]};
`

const Tagline = styled.p`
  font-size: ${theme.fontSizes.xl};
  color: ${theme.colors.action};
  font-style: italic;
  margin-bottom: ${theme.spacing[8]};
`

const Subtitle = styled.p`
  font-size: ${theme.fontSizes.lg};
  color: ${theme.colors.muted};
  max-width: 600px;
  margin: 0 auto;
`

export function Home() {
  return (
    <Container>
      <Hero>
        <Title>Votz</Title>
        <Tagline>Vote com a voz. Cobre com o Votz.</Tagline>
        <Subtitle>
          Sua reclamação agora tem endereço, registro e pressão coletiva.
          Transformamos relatos em compromissos rastreáveis.
        </Subtitle>
      </Hero>
    </Container>
  )
}
