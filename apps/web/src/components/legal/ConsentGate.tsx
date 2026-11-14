import { useState } from 'react'
import styled from 'styled-components'
import { Link, useLocation } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { MIN_AGE, PRIVACY_VERSION, TERMS_VERSION } from '@votz/shared-types'
import { useAuthStore } from '../../store/auth.store'
import { useAcceptConsent } from '../../hooks/useAuth'
import { api } from '../../lib/api'
import { Button } from '../ui/Button'

const LEGAL_PUBLIC_PATHS = new Set(['/termos', '/privacidade', '/cookies', '/diretrizes'])

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: ${({ theme }) => theme.spacing[4]};
`

const Modal = styled.div`
  width: 100%;
  max-width: 480px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  padding: ${({ theme }) => theme.spacing[8]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing[4]};
`

const Title = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.xl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.primary};
`

const Description = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
`

const ConsentLabel = styled.label<{ $error?: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing[3]};
  padding: ${({ theme }) => theme.spacing[3]};
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1.5px solid ${({ $error, theme }) => ($error ? theme.colors.action : theme.colors.border)};
  background: ${({ theme }) => theme.colors.surfaceHover};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.5;
  cursor: pointer;

  input {
    margin-top: 3px;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    accent-color: ${({ theme }) => theme.colors.primary};
    cursor: pointer;
  }

  a {
    color: ${({ theme }) => theme.colors.primary};
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
    text-decoration: underline;
  }
`

const ErrorText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.action};
`

const Actions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing[3]};
  margin-top: ${({ theme }) => theme.spacing[2]};
`

export function ConsentGate() {
  const { pathname } = useLocation()
  const user = useAuthStore((s) => s.user)
  const sessionReady = useAuthStore((s) => s.sessionReady)
  const logout = useAuthStore((s) => s.logout)

  const [checked, setChecked] = useState(false)
  const [localError, setLocalError] = useState('')

  const { mutate: acceptConsent, isPending: accepting, error: apiError } = useAcceptConsent()
  const { mutate: performLogout, isPending: loggingOut } = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      logout()
    },
  })

  if (!user || !sessionReady) return null
  if (LEGAL_PUBLIC_PATHS.has(pathname)) return null

  const needsConsent =
    user.termsVersion !== TERMS_VERSION ||
    user.privacyVersion !== PRIVACY_VERSION ||
    !user.ageConfirmedAt

  if (!needsConsent) return null

  function handleAccept() {
    if (!checked) {
      setLocalError(`Confirme que você tem ${MIN_AGE} anos ou mais e aceita os termos para continuar.`)
      return
    }
    setLocalError('')
    acceptConsent(
      {
        acceptedTermsVersion: TERMS_VERSION,
        acceptedPrivacyVersion: PRIVACY_VERSION,
        confirmAge18: true,
      },
      {
        onSuccess: () => {
          setChecked(false)
        },
      },
    )
  }

  const serverErrorMsg = (apiError as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <Overlay role="dialog" aria-modal="true" aria-labelledby="consent-gate-title">
      <Modal>
        <Title id="consent-gate-title">Aceite dos Termos e Privacidade</Title>
        <Description>
          Para continuar usando o Votz, confirme sua idade mínima e aceite a versão atual dos nossos documentos legais.
        </Description>

        <ConsentLabel $error={!!localError}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => {
              setChecked(e.target.checked)
              if (e.target.checked) setLocalError('')
            }}
          />
          <span>
            Tenho {MIN_AGE} anos ou mais e li e concordo com os{' '}
            <Link to="/termos" target="_blank" rel="noopener noreferrer">Termos de Uso</Link>{' '}
            e a{' '}
            <Link to="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</Link>.
          </span>
        </ConsentLabel>

        {(localError || serverErrorMsg) && (
          <ErrorText>{localError || serverErrorMsg}</ErrorText>
        )}

        <Actions>
          <Button
            type="button"
            variant="ghost"
            disabled={accepting || loggingOut}
            onClick={() => performLogout()}
          >
            Sair
          </Button>
          <Button
            type="button"
            variant="action"
            disabled={accepting || loggingOut}
            onClick={handleAccept}
          >
            {accepting ? 'Salvando...' : 'Aceitar e continuar'}
          </Button>
        </Actions>
      </Modal>
    </Overlay>
  )
}
