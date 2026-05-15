import styled from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { useAuthStore } from '../../store/auth.store'

const Nav = styled.nav`
  position: sticky;
  top: 0;
  z-index: 100;
  background: ${({ theme }) => theme.colors.primary};
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 24px;
  box-shadow: 0 1px 0 rgba(255,255,255,0.06);
`

const Inner = styled.div`
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 32px;
`

const Logo = styled(Link)`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.25rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: #fff;
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;

  span {
    color: ${({ theme }) => theme.colors.action};
  }
`

const NavLinks = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
`

const NavLink = styled(Link)`
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  padding: 6px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  transition: all 0.15s;

  &:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
  }
`

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
`

const Avatar = styled.button`
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.action};
  color: #fff;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  font-size: 0.875rem;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`

const ReportButton = styled(Button)`
  background: ${({ theme }) => theme.colors.action};
  color: #fff;
  border-color: transparent;
  font-size: 0.875rem;
  padding: 7px 16px;

  &:hover {
    background: #c8313d;
  }
`

export function Navbar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <Nav>
      <Inner>
        <Logo to="/">
          <span>◆</span> VOTZ
        </Logo>

        <NavLinks>
          <NavLink to="/">Explorar</NavLink>
        </NavLinks>

        <Actions>
          {user ? (
            <>
              <ReportButton as={Link as any} to="/novo">
                + Relatar
              </ReportButton>
              <Avatar onClick={handleLogout} title="Sair">
                {user.name.charAt(0).toUpperCase()}
              </Avatar>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                as={Link as any}
                to="/entrar"
                style={{ color: 'rgba(255,255,255,0.8)' }}
              >
                Entrar
              </Button>
              <ReportButton as={Link as any} to="/novo">
                + Relatar
              </ReportButton>
            </>
          )}
        </Actions>
      </Inner>
    </Nav>
  )
}
