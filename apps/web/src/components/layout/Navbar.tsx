import { useState, useRef, useEffect } from 'react'
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

const AvatarWrapper = styled.div`
  position: relative;
`

const Avatar = styled.button<{ $src?: string | null }>`
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover` : theme.colors.action};
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

const Dropdown = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  box-shadow: ${({ theme }) => theme.shadows.md};
  min-width: 168px;
  overflow: hidden;
  z-index: 200;
`

const DropdownItem = styled(Link)`
  display: block;
  padding: 10px 16px;
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  transition: background 0.1s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const DropdownButton = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 16px;
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.action};
  background: none;
  border: none;
  cursor: pointer;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  transition: background 0.1s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
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
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function close(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  function handleLogout() {
    logout()
    setOpen(false)
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
          <NavLink to="/mapa">Mapa</NavLink>
        </NavLinks>

        <Actions>
          {user ? (
            <>
              <ReportButton as={Link as any} to="/novo">
                + Relatar
              </ReportButton>
              <AvatarWrapper ref={wrapperRef}>
                <Avatar
                  $src={user.avatarUrl}
                  onClick={() => setOpen((o) => !o)}
                  title={user.name}
                >
                  {!user.avatarUrl && user.name.charAt(0).toUpperCase()}
                </Avatar>
                {open && (
                  <Dropdown>
                    <DropdownItem to={`/perfil/${user.id}`} onClick={() => setOpen(false)}>
                      Meu perfil
                    </DropdownItem>
                    <DropdownItem to="/meu-perfil" onClick={() => setOpen(false)}>
                      Editar perfil
                    </DropdownItem>
                    <DropdownButton onClick={handleLogout}>Sair</DropdownButton>
                  </Dropdown>
                )}
              </AvatarWrapper>
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
