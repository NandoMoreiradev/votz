import styled from 'styled-components'
import { Link } from 'react-router-dom'

const Foot = styled.footer`
  background: ${({ theme }) => theme.colors.primary};
  color: rgba(255, 255, 255, 0.75);
  padding: 56px 32px 32px;
  margin-top: auto;

  @media (max-width: 640px) { padding: 40px 20px 28px; }
`

const Inner = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 48px;
  padding-bottom: 40px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

  @media (max-width: 900px) { grid-template-columns: 1fr 1fr; gap: 32px; }
  @media (max-width: 540px) { grid-template-columns: 1fr; gap: 28px; }
`

const Brand = styled.div``

const Logo = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.25rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.02em;
  margin-bottom: 12px;

  span { color: ${({ theme }) => theme.colors.action}; font-size: 1rem; }
`

const Tagline = styled.p`
  font-size: 0.9375rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.6);
  max-width: 280px;
  margin-bottom: 20px;
`

const Col = styled.div``

const ColTitle = styled.h4`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 16px;
`

const NavList = styled.ul`
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const NavItem = styled.li``

const NavLink = styled(Link)`
  font-size: 0.9375rem;
  color: rgba(255, 255, 255, 0.7);
  transition: color 0.15s;
  &:hover { color: #fff; }
`

const NavA = styled.a`
  font-size: 0.9375rem;
  color: rgba(255, 255, 255, 0.7);
  transition: color 0.15s;
  &:hover { color: #fff; }
`

const Bottom = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 28px;
  gap: 16px;
  flex-wrap: wrap;

  @media (max-width: 640px) { flex-direction: column; align-items: flex-start; gap: 8px; }
`

const Copyright = styled.span`
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.4);
`

const Slogan = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.04em;
`

const LgpdBadge = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 3px 8px;
  border-radius: 4px;
`

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <Foot>
      <Inner>
        <Grid>
          {/* Marca */}
          <Brand>
            <Logo to="/">
              <span>◆</span> VOTZ
            </Logo>
            <Tagline>
              Transformando reclamação em registro, registro em pressão e pressão em ação.
            </Tagline>
            <LgpdBadge>LGPD Compliant</LgpdBadge>
          </Brand>

          {/* Plataforma */}
          <Col>
            <ColTitle>Plataforma</ColTitle>
            <NavList>
              <NavItem><NavLink to="/">Explorar relatos</NavLink></NavItem>
              <NavItem><NavLink to="/entidades">Entidades</NavLink></NavItem>
              <NavItem><NavLink to="/politicos">Políticos</NavLink></NavItem>
              <NavItem><NavLink to="/mapa">Mapa de relatos</NavLink></NavItem>
              <NavItem><NavLink to="/novo">+ Criar relato</NavLink></NavItem>
            </NavList>
          </Col>

          {/* Recursos */}
          <Col>
            <ColTitle>Recursos</ColTitle>
            <NavList>
              <NavItem><NavLink to="/solicitar-cadastro">Solicitar cadastro</NavLink></NavItem>
              <NavItem><NavA href="#imprensa">Para a imprensa</NavA></NavItem>
              <NavItem><NavA href="/api/v1/docs" target="_blank" rel="noreferrer">API pública</NavA></NavItem>
            </NavList>
          </Col>

          {/* Legal */}
          <Col>
            <ColTitle>Legal</ColTitle>
            <NavList>
              <NavItem><NavA href="#">Termos de uso</NavA></NavItem>
              <NavItem><NavA href="#">Política de privacidade</NavA></NavItem>
              <NavItem><NavA href="mailto:contato@votz.app">Contato</NavA></NavItem>
              <NavItem><NavA href="mailto:suporte@votz.app">Reportar problema</NavA></NavItem>
            </NavList>
          </Col>
        </Grid>

        <Bottom>
          <Copyright>© {year} Votz. Todos os direitos reservados.</Copyright>
          <Slogan>Dados abertos. Sem partido. Pelo Brasil.</Slogan>
        </Bottom>
      </Inner>
    </Foot>
  )
}
