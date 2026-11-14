import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { FlagReason, FlagTargetType } from '@votz/shared-types'
import { FLAG_REASON_OPTIONS, useFlagContent } from '../../hooks/useModeration'
import {
  CharCounter,
  FieldLabel,
  ModalActions,
  ModalCancelBtn,
  ModalCard,
  ModalConfirmBtn,
  ModalDesc,
  ModalError,
  ModalOverlay,
  ModalSuccess,
  ModalTextarea,
  ModalTitle,
} from './moderation-modal-styles'

const ReasonList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing[1]};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
  max-height: 240px;
  overflow-y: auto;
`

const ReasonOption = styled.label<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing[2]};
  padding: 8px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid
    ${({ $selected, theme }) => ($selected ? theme.colors.primary : theme.colors.border)};
  background: ${({ $selected, theme }) =>
    $selected ? `${theme.colors.primary}0D` : theme.colors.white};
  cursor: pointer;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};

  input {
    accent-color: ${({ theme }) => theme.colors.primary};
  }
`

interface FlagContentModalProps {
  isOpen: boolean
  targetType: FlagTargetType
  targetId: string
  onClose: () => void
}

export function FlagContentModal({
  isOpen,
  targetType,
  targetId,
  onClose,
}: FlagContentModalProps) {
  const [reason, setReason] = useState<FlagReason>(FlagReason.FALSE_INFO)
  const [details, setDetails] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { mutate, isPending, reset } = useFlagContent()

  useEffect(() => {
    if (isOpen) {
      setReason(FlagReason.FALSE_INFO)
      setDetails('')
      setSubmitted(false)
      setErrorMsg(null)
      reset()
    }
  }, [isOpen, targetId, reset])

  if (!isOpen) return null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    mutate(
      {
        targetType,
        targetId,
        reason,
        details: details.trim() ? details.trim() : undefined,
      },
      {
        onSuccess: () => {
          setSubmitted(true)
        },
        onError: (err: unknown) => {
          const axiosErr = err as { response?: { status?: number; data?: { message?: string | string[] } } }
          if (axiosErr.response?.status === 409) {
            setErrorMsg('Você já sinalizou isto.')
            return
          }
          const msg = axiosErr.response?.data?.message
          setErrorMsg(
            Array.isArray(msg)
              ? msg[0]
              : msg || 'Não foi possível enviar a sinalização. Tente novamente.',
          )
        },
      },
    )
  }

  return (
    <ModalOverlay onClick={onClose} role="dialog" aria-modal="true" aria-label="Sinalizar conteúdo">
      <ModalCard onClick={(e) => e.stopPropagation()}>
        <ModalTitle>Sinalizar {targetType === FlagTargetType.REPORT ? 'relato' : 'comentário'}</ModalTitle>
        <ModalDesc>
          Conte para a moderação o motivo. Sua sinalização é confidencial.
        </ModalDesc>

        {submitted ? (
          <>
            <ModalSuccess>Recebemos. A moderação vai analisar.</ModalSuccess>
            <ModalActions>
              <ModalConfirmBtn type="button" onClick={onClose}>
                Fechar
              </ModalConfirmBtn>
            </ModalActions>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <ReasonList>
              {FLAG_REASON_OPTIONS.map((opt) => (
                <ReasonOption key={opt.value} $selected={reason === opt.value}>
                  <input
                    type="radio"
                    name="flag-reason"
                    value={opt.value}
                    checked={reason === opt.value}
                    onChange={() => setReason(opt.value)}
                  />
                  <span>{opt.label}</span>
                </ReasonOption>
              ))}
            </ReasonList>

            <FieldLabel htmlFor="flag-details">Conte o que aconteceu (opcional)</FieldLabel>
            <ModalTextarea
              id="flag-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={500}
              placeholder="Descreva rapidamente o problema, se quiser..."
            />
            <CharCounter>{details.length}/500</CharCounter>

            {errorMsg && <ModalError>{errorMsg}</ModalError>}

            <ModalActions>
              <ModalCancelBtn type="button" onClick={onClose} disabled={isPending}>
                Cancelar
              </ModalCancelBtn>
              <ModalConfirmBtn type="submit" disabled={isPending}>
                {isPending ? 'Enviando...' : 'Enviar'}
              </ModalConfirmBtn>
            </ModalActions>
          </form>
        )}
      </ModalCard>
    </ModalOverlay>
  )
}
