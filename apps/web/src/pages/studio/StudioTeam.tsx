import styled from 'styled-components'
import { useAuthStore } from '../../store/auth.store'
import { TeamPanel } from '../../components/org/TeamPanel'
import { YoutubeChannelsPanel } from '../../components/org/YoutubeChannelsPanel'
import { PageHandlePanel } from '../../components/page-inbox/PageHandlePanel'
import { usePolitician } from '../../hooks/usePoliticians'
import { useEntity } from '../../hooks/useEntities'
import { useCompany } from '../../hooks/useCompanies'
import type { OrgType } from '../../hooks/useOrgMemberships'

const Head = styled.header`
  margin-bottom: 20px;
`

const Title = styled.h1`
  margin: 0 0 4px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const Sub = styled.p`
  margin: 0;
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
`

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 920px;
`

/** O @usuário da página fica no cadastro de cada tipo de perfil; buscamos o do perfil ativo. */
function HandleFor({ type, id }: { type: OrgType; id: string }) {
  const politician = usePoliticianIf(type === 'POLITICIAN' ? id : '')
  const entity = useEntityIf(type === 'ENTITY' ? id : '')
  const company = useCompanyIf(type === 'COMPANY' ? id : '')
  const data = (politician ?? entity ?? company) as { username?: string | null } | undefined
  return <PageHandlePanel orgType={type} orgId={id} current={data?.username} />
}

// Os hooks já ignoram id vazio (`enabled: !!id`), então podem ser chamados sempre.
function usePoliticianIf(id: string) { return usePolitician(id).data }
function useEntityIf(id: string) { return useEntity(id).data }
function useCompanyIf(id: string) { return useCompany(id).data }

/** Equipe, @usuário da página e canais do YouTube: o que antes ficava na página do perfil. */
export function StudioTeam() {
  const { user, activeContext } = useAuthStore()
  if (!user || !activeContext) return null

  const canManageProfile = activeContext.permissions.includes('MANAGE_PROFILE')
  const hasYoutube = activeContext.type === 'POLITICIAN' || activeContext.type === 'ENTITY'

  return (
    <>
      <Head>
        <Title>Equipe e acesso</Title>
        <Sub>Quem pode agir em nome de {activeContext.name}, o @usuário da página e os canais ligados a ela.</Sub>
      </Head>
      <Stack>
        <TeamPanel orgType={activeContext.type} orgId={activeContext.id} currentUserId={user.id} />
        {canManageProfile && <HandleFor type={activeContext.type} id={activeContext.id} />}
        {hasYoutube && <YoutubeChannelsPanel />}
      </Stack>
    </>
  )
}
