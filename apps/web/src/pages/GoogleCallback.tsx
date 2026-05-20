import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { setToken } from '../lib/token'
import { useAuthStore } from '../store/auth.store'
import { ProfileSelectModal } from '../components/ui/ProfileSelectModal'
import { MyProfilesResponse, SwitchContextResponse } from '../types/api'

export function GoogleCallback() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const applyContext = useAuthStore((s) => s.applyContext)
  const [profiles, setProfiles] = useState<MyProfilesResponse | null>(null)
  const [switching, setSwitching] = useState(false)

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
      return api.get<MyProfilesResponse>('/auth/my-profiles')
    }).then(({ data: p }) => {
      if (p.orgs.length === 0) {
        navigate('/', { replace: true })
      } else {
        setProfiles(p)
      }
    }).catch(() => {
      navigate('/entrar', { replace: true })
    })
  }, [])

  function handleProfileSelect(contextType: string, contextId?: string) {
    setSwitching(true)
    api.post<SwitchContextResponse>('/auth/switch-context', { contextType, contextId })
      .then(({ data }) => {
        applyContext(data.accessToken, data.ctx)
        navigate('/', { replace: true })
      })
      .catch(() => {
        navigate('/', { replace: true })
      })
      .finally(() => setSwitching(false))
  }

  if (profiles) {
    return (
      <div style={{ minHeight: '100vh', background: '#F4F4F4' }}>
        <ProfileSelectModal
          profiles={profiles}
          loading={switching}
          onSelect={handleProfileSelect}
        />
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: 'Inter, sans-serif', color: '#6B7280',
    }}>
      Autenticando com Google...
    </div>
  )
}
