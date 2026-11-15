import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, refreshSession } from '../lib/api'
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
    let active = true

    if (window.location.search) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    refreshSession()
      .then(async (token) => {
        const { data: user } = await api.get('/auth/me')
        if (!active) return
        setAuth(user, token)
        const { data: p } = await api.get<MyProfilesResponse>('/auth/my-profiles')
        if (!active) return
        if (p.orgs.length === 0) {
          navigate('/', { replace: true })
        } else {
          setProfiles(p)
        }
      })
      .catch(() => {
        if (active) navigate('/entrar', { replace: true })
      })

    return () => {
      active = false
    }
  }, [navigate, setAuth])

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
