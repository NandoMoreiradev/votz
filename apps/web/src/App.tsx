import { Suspense, useEffect, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { lazyPage } from './lib/lazy-page'
import { AppThemeProvider } from './theme/ThemeContext'
import { GlobalStyle } from './theme/GlobalStyle'
import { queryClient } from './lib/query-client'
import { api, refreshSession } from './lib/api'
import { getToken } from './lib/token'
import { useAuthStore } from './store/auth.store'
import { Home } from './pages/Home'
import { ReportDetail } from './pages/ReportDetail'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { UserProfile } from './pages/UserProfile'
import { EntityProfile } from './pages/EntityProfile'
import { PoliticianProfile } from './pages/PoliticianProfile'
import { EntitiesList } from './pages/EntitiesList'
import { Search } from './pages/Search'
import { PoliticiansList } from './pages/PoliticiansList'
import { GoogleCallback } from './pages/GoogleCallback'
import { CompanyProfile } from './pages/CompanyProfile'
import { SurtoDetail } from './pages/SurtoDetail'
import { PropostasList } from './pages/PropostasList'
import { PropostaDetail } from './pages/PropostaDetail'
import { StudioLayout, StudioIfOrg } from './pages/studio/StudioLayout'
import DebatesList from './pages/DebatesList'
import { PostDetail } from './pages/PostDetail'
import { PautaDetail } from './pages/PautaDetail'
import { ConsentGate } from './components/legal/ConsentGate'
import { Footer } from './components/layout/Footer'
import { OrgReauthGate } from './components/ui/OrgReauthGate'
import { DeviceLinkPrompt } from './components/conversations/DeviceLinkPrompt'
import { useSocket } from './hooks/useSocket'
import { MediaViewerProvider } from './components/ui/MediaViewer'
import { NavigationProgress } from './components/layout/NavigationProgress'
import { ScrollManager } from './components/layout/ScrollManager'
import { RoutePrefetch } from './components/layout/RoutePrefetch'
import { PageErrorBoundary, PageFallback } from './components/layout/PageFallback'

// Telas sob demanda: o código só baixa quando alguém vai abrir (ver lib/lazy-page.ts).
// As de uso diário (feed, relato, perfis, listas, entrar) continuam no pacote principal.
const CreateReport = lazyPage(() => import('./pages/CreateReport'), 'CreateReport', ['/novo'])
const VerifyEmail = lazyPage(() => import('./pages/VerifyEmail'), 'VerifyEmail', ['/verificar-email'])
const MyProfile = lazyPage(() => import('./pages/MyProfile'), 'MyProfile', ['/meu-perfil'])
const MapView = lazyPage(() => import('./pages/MapView'), 'MapView', ['/mapa'])
const Admin = lazyPage(() => import('./pages/Admin'), 'Admin', ['/admin'])
const Superadmin = lazyPage(() => import('./pages/Superadmin'), 'Superadmin', ['/superadmin'])
const RequestRegistration = lazyPage(() => import('./pages/RequestRegistration'), 'RequestRegistration', ['/solicitar-cadastro'])
const PoliticianEdit = lazyPage(() => import('./pages/PoliticianEdit'), 'PoliticianEdit', ['/politico/:id/editar'])
const ClaimProfile = lazyPage(() => import('./pages/ClaimProfile'), 'ClaimProfile', ['/reivindicar/:type/:id'])
const EntityEdit = lazyPage(() => import('./pages/EntityEdit'), 'EntityEdit', ['/entidade/:id/editar'])
const CompanyEdit = lazyPage(() => import('./pages/CompanyEdit'), 'CompanyEdit', ['/empresa/:id/editar'])
const MyRequests = lazyPage(() => import('./pages/MyRequests'), 'MyRequests', ['/minhas-solicitacoes'])
const AcceptInvite = lazyPage(() => import('./pages/AcceptInvite'), 'AcceptInvite', ['/convite/:token'])
const Imprensa = lazyPage(() => import('./pages/Imprensa'), 'Imprensa', ['/imprensa'])
const PressEmailConfirm = lazyPage(() => import('./pages/PressEmailConfirm'), 'PressEmailConfirm', ['/imprensa/confirmar-email'])
const PressContactInbox = lazyPage(() => import('./pages/PressContactInbox'), 'PressContactInbox', ['/pedidos-da-imprensa'])
const CreateProposta = lazyPage(() => import('./pages/CreateProposta'), 'CreateProposta', ['/proposta/nova'])
const Planos = lazyPage(() => import('./pages/Planos'), 'Planos', ['/planos', '/estudio/planos'])
const PagamentoSucesso = lazyPage(() => import('./pages/PagamentoSucesso'), 'PagamentoSucesso', ['/pagamento/sucesso'])
const PainelDados = lazyPage(() => import('./pages/PainelDados'), 'PainelDados', ['/painel-dados'])
const EntidadePrazos = lazyPage(() => import('./pages/EntidadePrazos'), 'EntidadePrazos', ['/entidade/prazos'])
const EntitySurveys = lazyPage(() => import('./pages/EntitySurveys'), 'EntitySurveys', ['/entidade/consultas'])
const MandatoPortal = lazyPage(() => import('./pages/MandatoPortal'), 'MandatoPortal', ['/mandato', '/mandato/:aba'])
const StudioTeam = lazyPage(() => import('./pages/studio/StudioTeam'), 'StudioTeam', ['/estudio/equipe'])
const StudioOverview = lazyPage(() => import('./pages/studio/StudioOverview'), 'StudioOverview', ['/estudio'])
const StudioAds = lazyPage(() => import('./pages/studio/StudioAds'), 'StudioAds', ['/estudio/anuncios'])
const StudioAdsNew = lazyPage(() => import('./pages/studio/StudioAdsNew'), 'StudioAdsNew', ['/estudio/anuncios/nova'])
const StudioBilling = lazyPage(() => import('./pages/studio/StudioBilling'), 'StudioBilling', ['/estudio/anuncios/faturamento'])
const StudioAdsReport = lazyPage(() => import('./pages/studio/StudioAdsReport'), 'StudioAdsReport', ['/estudio/anuncios/relatorio'])
const StudioAdsConversions = lazyPage(() => import('./pages/studio/StudioAdsConversions'), 'StudioAdsConversions', ['/estudio/anuncios/conversoes'])
const PrestacaoPublica = lazyPage(() => import('./pages/PrestacaoPublica'), 'PrestacaoPublica', ['/prestacao/:code'])
const AdLibrary = lazyPage(() => import('./pages/AdLibrary'), 'AdLibrary', ['/anuncios/biblioteca'])
const MandatoPublico = lazyPage(() => import('./pages/MandatoPublico'), 'MandatoPublico', ['/p/:slug/mandato'])
const DescadastroResumo = lazyPage(() => import('./pages/DescadastroResumo'), 'DescadastroResumo', ['/descadastro-resumo'])
const DebateWatch = lazyPage(() => import('./pages/DebateWatch'), 'default', ['/debates/:id'])
const Termos = lazyPage(() => import('./pages/Termos'), 'Termos', ['/termos'])
const Privacidade = lazyPage(() => import('./pages/Privacidade'), 'Privacidade', ['/privacidade'])
const Cookies = lazyPage(() => import('./pages/Cookies'), 'Cookies', ['/cookies'])
const Diretrizes = lazyPage(() => import('./pages/Diretrizes'), 'Diretrizes', ['/diretrizes'])
const Sobre = lazyPage(() => import('./pages/Sobre'), 'Sobre', ['/sobre'])
const Sugestoes = lazyPage(() => import('./pages/Sugestoes'), 'Sugestoes', ['/sugestoes'])
const ContextoDaComunidade = lazyPage(() => import('./pages/ContextoDaComunidade'), 'ContextoDaComunidade', ['/contexto'])
const PesquisasList = lazyPage(() => import('./pages/PesquisasList'), 'PesquisasList', ['/pesquisas'])
const PesquisaDetail = lazyPage(() => import('./pages/PesquisaDetail'), 'PesquisaDetail', ['/pesquisas/:slug'])
const InstituteProfile = lazyPage(() => import('./pages/InstituteProfile'), 'InstituteProfile', ['/pesquisas/institutos/:slug'])
const Conversations = lazyPage(() => import('./pages/Conversations'), 'Conversations', ['/conversas/*'])

function ConversationsRoute() {
  return (
    <StudioIfOrg>
      <Conversations />
    </StudioIfOrg>
  )
}

/** Erro numa tela não derruba o site inteiro; trocar de tela limpa o erro. */
function RouteErrorBoundary({ children }: { children: ReactNode }) {
  return <PageErrorBoundary resetKey={useLocation().pathname}>{children}</PageErrorBoundary>
}

/** Telas de trabalho (Conversas, Estúdio) e detalhe de publicação ocupam a tela inteira, sem o rodapé institucional. */
const NO_FOOTER_PREFIXES = ['/conversas', '/estudio', '/mandato', '/painel-dados', '/entidade/prazos', '/proposta/nova', '/publicacoes/']

function RouteFooter() {
  const path = useLocation().pathname
  return NO_FOOTER_PREFIXES.some((prefix) => path.startsWith(prefix)) ? null : <Footer />
}

function AuthInit() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const logout = useAuthStore((s) => s.logout)

  useEffect(() => {
    const handleForceLogout = () => {
      logout()
      navigate('/entrar', { replace: true })
    }
    window.addEventListener('votz:logout', handleForceLogout)

    refreshSession()
      .then(() => api.get('/auth/me'))
      .then(({ data: user }) => {
        const token = getToken()
        if (!token) return
        setAuth(user, token)
      })
      .catch(() => {
        logout()
      })

    return () => window.removeEventListener('votz:logout', handleForceLogout)
  }, [])

  useSocket()
  return null
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <GlobalStyle />
        <MediaViewerProvider>
          <BrowserRouter future={{ v7_startTransition: true }}>
            <NavigationProgress />
            <ScrollManager />
            <RoutePrefetch />
            <AuthInit />
            <OrgReauthGate />
            <DeviceLinkPrompt />
            <RouteErrorBoundary>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/publicacoes/:id" element={<PostDetail />} />
                  <Route path="/mensagens" element={<Navigate to="/conversas" replace />} />
                  <Route path="/conversas/*" element={<ConversationsRoute />} />
                  <Route path="/pautas/:slug" element={<PautaDetail />} />
                  <Route path="/relatos/:id" element={<ReportDetail />} />
                  <Route path="/novo" element={<CreateReport />} />
                  <Route path="/entrar" element={<Login />} />
                  <Route path="/cadastro" element={<Register />} />
                  <Route path="/verificar-email" element={<VerifyEmail />} />
                  <Route path="/perfil/:id" element={<UserProfile />} />
                  <Route path="/meu-perfil" element={<MyProfile />} />
                  <Route path="/entidade/:id" element={<EntityProfile />} />
                  <Route path="/politico/:id" element={<PoliticianProfile />} />
                  <Route path="/politico/:id/editar" element={<StudioIfOrg><PoliticianEdit /></StudioIfOrg>} />
                  <Route path="/reivindicar/:type/:id" element={<ClaimProfile />} />
                  <Route path="/entidade/:id/editar" element={<StudioIfOrg><EntityEdit /></StudioIfOrg>} />
                  <Route path="/mapa" element={<MapView />} />
                  <Route path="/buscar" element={<Search />} />
                  <Route path="/entidades" element={<EntitiesList />} />
                  <Route path="/politicos" element={<PoliticiansList />} />
                  <Route path="/auth/google/callback" element={<GoogleCallback />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/superadmin" element={<Superadmin />} />
                  <Route path="/solicitar-cadastro" element={<RequestRegistration />} />
                  <Route path="/minhas-solicitacoes" element={<MyRequests />} />
                  <Route path="/convite/:token" element={<AcceptInvite />} />
                  <Route path="/empresa/:id" element={<CompanyProfile />} />
                  <Route path="/empresa/:id/editar" element={<StudioIfOrg><CompanyEdit /></StudioIfOrg>} />
                  <Route path="/surtos/:id" element={<SurtoDetail />} />
                  <Route path="/imprensa" element={<Imprensa />} />
                  <Route path="/imprensa/confirmar-email" element={<PressEmailConfirm />} />
                  <Route path="/pedidos-da-imprensa" element={<PressContactInbox />} />
                  <Route path="/propostas" element={<PropostasList />} />
                  <Route path="/propostas/:id" element={<PropostaDetail />} />
                  <Route path="/planos" element={<Planos />} />
                  <Route path="/pagamento/sucesso" element={<PagamentoSucesso />} />
                  <Route element={<StudioLayout />}>
                    <Route path="/estudio" element={<StudioOverview />} />
                    <Route path="/estudio/propostas" element={<PropostasList />} />
                    <Route path="/estudio/debates" element={<DebatesList />} />
                    <Route path="/estudio/planos" element={<Planos />} />
                    <Route path="/estudio/equipe" element={<StudioTeam />} />
                    <Route path="/estudio/anuncios" element={<StudioAds />} />
                    <Route path="/estudio/anuncios/nova" element={<StudioAdsNew />} />
                    <Route path="/estudio/anuncios/faturamento" element={<StudioBilling />} />
                    <Route path="/estudio/anuncios/relatorio" element={<StudioAdsReport />} />
                    <Route path="/estudio/anuncios/conversoes" element={<StudioAdsConversions />} />
                    <Route path="/proposta/nova" element={<CreateProposta />} />
                    <Route path="/painel-dados" element={<PainelDados />} />
                    <Route path="/entidade/prazos" element={<EntidadePrazos />} />
                    <Route path="/entidade/consultas" element={<EntitySurveys />} />
                    <Route path="/mandato" element={<MandatoPortal />} />
                    <Route path="/mandato/alertas" element={<MandatoPortal />} />
                    <Route path="/mandato/modelos" element={<MandatoPortal />} />
                    <Route path="/mandato/prestacao" element={<MandatoPortal />} />
                    <Route path="/mandato/cartoes" element={<MandatoPortal />} />
                    <Route path="/mandato/webhooks" element={<MandatoPortal />} />
                    <Route path="/mandato/resumo" element={<MandatoPortal />} />
                  </Route>
                  <Route path="/anuncios/biblioteca" element={<AdLibrary />} />
                  <Route path="/prestacao/:code" element={<PrestacaoPublica />} />
                  <Route path="/p/:slug/mandato" element={<MandatoPublico />} />
                  <Route path="/descadastro-resumo" element={<DescadastroResumo />} />
                  <Route path="/debates" element={<DebatesList />} />
                  <Route path="/debates/:id" element={<DebateWatch />} />
                  <Route path="/termos" element={<Termos />} />
                  <Route path="/privacidade" element={<Privacidade />} />
                  <Route path="/cookies" element={<Cookies />} />
                  <Route path="/diretrizes" element={<Diretrizes />} />
                  <Route path="/sobre" element={<Sobre />} />
                  <Route path="/sugestoes" element={<Sugestoes />} />
                  <Route path="/contexto" element={<ContextoDaComunidade />} />
                  <Route path="/pesquisas" element={<PesquisasList />} />
                  <Route path="/pesquisas/institutos/:slug" element={<InstituteProfile />} />
                  <Route path="/pesquisas/:slug" element={<PesquisaDetail />} />
                </Routes>
              </Suspense>
            </RouteErrorBoundary>
            <ConsentGate />
            <RouteFooter />
          </BrowserRouter>
        </MediaViewerProvider>
      </AppThemeProvider>
      {import.meta.env.DEV && import.meta.env.VITE_QUERY_DEVTOOLS === 'true' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}

export default App
