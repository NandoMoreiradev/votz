import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  EnvelopeSimple,
  Key,
  Plus,
  ShieldCheck,
  UserPlus,
  UsersThree,
} from '@phosphor-icons/react'
import { useAuthStore } from '../../store/auth.store'
import { TeamPanel } from '../../components/org/TeamPanel'
import { YoutubeChannelsPanel } from '../../components/org/YoutubeChannelsPanel'
import { PageHandlePanel } from '../../components/page-inbox/PageHandlePanel'
import { usePolitician } from '../../hooks/usePoliticians'
import { useEntity } from '../../hooks/useEntities'
import { useCompany } from '../../hooks/useCompanies'
import {
  useOrgRoles,
  useTeamSummary,
  type OrgType,
} from '../../hooks/useOrgMemberships'
import {
  CtaButton,
  DefList,
  GhostButton,
  PageHeader,
  Panel,
  PanelBody,
  PanelFoot,
  PanelHead,
  SplitLayout,
  Stack,
  StatCard,
  StatGrid,
  StatSkeletons,
  StudioPage,
} from '../../components/studio/studio-ui'

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

/** Equipe, convites, cargos, @usuário da página e canais do YouTube — pareado ao layout completo do Estúdio. */
export function StudioTeam() {
  const { user, activeContext } = useAuthStore()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)

  const canManageMembers = !!activeContext?.permissions.includes('MANAGE_MEMBERS')
  const canManageProfile = !!activeContext?.permissions.includes('MANAGE_PROFILE')
  const hasYoutube = activeContext?.type === 'POLITICIAN' || activeContext?.type === 'ENTITY'

  const summary = useTeamSummary(
    activeContext?.type ?? 'ENTITY',
    activeContext?.id ?? '',
    !!activeContext && canManageMembers,
  )
  const roles = useOrgRoles(
    activeContext?.type ?? 'ENTITY',
    activeContext?.id ?? '',
    !!activeContext && canManageMembers,
  )

  if (!user || !activeContext) return null

  const customRolesCount = (roles.data ?? []).filter((r) => !r.isDefault).length
  const seatsFull = summary.data?.availableSlots === 0

  return (
    <StudioPage>
      <PageHeader
        crumbs={[{ label: 'Sua página' }, { label: 'Equipe e acesso' }]}
        title="Equipe e acesso"
        description={
          <>
            Gerencie quem pode agir em nome de <strong>{activeContext.name}</strong>, convites pendentes, cargos e canais ligados.
          </>
        }
        actions={
          canManageMembers && (
            <>
              <GhostButton type="button" onClick={() => setRoleOpen(true)}>
                <Plus size={15} weight="bold" aria-hidden="true" /> Novo cargo
              </GhostButton>
              <CtaButton
                type="button"
                disabled={seatsFull}
                title={seatsFull ? 'Limite de assentos do plano atingido' : undefined}
                onClick={() => setInviteOpen(true)}
              >
                <UserPlus size={16} weight="bold" aria-hidden="true" /> Convidar membro
              </CtaButton>
            </>
          )
        }
      />

      {canManageMembers && (
        <div style={{ marginBottom: 16 }}>
          {summary.isLoading ? (
            <StatSkeletons count={4} />
          ) : (
            <StatGrid>
              <StatCard
                label="Membros ativos"
                icon={UsersThree}
                value={String(summary.data?.activeMembers ?? 0)}
                hint={
                  summary.data && summary.data.suspendedMembers > 0
                    ? `${summary.data.suspendedMembers} suspenso(s)`
                    : 'todos com acesso ativo'
                }
              />
              <StatCard
                label="Convites pendentes"
                icon={EnvelopeSimple}
                value={String(summary.data?.pendingInvites ?? 0)}
                hint={
                  summary.data && summary.data.pendingInvites > 0
                    ? 'aguardando aceite (7 dias)'
                    : 'nenhum aguardando'
                }
              />
              <StatCard
                label="Cargos configurados"
                icon={Key}
                value={String(roles.data?.length ?? 0)}
                hint={
                  customRolesCount > 0
                    ? `${customRolesCount} personalizado(s)`
                    : 'apenas cargos padrão'
                }
              />
              <StatCard
                label="Assentos do plano"
                icon={ShieldCheck}
                value={
                  summary.data?.maxMembers === null || summary.data?.maxMembers === undefined
                    ? 'Ilimitado'
                    : `${summary.data.usedSlots} / ${summary.data.maxMembers}`
                }
                hint={
                  summary.data?.availableSlots === null || summary.data?.availableSlots === undefined
                    ? `Plano ${summary.data?.plan ?? ''}`
                    : summary.data.availableSlots === 0
                      ? 'limite atingido'
                      : `${summary.data.availableSlots} vaga(s) disponível(is)`
                }
              />
            </StatGrid>
          )}
        </div>
      )}

      <SplitLayout $side={360}>
        <TeamPanel
          orgType={activeContext.type}
          orgId={activeContext.id}
          currentUserId={user.id}
          currentUserPermissions={activeContext.permissions}
          inviteOpen={inviteOpen}
          onInviteOpenChange={setInviteOpen}
          roleDrawerOpen={roleOpen}
          onRoleDrawerOpenChange={setRoleOpen}
        />

        <Stack>
          {canManageProfile && <HandleFor type={activeContext.type} id={activeContext.id} />}
          {hasYoutube && <YoutubeChannelsPanel />}
          <Panel>
            <PanelHead title="Segurança e limites" hint="Regras aplicadas automaticamente ao acesso." />
            <PanelBody>
              <DefList>
                <dt>Proteção de dono</dt>
                <dd>Sempre há pelo menos um Proprietário ativo. Gestores não podem alterar ou remover Proprietários.</dd>
                <dt>Validade do convite</dt>
                <dd>Links de convite expiram em 7 dias e reservam uma vaga até serem aceitos ou cancelados.</dd>
                <dt>Suspensão rápida</dt>
                <dd>Você pode suspender um membro sem perder o cargo ou histórico e reativá-lo quando quiser.</dd>
              </DefList>
            </PanelBody>
            <PanelFoot>
              <span>Precisa de mais vagas na equipe?</span>
              <Link to="/estudio/planos">Ver planos</Link>
            </PanelFoot>
          </Panel>
        </Stack>
      </SplitLayout>
    </StudioPage>
  )
}
