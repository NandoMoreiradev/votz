import styled from 'styled-components'

const Btn = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 10px 16px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
  transition: all 0.15s;
  text-decoration: none;

  &:hover {
    border-color: #c4c4c4;
    box-shadow: ${({ theme }) => theme.shadows.sm};
  }
`

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.8 19 13 24 13c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 10-1.9 13.7-5.1l-6.3-5.3C29.3 35.3 26.8 36 24 36c-5.2 0-9.7-3.3-11.3-8H6.3C9.7 35.4 16.3 40 24 40v4z"/>
    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.1-2.1 4-3.9 5.4l6.3 5.3C41.3 34.7 44 29.7 44 24c0-1.3-.1-2.7-.4-3.9z"/>
  </svg>
)

const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

export function GoogleButton({ label = 'Entrar com Google' }: { label?: string }) {
  return (
    <Btn href={`${API_BASE}/auth/google`}>
      <GoogleIcon />
      {label}
    </Btn>
  )
}
