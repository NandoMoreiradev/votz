import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useChatOpen } from './PageChatPanel'

const Btn = styled.button`
  padding: 8px 18px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1.5px solid ${({ theme }) => theme.colors.primary};
  background: transparent;
  color: ${({ theme }) => theme.colors.primary};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.colors.neutral};
  }
`

/**
 * Botão "Mensagem" do perfil de político, entidade ou empresa.
 * Não sai da página: abre o painel de conversa (`PageChatPanel`) no próprio perfil.
 */
export function PageMessageButton() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const { open, set } = useChatOpen()
  return (
    <Btn type="button" aria-expanded={open} onClick={() => (user ? set(true) : navigate('/entrar'))}>
      Mensagem
    </Btn>
  )
}
