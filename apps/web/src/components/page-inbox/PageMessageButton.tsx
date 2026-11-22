import { useEffect } from 'react'
import styled from 'styled-components'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { profileActionOutline } from '../profile/profile-actions'
import type { OrgType } from '../../hooks/useOrgMemberships'

const Btn = styled.button`
  ${profileActionOutline}
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
