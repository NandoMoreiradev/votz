import { ThemeProvider } from 'styled-components'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { theme } from './theme'
import { GlobalStyle } from './theme/GlobalStyle'
import { queryClient } from './lib/query-client'
import { Home } from './pages/Home'
import { ReportDetail } from './pages/ReportDetail'
import { CreateReport } from './pages/CreateReport'
import { Login } from './pages/Login'
import { Register } from './pages/Register'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <GlobalStyle />
        <BrowserRouter>
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
