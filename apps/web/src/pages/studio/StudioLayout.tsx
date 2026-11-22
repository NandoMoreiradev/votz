import { useState, type ReactNode } from 'react'
import styled from 'styled-components'
import { Link, Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ArrowLeft } from '@phosphor-icons/react'
import { Navbar } from '../../components/layout/Navbar'
import { StudioEmbedContext } from '../../components/layout/StudioEmbed'
import { ProfileSelectModal } from '../../components/ui/ProfileSelectModal'
import { useAuthStore } from '../../store/auth.store'
import { useMyProfiles, useSwitchContext } from '../../hooks/useAuth'
import { ORG_TYPE_ICON, ORG_TYPE_LABEL, studioNav } from './studio-nav'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Shell = styled.div`
  max-width: 1480px;
  margin: 0 auto;
  padding: 24px 32px 64px;
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  gap: 24px;
  align-items: start;

  @media (max-width: 960px) {
    grid-template-columns: minmax(0, 1fr);
    padding: 16px;
    gap: 16px;
  }
`

const Sidebar = styled.aside`
  position: sticky;
  top: 72px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: calc(100vh - 88px);
  overflow-y: auto;
  scrollbar-width: thin;

  @media (max-width: 960px) { position: static; max-height: none; overflow: visible; }
`

const OrgCard = styled.div`
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const OrgTop = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`

const OrgAvatar = styled.div<{ $src: string | null }>`
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 10px;
  background: ${({ $src }) => ($src ? `url(${$src}) center/cover` : 'rgba(255,255,255,0.14)')};
  display: grid;
  place-items: center;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  font-size: 1.0625rem;
`

const OrgName = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.9375rem;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
`

const OrgKind = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.72);
`

const ExitBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;

  &:hover { background: rgba(255, 255, 255, 0.12); }
  &:disabled { opacity: 0.6; cursor: default; }
`

const NavBox = styled.nav`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  @media (max-width: 960px) {
    flex-direction: row;
    overflow-x: auto;
    gap: 6px;
  }
`

const GroupTitle = styled.div`
  padding: 2px 10px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};

  @media (max-width: 960px) { display: none; }
`

const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;

  @media (max-width: 960px) { flex-direction: row; gap: 6px; }
`

const Item = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
  transition: background 0.15s;

  svg { flex-shrink: 0; color: ${({ theme }) => theme.colors.muted}; }
  &:hover { background: ${({ theme }) => theme.colors.neutral}; }

  &.active {
    background: ${({ theme }) => theme.colors.primary};
    color: #fff;
    font-weight: 600;
    svg { color: #fff; }
  }
`

/**
 * Área da tela da vez. As telas de gestão foram feitas para ocupar a página inteira
 * (fundo, largura máxima e espaços próprios); aqui elas encaixam no espaço do Estúdio.
 */
const Main = styled.div`
  min-width: 0;

  & > div,
  & > main {
    min-height: 0 !important;
    padding-bottom: 0 !important;
    background: transparent !important;
    overflow: visible !important;
    padding: 0 !important;
  }

  & > div > *,
  & > main > * {
    max-width: none !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
    padding-top: 0 !important;
  }
`

const Gate = styled.div`
  max-width: 560px;
  margin: 64px auto;
  padding: 0 16px;
`

const GateCard = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: flex-start;

  h1 {
    margin: 0;
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: ${({ theme }) => theme.fontSizes['2xl']};
  }
  p { margin: 0; color: ${({ theme }) => theme.colors.muted}; line-height: 1.55; }
`

const GateBtn = styled.button`
  height: 40px;
  padding: 0 20px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: none;
  background: ${({ theme }) => theme.colors.action};
  color: #fff;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  &:hover { opacity: 0.9; }
`

/** Quem ainda está no perfil de cidadão vê esta tela em vez do Estúdio. */
function StudioGate() {
  const { user, sessionReady } = useAuthStore()
  const { data: profiles } = useMyProfiles(!!user && sessionReady)
  const { mutate: switchContext, isPending, isError } = useSwitchContext()
  const [showModal, setShowModal] = useState(false)
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false)
  const orgs = profiles?.orgs ?? []

  function handleSelect(contextType: string, contextId?: string, mfaCode?: string) {
    setMfaSetupRequired(false)
    switchContext(
      { contextType, contextId, mfaCode },
      {
        onSuccess: (data) => {
          if ('requiresMfaSetup' in data) { setMfaSetupRequired(true); return }
          if ('requiresMfa' in data) return
          setShowModal(false)
        },
      },
    )
  }

  return (
    <Page>
      <Navbar />
      <Gate>
        <GateCard>
          <h1>Estúdio</h1>
          {orgs.length > 0 ? (
            <>
              <p>
                O Estúdio é onde você cuida da página de {orgs.length === 1 ? <strong>{orgs[0].name}</strong> : 'quem você gerencia'}.
                Para entrar, troque do seu perfil de cidadão para o perfil da organização.
              </p>
              <GateBtn type="button" onClick={() => setShowModal(true)}>
                Escolher perfil e entrar
              </GateBtn>
            </>
          ) : (
            <>
              <p>
                Você ainda não gerencia nenhuma página de político, entidade ou empresa.
                Quando tiver acesso, ela aparece aqui.
              </p>
              <Link to="/solicitar-cadastro" style={{ fontWeight: 600 }}>Registrar uma organização →</Link>
            </>
          )}
        </GateCard>
      </Gate>

      {showModal && profiles && (
        <ProfileSelectModal
          profiles={profiles}
          loading={isPending}
          error={isError}
          mfaSetupRequired={mfaSetupRequired}
          onSelect={handleSelect}
          onClose={() => setShowModal(false)}
        />
      )}
    </Page>
  )
}

/** Casca do Estúdio: menu lateral por tipo de perfil + a tela da vez. */
/** Casca com conteúdo à escolha (usada pelas rotas que mantêm o endereço antigo). */
export function StudioShell({ children }: { children: ReactNode }) {
  const { user, activeContext, sessionReady } = useAuthStore()
  const navigate = useNavigate()
  const { mutate: switchContext, isPending } = useSwitchContext({ returnTo: '/' })

  if (!sessionReady) {
    return (
      <Page>
        <Navbar />
      </Page>
    )
  }
  if (!user) return <Navigate to="/entrar" replace />
  if (!activeContext) return <StudioGate />

  const Kind = ORG_TYPE_ICON[activeContext.type]
  const groups = studioNav(activeContext.type, activeContext.id)

  function leave() {
    switchContext(
      { contextType: 'personal' },
      { onSuccess: () => navigate('/') },
    )
  }

  return (
    <Page>
      <Navbar />
      <Shell>
        <Sidebar>
          <OrgCard>
            <OrgTop>
              <OrgAvatar $src={activeContext.logoUrl}>
                {!activeContext.logoUrl && activeContext.name.charAt(0).toUpperCase()}
              </OrgAvatar>
              <div style={{ minWidth: 0 }}>
                <OrgName>{activeContext.name}</OrgName>
                <OrgKind>
                  <Kind size={13} aria-hidden="true" /> {ORG_TYPE_LABEL[activeContext.type]}
                </OrgKind>
              </div>
            </OrgTop>
            <ExitBtn type="button" onClick={leave} disabled={isPending}>
              <ArrowLeft size={14} weight="bold" aria-hidden="true" />
              {isPending ? 'Saindo…' : 'Voltar ao perfil de cidadão'}
            </ExitBtn>
          </OrgCard>

          <NavBox aria-label="Menu do Estúdio">
            {groups.map((group) => (
              <Group key={group.title}>
                {group.title && <GroupTitle>{group.title}</GroupTitle>}
                {group.items.map((item) => {
                  const ItemIcon = item.icon
                  return (
                    <Item key={item.to} to={item.to} end={item.end} title={item.hint}>
                      <ItemIcon size={16} aria-hidden="true" />
                      {item.label}
                    </Item>
                  )
                })}
              </Group>
            ))}
          </NavBox>
        </Sidebar>

        <Main>
          <StudioEmbedContext.Provider value={true}>
            {children}
          </StudioEmbedContext.Provider>
        </Main>
      </Shell>
    </Page>
  )
}

/** Casca do Estúdio para as rotas aninhadas (`/estudio/...`, Mandato, Painel de dados). */
export function StudioLayout() {
  return (
    <StudioShell>
      <Outlet />
    </StudioShell>
  )
}

/**
 * Para telas que também servem ao cidadão (Mensagens): dentro do Estúdio quando a pessoa
 * está no perfil de uma organização; do jeito de sempre quando está no perfil de cidadão.
 */
export function StudioIfOrg({ children }: { children: ReactNode }) {
  const activeContext = useAuthStore((s) => s.activeContext)
  return activeContext ? <StudioShell>{children}</StudioShell> : <>{children}</>
}
