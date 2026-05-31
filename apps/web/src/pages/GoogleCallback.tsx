import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { setToken } from '../lib/token'
import { useAuthStore } from '../store/auth.store'
import { useSwitchContext } from '../hooks/useAuth'
import { ProfileSelectModal } from '../components/ui/ProfileSelectModal'
import { MyProfilesResponse } from '../types/api'

export function GoogleCallback() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [profiles, setProfiles] = useState<MyProfilesResponse | null>(null)
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false)
  const { mutate: switchContext, isPending: switching, isError: switchError } = useSwitchContext()

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

  function handleProfileSelect(contextType: string, contextId?: string, mfaCode?: string) {
    setMfaSetupRequired(false)
    switchContext({ contextType, contextId, mfaCode }, {
      onSuccess: (data) => {
        if ('requiresMfaSetup' in data) { setMfaSetupRequired(true); return }
        if ('requiresMfa' in data) return
        navigate('/', { replace: true })
      },
      onError: () => navigate('/', { replace: true }),
    })
  }

  if (profiles) {
    return (
      <div style={{ minHeight: '100vh', background: '#F4F4F4' }}>
        <ProfileSelectModal
          profiles={profiles}
          loading={switching}
          error={switchError}
          mfaSetupRequired={mfaSetupRequired}
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
