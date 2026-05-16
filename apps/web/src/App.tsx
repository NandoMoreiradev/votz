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
import { Home } from './pages/Home'
import { ReportDetail } from './pages/ReportDetail'
import { CreateReport } from './pages/CreateReport'
import { Login } from './pages/Login'
import { Register } from './pages/Register'

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

    // Restaura sessão do cookie httpOnly — sem tocar em localStorage
    axios
      .post<{ accessToken: string }>('/api/v1/auth/refresh', {}, { withCredentials: true })
      .then(({ data }) => {
        setToken(data.accessToken)
        return api.get('/auth/me')
      })
      .then(({ data: user }) => {
        const token = getToken()
        if (token) setAuth(user, token)
      })
      .catch(() => {
        // Sem sessão válida, usuário precisa fazer login
      })

    return () => window.removeEventListener('votz:logout', handleForceLogout)
  }, [])

  return null
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <GlobalStyle />
        <BrowserRouter>
          <AuthInit />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/relatos/:id" element={<ReportDetail />} />
            <Route path="/novo" element={<CreateReport />} />
            <Route path="/entrar" element={<Login />} />
            <Route path="/cadastro" element={<Register />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}

export default App
