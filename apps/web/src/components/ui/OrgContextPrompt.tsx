import { useState } from 'react'
import styled from 'styled-components'
import { Button } from './Button'
import { ProfileSelectModal } from './ProfileSelectModal'
import { useAuthStore } from '../../store/auth.store'
import { useMyProfiles, useSwitchContext } from '../../hooks/useAuth'

const NoticeBox = styled.div`
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surfaceHover};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`

const NoticeText = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.45;
`

interface OrgContextPromptProps {
  orgName: string
  actionLabel?: string
}

export function OrgContextPrompt({ orgName, actionLabel = 'responder' }: OrgContextPromptProps) {
  const { user, sessionReady } = useAuthStore()
  const { data: profiles } = useMyProfiles(!!user && sessionReady)
  const { mutate: switchContext, isPending, isError } = useSwitchContext()
  const [showModal, setShowModal] = useState(false)
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false)

  function handleSelect(contextType: string, contextId?: string, mfaCode?: string) {
    setMfaSetupRequired(false)
    switchContext(
      { contextType, contextId, mfaCode },
      {
        onSuccess: (data) => {
          if ('requiresMfaSetup' in data) {
            setMfaSetupRequired(true)
            return
          }
          if ('requiresMfa' in data) return
          setShowModal(false)
        },
      },
    )
  }

  return (
    <>
      <NoticeBox>
        <NoticeText>
          Para {actionLabel} como <strong>{orgName}</strong>, troque de perfil.
        </NoticeText>
        <Button type="button" size="sm" variant="outline" onClick={() => setShowModal(true)}>
          Trocar perfil
        </Button>
      </NoticeBox>

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
    </>
  )
}
