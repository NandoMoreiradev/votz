import { useEffect } from 'react'
import styled from 'styled-components'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import type { OrgType } from '../../hooks/useOrgMemberships'

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

/** Endereço da conversa do cidadão com a página, dentro da caixa unificada. */
export const pageConversationPath = (orgType: OrgType, orgId: string) => `/conversas/pagina/${orgType}/${orgId}`

/**
 * Botão "Mensagem" do perfil de político, entidade ou empresa.
 * Leva à caixa de mensagens (/conversas) com a conversa desta página aberta, como o Direct do Instagram.
 */
export function PageMessageButton({ orgType, orgId }: { orgType: OrgType; orgId: string }) {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const legacyLink = params.has('mensagens')
  // Links antigos (`?mensagens=1`, de quando a conversa abria no perfil) seguem funcionando.
  useEffect(() => {
    if (legacyLink && user) navigate(pageConversationPath(orgType, orgId), { replace: true })
  }, [legacyLink, user, navigate, orgType, orgId])
  return (
    <Btn type="button" onClick={() => navigate(user ? pageConversationPath(orgType, orgId) : '/entrar')}>
      Mensagem
    </Btn>
  )
}
