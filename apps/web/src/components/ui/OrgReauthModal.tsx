import { useEffect, useId, useRef, useState } from 'react'
import styled, { keyframes } from 'styled-components'
import { OrgProfile } from '../../types/api'

const fadeIn = keyframes`from { opacity: 0 } to { opacity: 1 }`
const slideUp = keyframes`from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) }`

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 24px;
  animation: ${fadeIn} 0.18s ease;
`

const Modal = styled.div`
  width: 100%;
  max-width: 440px;
  background: ${({ theme }) => theme.colors.white};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  overflow: hidden;
  animation: ${slideUp} 0.2s ease;
`

const Header = styled.div`
  position: relative;
  background: ${({ theme }) => theme.colors.primary};
  padding: 28px 32px 24px;
`

const CloseBtn = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.colors.white};
  opacity: 0.75;
  font-size: 1.125rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: ${({ theme }) => theme.radii.sm};

  &:hover {
    opacity: 1;
  }
`

const Logo = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.25rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: #fff;
  margin-bottom: 12px;

  span {
    color: ${({ theme }) => theme.colors.action};
  }
`

const Title = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.125rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: #fff;
  margin: 0 0 4px;
`

const Subtitle = styled.p`
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.72);
  margin: 0;
`

const Body = styled.div`
  padding: 24px 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const OrgRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: ${({ theme }) => theme.colors.neutral};
  border-radius: ${({ theme }) => theme.radii.md};
`

const AvatarBox = styled.div<{ $src?: string | null }>`
  width: 44px;
  height: 44px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : theme.colors.action)};
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  font-size: 1rem;
`

const OrgName = styled.div`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
`

const OrgType = styled.div`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
`

const Hint = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
  line-height: 1.5;
`

const ErrorBanner = styled.div`
  padding: 10px 14px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.action + '14'};
  color: ${({ theme }) => theme.colors.action};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`

const WarningBox = styled.div`
  padding: 14px 16px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.action + '10'};
  border: 1px solid ${({ theme }) => theme.colors.action + '30'};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.action};
  line-height: 1.5;
`

const CodeInput = styled.input`
  width: 100%;
  height: 52px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 1.5rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  letter-spacing: 0.35em;
  text-align: center;
  color: ${({ theme }) => theme.colors.text};
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const Actions = styled.div`
  display: flex;
  gap: 10px;
`

const CancelBtn = styled.button`
  flex: 1;
  height: 44px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
`

const ConfirmBtn = styled.button`
  flex: 2;
  height: 44px;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

function orgTypeLabel(type: string) {
  if (type === 'ENTITY') return 'Entidade pública'
  if (type === 'POLITICIAN') return 'Político'
  if (type === 'COMPANY') return 'Empresa'
  return type
}

interface OrgReauthModalProps {
  org: OrgProfile
  loading?: boolean
  error?: boolean
  mfaSetupRequired?: boolean
  onConfirm: (mfaCode: string) => void
  onCancel: () => void
}

export function OrgReauthModal({
  org,
  loading,
  error,
  mfaSetupRequired,
  onConfirm,
  onCancel,
}: OrgReauthModalProps) {
  const [mfaCode, setMfaCode] = useState('')
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (mfaCode.length < 6 || loading) return
    onConfirm(mfaCode)
  }

  return (
    <Overlay
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <Modal role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <Header>
          <CloseBtn type="button" aria-label="Fechar" onClick={onCancel}>
            ✕
          </CloseBtn>
          <Logo>
            <span>◆</span> VOTZ
          </Logo>
          <Title id={titleId}>Confirme sua identidade</Title>
          <Subtitle>Para retomar o perfil da organização, informe o código MFA.</Subtitle>
        </Header>

        <form onSubmit={handleSubmit}>
          <Body>
            <OrgRow>
              <AvatarBox $src={org.logoUrl}>
                {!org.logoUrl && org.name.charAt(0).toUpperCase()}
              </AvatarBox>
              <div>
                <OrgName>{org.name}</OrgName>
                <OrgType>{orgTypeLabel(org.type)}</OrgType>
              </div>
            </OrgRow>

            {mfaSetupRequired ? (
              <WarningBox>
                Você ainda não configurou o autenticador de dois fatores. Acesse{' '}
                <strong>Editar perfil → Segurança</strong> para ativar antes de usar este perfil.
              </WarningBox>
            ) : (
              <>
                <Hint>
                  Digite o código de 6 dígitos do seu autenticador para continuar como{' '}
                  <strong>{org.name}</strong> (ou cancele para ficar no perfil pessoal).
                </Hint>

                {error && (
                  <ErrorBanner>Código inválido ou expirado. Tente novamente.</ErrorBanner>
                )}

                <CodeInput
                  ref={inputRef}
                  id="org-reauth-mfa-code"
                  type="text"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  aria-label="Código MFA de 6 dígitos"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                />
              </>
            )}

            <Actions>
              <CancelBtn type="button" onClick={onCancel} disabled={loading}>
                Cancelar
              </CancelBtn>
              {!mfaSetupRequired && (
                <ConfirmBtn type="submit" disabled={loading || mfaCode.length < 6}>
                  {loading ? 'Verificando…' : 'Confirmar'}
                </ConfirmBtn>
              )}
            </Actions>
          </Body>
        </form>
      </Modal>
    </Overlay>
  )
}
