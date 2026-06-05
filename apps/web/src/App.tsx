import { useEffect } from 'react'
import axios from 'axios'
import { ThemeProvider } from 'styled-components'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { theme } from './theme'
import { GlobalStyle } from './theme/GlobalStyle'
import { queryClient } from './lib/query-client'
import { api } from './lib/api'
import { setToken, getToken } from './lib/token'
import { useAuthStore } from './store/auth.store'
import { SwitchContextResponse } from './types/api'
import { Home } from './pages/Home'
import { ReportDetail } from './pages/ReportDetail'
import { CreateReport } from './pages/CreateReport'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { VerifyEmail } from './pages/VerifyEmail'
import { UserProfile } from './pages/UserProfile'
import { MyProfile } from './pages/MyProfile'
import { EntityProfile } from './pages/EntityProfile'
import { PoliticianProfile } from './pages/PoliticianProfile'
import { MapView } from './pages/MapView'
import { EntitiesList } from './pages/EntitiesList'
import { PoliticiansList } from './pages/PoliticiansList'
import { GoogleCallback } from './pages/GoogleCallback'
import { Admin } from './pages/Admin'
import { RequestRegistration } from './pages/RequestRegistration'
import { PoliticianEdit } from './pages/PoliticianEdit'
import { ClaimProfile } from './pages/ClaimProfile'
import { EntityEdit } from './pages/EntityEdit'
import { MyRequests } from './pages/MyRequests'
import { AcceptInvite } from './pages/AcceptInvite'
import { CompanyProfile } from './pages/CompanyProfile'
import { SurtoDetail } from './pages/SurtoDetail'
import { Imprensa } from './pages/Imprensa'
import { PropostasList } from './pages/PropostasList'
import { PropostaDetail } from './pages/PropostaDetail'
import { CreateProposta } from './pages/CreateProposta'
import { Planos } from './pages/Planos'
import { PagamentoSucesso } from './pages/PagamentoSucesso'
import DebatesList from './pages/DebatesList'
import DebateWatch from './pages/DebateWatch'
import { Footer } from './components/layout/Footer'
import { useSocket } from './hooks/useSocket'
import { MediaViewerProvider } from './components/ui/MediaViewer'

function AuthInit() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const applyContext = useAuthStore((s) => s.applyContext)
  const logout = useAuthStore((s) => s.logout)

  useEffect(() => {
    const handleForceLogout = () => {
      logout()
      navigate('/entrar', { replace: true })
    }
    window.addEventListener('votz:logout', handleForceLogout)

    // Lê o contexto salvo ANTES de qualquer operação assíncrona ou setAuth,
    // usando getState() para garantir o valor hidratado do localStorage
    const savedContext = useAuthStore.getState().activeContext

    const apiBase = import.meta.env.VITE_API_URL ?? '/api/v1'
    axios
      .post<{ accessToken: string }>(`${apiBase}/auth/refresh`, {}, { withCredentials: true })
      .then(({ data }) => {
        setToken(data.accessToken)
        return api.get('/auth/me')
      })
      .then(({ data: user }) => {
        const token = getToken()
        if (!token) return
        setAuth(user, token)

        if (savedContext) {
          api
            .post<SwitchContextResponse>('/auth/switch-context', {
              contextType: savedContext.type.toLowerCase(),
              contextId: savedContext.id,
            })
            .then(({ data: res }) => {
              if ('accessToken' in res) applyContext(res.accessToken, res.ctx)
              else applyContext(token, null)
            })
            .catch(() => applyContext(token, null))
        }
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
      <ThemeProvider theme={theme}>
        <GlobalStyle />
        <MediaViewerProvider>
          <BrowserRouter>
            <AuthInit />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/relatos/:id" element={<ReportDetail />} />
              <Route path="/novo" element={<CreateReport />} />
              <Route path="/entrar" element={<Login />} />
              <Route path="/cadastro" element={<Register />} />
              <Route path="/verificar-email" element={<VerifyEmail />} />
              <Route path="/perfil/:id" element={<UserProfile />} />
              <Route path="/meu-perfil" element={<MyProfile />} />
              <Route path="/entidade/:id" element={<EntityProfile />} />
              <Route path="/politico/:id" element={<PoliticianProfile />} />
              <Route path="/politico/:id/editar" element={<PoliticianEdit />} />
              <Route path="/reivindicar/:type/:id" element={<ClaimProfile />} />
              <Route path="/entidade/:id/editar" element={<EntityEdit />} />
              <Route path="/mapa" element={<MapView />} />
              <Route path="/entidades" element={<EntitiesList />} />
              <Route path="/politicos" element={<PoliticiansList />} />
              <Route path="/auth/google/callback" element={<GoogleCallback />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/solicitar-cadastro" element={<RequestRegistration />} />
              <Route path="/minhas-solicitacoes" element={<MyRequests />} />
              <Route path="/convite/:token" element={<AcceptInvite />} />
              <Route path="/empresa/:id" element={<CompanyProfile />} />
              <Route path="/surtos/:id" element={<SurtoDetail />} />
              <Route path="/imprensa" element={<Imprensa />} />
              <Route path="/propostas" element={<PropostasList />} />
              <Route path="/propostas/:id" element={<PropostaDetail />} />
              <Route path="/proposta/nova" element={<CreateProposta />} />
              <Route path="/planos" element={<Planos />} />
              <Route path="/pagamento/sucesso" element={<PagamentoSucesso />} />
              <Route path="/debates" element={<DebatesList />} />
              <Route path="/debates/:id" element={<DebateWatch />} />
            </Routes>
            <Footer />
          </BrowserRouter>
        </MediaViewerProvider>
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}

export default App
