import { useEffect, useState } from 'react'
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
  ModalTextarea,
  ModalTitle,
} from './moderation-modal-styles'

interface ModerationReasonModalProps {
  isOpen: boolean
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
  isPending?: boolean
  errorMessage?: string | null
  onConfirm: (reason: string) => void
  onClose: () => void
}

export function ModerationReasonModal({
  isOpen,
  title,
  description,
  confirmLabel,
  danger = true,
  isPending = false,
  errorMessage = null,
  onConfirm,
  onClose,
}: ModerationReasonModalProps) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (isOpen) setReason('')
  }, [isOpen, title])

  if (!isOpen) return null

  const trimmed = reason.trim()
  const valid = trimmed.length >= 10 && trimmed.length <= 500

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || isPending) return
    onConfirm(trimmed)
  }

  return (
    <ModalOverlay onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <ModalCard onClick={(e) => e.stopPropagation()}>
        <ModalTitle>{title}</ModalTitle>
        <ModalDesc>{description}</ModalDesc>
        <form onSubmit={handleSubmit}>
          <FieldLabel htmlFor="moderation-reason-input">
            Motivo / observação (10 a 500 caracteres)
          </FieldLabel>
          <ModalTextarea
            id="moderation-reason-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="Explique de forma direta o motivo desta decisão..."
            autoFocus
          />
          <CharCounter>{trimmed.length}/500</CharCounter>
          {errorMessage && <ModalError>{errorMessage}</ModalError>}
          <ModalActions>
            <ModalCancelBtn type="button" onClick={onClose} disabled={isPending}>
              Cancelar
            </ModalCancelBtn>
            <ModalConfirmBtn type="submit" $danger={danger} disabled={!valid || isPending}>
              {isPending ? 'Salvando...' : confirmLabel}
            </ModalConfirmBtn>
          </ModalActions>
        </form>
      </ModalCard>
    </ModalOverlay>
  )
}
