import { useEffect, useState } from 'react'
import styled from 'styled-components'
import {
  CONTEXT_NOTE_KINDS_BY_TARGET,
  CONTEXT_NOTE_KIND_LABELS,
  CONTEXT_NOTE_SOURCES_MAX,
  CONTEXT_NOTE_TEXT_MAX,
  CONTEXT_NOTE_TEXT_MIN,
  CONTEXT_NOTE_WRITING_RULES,
  CONTEXT_NOTES_BRAND,
  ContextNoteKind,
  ContextNoteTargetType,
} from '@votz/shared-types'
import { errorText, useCreateContextNote } from '../../hooks/useContextNotes'
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
} from '../moderation/moderation-modal-styles'

const Scroll = styled(ModalCard)`
  max-width: 560px;
  max-height: 90vh;
  overflow-y: auto;
`

const KindOption = styled.label<{ $selected: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing[2]};
  padding: 8px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme, $selected }) => ($selected ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme, $selected }) => ($selected ? `${theme.colors.primary}0D` : theme.colors.white)};
  cursor: pointer;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};
  input {
    margin-top: 3px;
    accent-color: ${({ theme }) => theme.colors.primary};
  }
  small {
    display: block;
    color: ${({ theme }) => theme.colors.muted};
    font-size: ${({ theme }) => theme.fontSizes.xs};
    margin-top: 2px;
  }
`

const KindList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing[1]};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`

const SourceInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  margin-bottom: ${({ theme }) => theme.spacing[2]};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const LinkBtn = styled.button`
  background: none;
  border: none;
  padding: 0;
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-decoration: underline;
  cursor: pointer;
`

const Rules = styled.ul`
  margin: ${({ theme }) => theme.spacing[3]} 0 0;
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[4]};
  background: ${({ theme }) => theme.colors.neutral};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.5;
  list-style: disc inside;
`

interface Props {
  isOpen: boolean
  targetType: ContextNoteTargetType
  targetId: string
  onClose: () => void
}

export function WriteContextNoteModal({ isOpen, targetType, targetId, onClose }: Props) {
  const kinds = CONTEXT_NOTE_KINDS_BY_TARGET[targetType]
  const [kind, setKind] = useState<ContextNoteKind>(kinds[0])
  const [text, setText] = useState('')
  const [sources, setSources] = useState<string[]>([''])
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { mutate, isPending, reset } = useCreateContextNote()

  useEffect(() => {
    if (!isOpen) return
    setKind(CONTEXT_NOTE_KINDS_BY_TARGET[targetType][0])
    setText('')
    setSources([''])
    setDone(false)
    setError(null)
    reset()
  }, [isOpen, targetType, targetId, reset])

  if (!isOpen) return null

  const filled = sources.map((s) => s.trim()).filter(Boolean)
  const tooShort = text.trim().length < CONTEXT_NOTE_TEXT_MIN
  const canSubmit = !isPending && !tooShort && filled.length > 0

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    mutate(
      { targetType, targetId, kind, text: text.trim(), sources: filled },
      { onSuccess: () => setDone(true), onError: (err) => setError(errorText(err)) },
    )
  }

  return (
    <ModalOverlay onClick={onClose} role="dialog" aria-modal="true" aria-label={`Escrever nota do ${CONTEXT_NOTES_BRAND.feature}`}>
      <Scroll onClick={(e) => e.stopPropagation()}>
        <ModalTitle>Escrever contexto</ModalTitle>
        <ModalDesc>
          Sua nota só aparece para todo mundo depois que outras pessoas avaliarem como útil. Sem fonte, ela não vale.
        </ModalDesc>

        {done ? (
          <>
            <ModalSuccess>Nota enviada. Agora outras pessoas vão avaliar.</ModalSuccess>
            <ModalActions>
              <ModalConfirmBtn type="button" onClick={onClose}>Fechar</ModalConfirmBtn>
            </ModalActions>
          </>
        ) : (
          <form onSubmit={submit}>
            <FieldLabel>O que a sua nota faz?</FieldLabel>
            <KindList>
              {kinds.map((k) => (
                <KindOption key={k} $selected={kind === k}>
                  <input type="radio" name="context-kind" checked={kind === k} onChange={() => setKind(k)} />
                  <span>
                    {CONTEXT_NOTE_KIND_LABELS[k].label}
                    <small>{CONTEXT_NOTE_KIND_LABELS[k].hint}</small>
                  </span>
                </KindOption>
              ))}
            </KindList>

            <FieldLabel htmlFor="context-note-text">A nota</FieldLabel>
            <ModalTextarea
              id="context-note-text"
              value={text}
              maxLength={CONTEXT_NOTE_TEXT_MAX}
              onChange={(e) => setText(e.target.value)}
              placeholder="Explique o fato em poucas linhas."
            />
            <CharCounter>{text.length}/{CONTEXT_NOTE_TEXT_MAX}</CharCounter>

            <FieldLabel style={{ marginTop: 12 }}>Fontes (links que qualquer pessoa consiga abrir)</FieldLabel>
            {sources.map((value, i) => (
              <SourceInput
                key={i}
                type="url"
                inputMode="url"
                value={value}
                placeholder="https://..."
                aria-label={`Fonte ${i + 1}`}
                onChange={(e) => setSources((prev) => prev.map((s, j) => (j === i ? e.target.value : s)))}
              />
            ))}
            {sources.length < CONTEXT_NOTE_SOURCES_MAX && (
              <LinkBtn type="button" onClick={() => setSources((prev) => [...prev, ''])}>+ Adicionar outra fonte</LinkBtn>
            )}

            <Rules>
              {CONTEXT_NOTE_WRITING_RULES.map((rule) => <li key={rule}>{rule}</li>)}
            </Rules>

            {error && <ModalError role="alert">{error}</ModalError>}

            <ModalActions>
              <ModalCancelBtn type="button" onClick={onClose}>Cancelar</ModalCancelBtn>
              <ModalConfirmBtn type="submit" disabled={!canSubmit}>
                {isPending ? 'Enviando...' : 'Enviar nota'}
              </ModalConfirmBtn>
            </ModalActions>
          </form>
        )}
      </Scroll>
    </ModalOverlay>
  )
}
