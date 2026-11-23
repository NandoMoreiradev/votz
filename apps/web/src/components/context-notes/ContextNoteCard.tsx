import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import { Info } from '@phosphor-icons/react'
import {
  CONTEXT_NOTE_KIND_LABELS,
  CONTEXT_NOTES_BRAND,
  ContextNoteTargetType,
  FlagTargetType,
} from '@votz/shared-types'
import { useShownContextNote } from '../../hooks/useContextNotes'
import { useAuthStore } from '../../store/auth.store'
import { FlagContentModal } from '../moderation/FlagContentModal'

const Box = styled.aside`
  margin: ${({ theme }) => theme.spacing[3]} 0;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-left: 4px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[4]};
`
const Title = styled.h3`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing[2]};
  margin: 0 0 ${({ theme }) => theme.spacing[1]};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.primary};
`
const Kind = styled.span`
  display: inline-block;
  margin-bottom: ${({ theme }) => theme.spacing[1]};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.muted};
`
const Body = styled.p`
  margin: 0 0 ${({ theme }) => theme.spacing[2]};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.text};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`
const Sources = styled.ul`
  margin: 0 0 ${({ theme }) => theme.spacing[2]};
  padding: 0;
  list-style: none;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  a {
    color: ${({ theme }) => theme.colors.primary};
    text-decoration: underline;
    overflow-wrap: anywhere;
  }
`
const Foot = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing[3]};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
`
const FootBtn = styled.button`
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: ${({ theme }) => theme.colors.muted};
  text-decoration: underline;
  cursor: pointer;
  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Cartão do Contexto da Comunidade: aparece embaixo da publicação ou do relato quando há uma nota exibida. */
export function ContextNoteCard({ type, id }: { type: ContextNoteTargetType; id: string }) {
  const { data: note } = useShownContextNote(type, id)
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [flagOpen, setFlagOpen] = useState(false)
  if (!note) return null

  return (
    <Box aria-label={CONTEXT_NOTES_BRAND.feature}>
      <Title>
        <Info size={16} weight="fill" aria-hidden="true" />
        {CONTEXT_NOTES_BRAND.shownTitle}
      </Title>
      <Kind>{CONTEXT_NOTE_KIND_LABELS[note.kind].label}</Kind>
      <Body>{note.text}</Body>
      <Sources>
        {note.sources.map((source) => (
          <li key={source}>
            Fonte:{' '}
            <a href={source} target="_blank" rel="noopener noreferrer nofollow ugc">
              {hostOf(source)}
            </a>
          </li>
        ))}
      </Sources>
      <Foot>
        <span>Avaliada como útil por várias pessoas do Votz.</span>
        <Link to="/contexto">Como funciona</Link>
        <FootBtn type="button" onClick={() => (user ? setFlagOpen(true) : navigate('/entrar'))}>
          Denunciar ou discordar desta nota
        </FootBtn>
      </Foot>
      <FlagContentModal
        isOpen={flagOpen}
        targetType={FlagTargetType.CONTEXT_NOTE}
        targetId={note.id}
        onClose={() => setFlagOpen(false)}
      />
    </Box>
  )
}
