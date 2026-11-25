import { Suspense, useEffect, useState, type ReactNode } from 'react'
import styled, { css } from 'styled-components'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ArrowLeft, CaretDoubleLeft, CaretDoubleRight, CaretUpDown, List, UserCircle, Wallet, X } from '@phosphor-icons/react'
import { Navbar } from '../../components/layout/Navbar'
import { ContentFallback } from '../../components/layout/PageFallback'
import { StudioEmbedContext } from '../../components/layout/StudioEmbed'
import { ProfileSelectModal } from '../../components/ui/ProfileSelectModal'
import { useAuthStore } from '../../store/auth.store'
import { useMyProfiles, useSwitchContext } from '../../hooks/useAuth'
import { formatBRL, useAdAccounts } from '../../hooks/useAds'
import type { ActiveContext } from '../../types/api'
import { ORG_TYPE_ICON, ORG_TYPE_LABEL, publicProfilePath, studioNav, type StudioNavGroup } from './studio-nav'

const NAVBAR_H = 56
const SIDEBAR_W = 256
const RAIL_W = 72
const COLLAPSE_KEY = 'votz:studio:menu-recolhido'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Shell = styled.div<{ $collapsed: boolean }>`
  display: grid;
  min-height: calc(100vh - ${NAVBAR_H}px);
  grid-template-columns: ${({ $collapsed }) => ($collapsed ? RAIL_W : SIDEBAR_W)}px minmax(0, 1fr);
  align-items: start;
  transition: grid-template-columns 0.18s ease;

  @media (max-width: 960px) { grid-template-columns: minmax(0, 1fr); }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`

/** A coluna vai até o fim da página; o conteúdo do menu fica preso na tela ao rolar. */
const Sidebar = styled.aside`
  align-self: stretch;
  background: ${({ theme }) => theme.colors.white};
  border-right: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: 960px) { display: none; }
`

const SidebarSticky = styled.div`
  position: sticky;
  top: ${NAVBAR_H}px;
  height: calc(100vh - ${NAVBAR_H}px);
  display: flex;
  flex-direction: column;
`

const SidebarScroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scrollbar-width: thin;
`

const SidebarFoot = styled.div`
  padding: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  flex-direction: column;
  gap: 8px;
`

// ── Seletor do perfil (topo do menu) ──

const OrgTrigger = styled.button<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme }) => theme.colors.white};
  font: inherit;
  text-align: left;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;

  &:hover { background: ${({ theme }) => theme.colors.surfaceHover}; border-color: ${({ theme }) => theme.colors.borderStrong}; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 2px; }
  > svg { flex-shrink: 0; color: ${({ theme }) => theme.colors.muted}; margin-left: auto; }

  ${({ $collapsed }) => $collapsed && css`
    justify-content: center;
    padding: 6px;
    border-color: transparent;
    > svg, .org-text { display: none; }
  `}
`

const OrgAvatar = styled.span<{ $src: string | null; $size?: number }>`
  width: ${({ $size }) => $size ?? 36}px;
  height: ${({ $size }) => $size ?? 36}px;
  flex-shrink: 0;
  border-radius: 10px;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : theme.colors.primary)};
  color: ${({ theme }) => theme.colors.white};
  display: grid;
  place-items: center;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  font-size: 1rem;
`

const OrgName = styled.span`
  display: block;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const OrgKind = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.6875rem;
  color: ${({ theme }) => theme.colors.muted};
`

const MenuContent = styled(DropdownMenu.Content)`
  z-index: 1100;
  min-width: 232px;
  padding: 6px;
  border-radius: ${({ theme }) => theme.radii.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  box-shadow: ${({ theme }) => theme.shadows.lg};
`

const MenuItem = styled(DropdownMenu.Item)`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  outline: none;

  &[data-highlighted] { background: ${({ theme }) => theme.colors.neutral}; }
  &[data-disabled] { opacity: 0.5; cursor: default; }
  svg { color: ${({ theme }) => theme.colors.muted}; }
`

const MenuLabel = styled(DropdownMenu.Label)`
  padding: 6px 10px 8px;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
`

// ── Itens do menu ──

const GroupTitle = styled.div`
  padding: 0 10px 4px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
`

const GroupRule = styled.hr`
  margin: 0 12px 4px;
  border: none;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
`

const Item = styled(NavLink)<{ $collapsed: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 0 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
  transition: background 0.12s, color 0.12s;

  svg { flex-shrink: 0; color: ${({ theme }) => theme.colors.muted}; transition: color 0.12s; }
  &:hover { background: ${({ theme }) => theme.colors.neutral}; svg { color: ${({ theme }) => theme.colors.text}; } }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: -2px; }

  &.active {
    background: ${({ theme }) => theme.colors.primary}0F;
    color: ${({ theme }) => theme.colors.primary};
    font-weight: 700;
    svg { color: ${({ theme }) => theme.colors.action}; }
    &::before {
      content: '';
      position: absolute;
      left: -10px;
      top: 7px;
      bottom: 7px;
      width: 3px;
      border-radius: 0 3px 3px 0;
      background: ${({ theme }) => theme.colors.action};
    }
  }

  ${({ $collapsed }) => $collapsed && css`
    justify-content: center;
    padding: 0;
    .label { display: none; }
  `}
`

const BalanceCard = styled(Link)`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  transition: opacity 0.15s;

  &:hover { opacity: 0.92; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.action}; outline-offset: 2px; }
  svg { flex-shrink: 0; opacity: 0.8; }
  small { display: block; font-size: 0.6875rem; opacity: 0.72; }
  strong { display: block; font-family: ${({ theme }) => theme.fonts.mono}; font-size: 0.9375rem; }
  .add { margin-left: auto; font-size: 0.75rem; font-weight: 600; color: ${({ theme }) => theme.colors.white}; opacity: 0.9; text-decoration: underline; text-underline-offset: 2px; }
`

const CollapseBtn = styled.button<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  background: transparent;
  font: inherit;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;

  &:hover { background: ${({ theme }) => theme.colors.neutral}; color: ${({ theme }) => theme.colors.text}; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: -2px; }
`

// ── Celular: barra com o perfil e o botão do menu ──

const MobileBar = styled.div`
  display: none;
  position: sticky;
  top: ${NAVBAR_H}px;
  z-index: 20;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: ${({ theme }) => theme.colors.white};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: 960px) { display: flex; }
`

const MobileMenuBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  margin-left: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.white};
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 2px; }
`

const SheetOverlay = styled(Dialog.Overlay)`
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(13, 13, 13, 0.4);
`

const Sheet = styled(Dialog.Content)`
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 1001;
  width: min(300px, 86vw);
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colors.white};
  box-shadow: 12px 0 32px rgba(0, 0, 0, 0.16);
  &:focus { outline: none; }
`

const SheetHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;

  button {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: ${({ theme }) => theme.radii.md};
    background: transparent;
    color: ${({ theme }) => theme.colors.muted};
    cursor: pointer;
  }
`

/**
 * Área da tela da vez. As telas de gestão foram feitas para ocupar a página inteira
 * (fundo, largura máxima e espaços próprios); aqui elas encaixam no espaço do Estúdio.
 */
const Main = styled.main`
  min-width: 0;
  padding: 24px 32px 64px;

  @media (max-width: 1200px) { padding: 20px 20px 56px; }
  @media (max-width: 600px) { padding: 16px 16px 48px; }
`

const MainInner = styled.div`
  max-width: 1440px;
  margin: 0 auto;

  /* Só nas telas antigas (página inteira); as telas novas do Estúdio usam <StudioPage> e não precisam disso. */
  & > div:not([data-studio-page]),
  & > main {
    min-height: 0 !important;
    padding-bottom: 0 !important;
    background: transparent !important;
    overflow: visible !important;
    padding: 0 !important;
  }

  & > div:not([data-studio-page]) > *,
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

function readCollapsed(): boolean {
  try { return window.localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
}

function writeCollapsed(value: boolean) {
  try { window.localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0') } catch { /* sem armazenamento: só não lembra */ }
}

/** Topo do menu: quem está sendo gerenciado, com atalho para a página pública e para sair do Estúdio. */
function OrgSwitcher({ ctx, collapsed, onLeave, leaving }: { ctx: ActiveContext; collapsed: boolean; onLeave: () => void; leaving: boolean }) {
  const navigate = useNavigate()
  const Kind = ORG_TYPE_ICON[ctx.type]
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <OrgTrigger type="button" $collapsed={collapsed} aria-label={`${ctx.name}: opções do perfil`} title={collapsed ? ctx.name : undefined}>
          <OrgAvatar $src={ctx.logoUrl}>{!ctx.logoUrl && ctx.name.charAt(0).toUpperCase()}</OrgAvatar>
          <span className="org-text" style={{ minWidth: 0 }}>
            <OrgName>{ctx.name}</OrgName>
            <OrgKind><Kind size={12} aria-hidden="true" /> {ORG_TYPE_LABEL[ctx.type]}</OrgKind>
          </span>
          <CaretUpDown size={16} aria-hidden="true" />
        </OrgTrigger>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <MenuContent align="start" side={collapsed ? 'right' : 'bottom'} sideOffset={6}>
          <MenuLabel>Você está gerenciando {ctx.name}</MenuLabel>
          <MenuItem onSelect={() => navigate(publicProfilePath(ctx.type, ctx.id))}>
            <UserCircle size={17} aria-hidden="true" /> Ver página pública
          </MenuItem>
          <MenuItem disabled={leaving} onSelect={onLeave}>
            <ArrowLeft size={17} aria-hidden="true" /> {leaving ? 'Saindo…' : 'Voltar ao perfil de cidadão'}
          </MenuItem>
        </MenuContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function NavGroups({ groups, collapsed, onNavigate }: { groups: StudioNavGroup[]; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Menu do Estúdio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {groups.map((group) => (
        <Group key={group.title || 'inicio'}>
          {group.title && (collapsed ? <GroupRule aria-hidden="true" /> : <GroupTitle>{group.title}</GroupTitle>)}
          {group.items.map((item) => {
            const ItemIcon = item.icon
            return (
              <Item key={item.to} to={item.to} end={item.end} title={collapsed ? item.label : item.hint} $collapsed={collapsed} onClick={onNavigate} aria-label={collapsed ? item.label : undefined}>
                <ItemIcon size={18} aria-hidden="true" />
                <span className="label">{item.label}</span>
              </Item>
            )
          })}
        </Group>
      ))}
    </nav>
  )
}

/** Saldo de anúncios sempre à vista para empresas (como nos gerenciadores de anúncios). */
function AdsBalance({ ctx, collapsed }: { ctx: ActiveContext; collapsed: boolean }) {
  const canView = ctx.type === 'COMPANY' && (ctx.permissions.includes('MANAGE_ADS') || ctx.permissions.includes('VIEW_ADS'))
  const accounts = useAdAccounts(canView ? ctx.id : '')
  if (!canView || !accounts.data?.length) return null
  const balance = accounts.data.reduce((sum, account) => sum + account.balanceCents, 0)
  if (collapsed) {
    return (
      <BalanceCard to="/estudio/anuncios/faturamento" title={`Saldo de anúncios: ${formatBRL(balance)}`} aria-label={`Saldo de anúncios: ${formatBRL(balance)}. Abrir faturamento`} style={{ justifyContent: 'center', padding: 10 }}>
        <Wallet size={18} aria-hidden="true" />
      </BalanceCard>
    )
  }
  return (
    <BalanceCard to="/estudio/anuncios/faturamento" aria-label={`Saldo de anúncios: ${formatBRL(balance)}. Abrir faturamento`}>
      <Wallet size={20} aria-hidden="true" />
      <span>
        <small>Saldo de anúncios</small>
        <strong>{formatBRL(balance)}</strong>
      </span>
      <span className="add">Recarregar</span>
    </BalanceCard>
  )
}

/** Casca com conteúdo à escolha (usada pelas rotas que mantêm o endereço antigo). */
export function StudioShell({ children }: { children: ReactNode }) {
  const { user, activeContext, sessionReady } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const { mutate: switchContext, isPending } = useSwitchContext({ returnTo: '/' })
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Ao trocar de tela no celular, o menu fecha sozinho.
  useEffect(() => { setSheetOpen(false) }, [location.pathname])

  if (!sessionReady) {
    return (
      <Page>
        <Navbar />
      </Page>
    )
  }
  if (!user) return <Navigate to="/entrar" replace />
  if (!activeContext) return <StudioGate />

  const groups = studioNav(activeContext.type, activeContext.id)
  const current = groups.flatMap((group) => group.items)
    .filter((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)))
    .sort((a, b) => b.to.length - a.to.length)[0]

  function leave() {
    switchContext(
      { contextType: 'personal' },
      { onSuccess: () => navigate('/') },
    )
  }

  function toggleCollapsed() {
    setCollapsed((value) => { writeCollapsed(!value); return !value })
  }

  return (
    <Page>
      <Navbar />
      <MobileBar>
        <OrgAvatar $src={activeContext.logoUrl} $size={30}>{!activeContext.logoUrl && activeContext.name.charAt(0).toUpperCase()}</OrgAvatar>
        <span style={{ minWidth: 0 }}>
          <OrgName>{activeContext.name}</OrgName>
          <OrgKind>{current ? current.label : 'Estúdio'}</OrgKind>
        </span>
        <Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
          <Dialog.Trigger asChild>
            <MobileMenuBtn type="button"><List size={16} weight="bold" aria-hidden="true" /> Menu</MobileMenuBtn>
          </Dialog.Trigger>
          <Dialog.Portal>
            <SheetOverlay />
            <Sheet aria-describedby={undefined}>
              <SheetHead>
                <Dialog.Title style={{ margin: 0, fontSize: '1rem' }}>Estúdio</Dialog.Title>
                <Dialog.Close aria-label="Fechar menu"><X size={18} aria-hidden="true" /></Dialog.Close>
              </SheetHead>
              <SidebarScroll>
                <OrgSwitcher ctx={activeContext} collapsed={false} onLeave={leave} leaving={isPending} />
                <NavGroups groups={groups} collapsed={false} onNavigate={() => setSheetOpen(false)} />
              </SidebarScroll>
              <SidebarFoot><AdsBalance ctx={activeContext} collapsed={false} /></SidebarFoot>
            </Sheet>
          </Dialog.Portal>
        </Dialog.Root>
      </MobileBar>

      <Shell $collapsed={collapsed}>
        <Sidebar>
          <SidebarSticky>
            <SidebarScroll>
              <OrgSwitcher ctx={activeContext} collapsed={collapsed} onLeave={leave} leaving={isPending} />
              <NavGroups groups={groups} collapsed={collapsed} />
            </SidebarScroll>
            <SidebarFoot>
              <AdsBalance ctx={activeContext} collapsed={collapsed} />
              <CollapseBtn type="button" $collapsed={collapsed} onClick={toggleCollapsed} aria-label={collapsed ? 'Abrir o menu' : 'Recolher o menu'} title={collapsed ? 'Abrir o menu' : undefined}>
                {collapsed ? <CaretDoubleRight size={16} aria-hidden="true" /> : <><CaretDoubleLeft size={16} aria-hidden="true" /> Recolher menu</>}
              </CollapseBtn>
            </SidebarFoot>
          </SidebarSticky>
        </Sidebar>

        <Main>
          <MainInner>
            <StudioEmbedContext.Provider value={true}>
              {/* A tela da vez pode ser sob demanda: o menu lateral fica no lugar enquanto ela chega. */}
              <Suspense fallback={<ContentFallback />}>{children}</Suspense>
            </StudioEmbedContext.Provider>
          </MainInner>
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
