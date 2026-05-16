import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { setToken } from '../lib/token'
import { useAuthStore } from '../store/auth.store'

export function GoogleCallback() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')

    if (!token) {
      navigate('/entrar', { replace: true })
      return
    }

    setToken(token)
    api.get('/auth/me').then(({ data: user }) => {
      setAuth(user, token)
      navigate('/', { replace: true })
    }).catch(() => {
      navigate('/entrar', { replace: true })
    })
  }, [])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: 'Inter, sans-serif', color: '#6B7280',
    }}>
      Autenticando com Google...
    </div>
  )
}
