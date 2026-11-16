import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PRIVACY_VERSION, TERMS_VERSION } from '@votz/shared-types'
import {
  AUTH_OR_PUBLIC_LEGAL_ROUTES,
  clearLastOrgContext,
  readLastOrgContext,
  sanitizeReturnTo,
  updateLastOrgContextReturnTo,
} from '../../lib/org-context-storage'
import { useAuthStore } from '../../store/auth.store'
import { useMyProfiles, useSwitchContext } from '../../hooks/useAuth'
import { OrgReauthModal } from './OrgReauthModal'

export function OrgReauthGate() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const activeContext = useAuthStore((s) => s.activeContext)
  const sessionReady = useAuthStore((s) => s.sessionReady)

  const [dismissed, setDismissed] = useState(false)
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false)

  const savedHint = sessionReady && user && !activeContext ? readLastOrgContext() : null
  const isBlockedRoute = AUTH_OR_PUBLIC_LEGAL_ROUTES.has(location.pathname)
  const needsConsent = Boolean(
    user &&
      (user.termsVersion !== TERMS_VERSION ||
        user.privacyVersion !== PRIVACY_VERSION ||
        !user.ageConfirmedAt),
  )
  const sameUser = Boolean(savedHint && user && savedHint.userId === user.id)

  useEffect(() => {
    if (activeContext) setDismissed(false)
  }, [activeContext])

  useEffect(() => {
    if (savedHint && user && savedHint.userId !== user.id) {
      clearLastOrgContext()
    }
  }, [savedHint, user])

  useEffect(() => {
    if (activeContext && !isBlockedRoute) {
      updateLastOrgContextReturnTo(`${location.pathname}${location.search}${location.hash}`)
    }
  }, [activeContext, isBlockedRoute, location.pathname, location.search, location.hash])

  const shouldCheckProfiles = Boolean(
    sessionReady &&
      user &&
      !needsConsent &&
      !activeContext &&
      !isBlockedRoute &&
      sameUser &&
      !dismissed,
  )

  const { data: profiles, isError: profilesError } = useMyProfiles(shouldCheckProfiles)
  const { mutate: switchContext, isPending, isError } = useSwitchContext({
    returnTo: savedHint?.returnTo,
  })

  useEffect(() => {
    if (!shouldCheckProfiles) return
    if (profilesError) {
      clearLastOrgContext()
      return
    }
    if (profiles && savedHint) {
      const found = profiles.orgs.some(
        (o) => o.type.toLowerCase() === savedHint.type && o.id === savedHint.id,
      )
      if (!found) {
        clearLastOrgContext()
      }
    }
  }, [shouldCheckProfiles, profiles, profilesError, savedHint])

  if (!shouldCheckProfiles || !profiles || !savedHint) return null

  const matchedOrg = profiles.orgs.find(
    (o) => o.type.toLowerCase() === savedHint.type && o.id === savedHint.id,
  )
  if (!matchedOrg) return null

  function handleCancel() {
    clearLastOrgContext()
    setMfaSetupRequired(false)
    setDismissed(true)
  }

  function handleConfirm(mfaCode: string) {
    if (!savedHint) return
    setMfaSetupRequired(false)
    const targetRoute = sanitizeReturnTo(savedHint.returnTo)
    switchContext(
      { contextType: savedHint.type, contextId: savedHint.id, mfaCode },
      {
        onSuccess: (res) => {
          if ('requiresMfaSetup' in res) {
            setMfaSetupRequired(true)
            return
          }
          if ('requiresMfa' in res) return
          const currentRoute = `${location.pathname}${location.search}${location.hash}`
          if (currentRoute !== targetRoute) {
            navigate(targetRoute, { replace: true })
          }
        },
      },
    )
  }

  return (
    <OrgReauthModal
      org={matchedOrg}
      loading={isPending}
      error={isError}
      mfaSetupRequired={mfaSetupRequired}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  )
}
