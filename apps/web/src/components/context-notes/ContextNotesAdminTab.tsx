import { useState } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import {
  CONTEXT_NOTE_KIND_LABELS,
  CONTEXT_NOTE_STATUS_LABELS,
  ContextNoteStatus,
} from '@votz/shared-types'
import {
  useAdminContextNotes,
  useContributorAdminAction,
  useRecalculateContextNotes,
  useRemoveContextNote,
  type AdminContextNote,
} from '../../hooks/useContextNotesAdmin'
import { errorText } from '../../hooks/useContextNotes'
import { useAuthStore } from '../../store/auth.store'
import { ModerationReasonModal } from '../moderation/ModerationReasonModal'

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing[2]};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
  align-items: center;
`
const Pill = styled.button<{ $on: boolean }>`
  padding: 6px 12px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ theme, $on }) => ($on ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme, $on }) => ($on ? theme.colors.primary : theme.colors.white)};
  color: ${({ theme, $on }) => ($on ? theme.colors.white : theme.colors.text)};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  cursor: pointer;
`
const Item = styled.article`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing[4]};
  margin-bottom: ${({ theme }) => theme.spacing[3]};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`
const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing[3]};
  margin-bottom: ${({ theme }) => theme.spacing[2]};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
`
const Preview = styled.div`
  margin: ${({ theme }) => theme.spacing[2]} 0;
  padding: ${({ theme }) => theme.spacing[2]} ${({ theme }) => theme.spacing[3]};
  background: ${({ theme }) => theme.colors.neutral};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  a {
    color: ${({ theme }) => theme.colors.primary};
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
  }
  p {
    margin: 4px 0 0;
  }
`
const Btn = styled.button<{ $danger?: boolean }>`
  padding: 6px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme, $danger }) => ($danger ? theme.colors.action : theme.colors.border)};
  background: transparent;
  color: ${({ theme, $danger }) => ($danger ? theme.colors.action : theme.colors.text)};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`
const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing[2]};
  margin-top: ${({ theme }) => theme.spacing[3]};
`
const Info = styled.p`
  margin: ${({ theme }) => theme.spacing[2]} 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
`

const FILTERS: Array<{ value: ContextNoteStatus | ''; label: string }> = [
  { value: '', label: 'Todas' },
  { value: ContextNoteStatus.NEEDS_RATINGS, label: CONTEXT_NOTE_STATUS_LABELS.NEEDS_RATINGS },
  { value: ContextNoteStatus.SHOWN, label: CONTEXT_NOTE_STATUS_LABELS.SHOWN },
  { value: ContextNoteStatus.NOT_SHOWN, label: CONTEXT_NOTE_STATUS_LABELS.NOT_SHOWN },
  { value: ContextNoteStatus.REMOVED, label: CONTEXT_NOTE_STATUS_LABELS.REMOVED },
]

/** Aba "Contexto" da moderação: notas do Contexto da Comunidade, remover com motivo e cuidar de quem colabora. */
export function ContextNotesAdminTab() {
  const isAdmin = useAuthStore((s) => s.user?.type === 'ADMIN')
  const [status, setStatus] = useState<ContextNoteStatus | ''>('')
  const [page, setPage] = useState(1)
  const [removing, setRemoving] = useState<AdminContextNote | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const { data, isLoading } = useAdminContextNotes(status, page)
  const remove = useRemoveContextNote()
  const contributor = useContributorAdminAction()
  const recalculate = useRecalculateContextNotes()

  function act(userId: string, action: 'grant-write' | 'suspend' | 'restore', done: string) {
    setMessage(null)
    contributor.mutate({ userId, action }, { onSuccess: () => setMessage(done), onError: (err) => setMessage(errorText(err)) })
  }

  return (
    <div>
      <Row>
        {FILTERS.map((f) => (
          <Pill key={f.label} type="button" $on={status === f.value} onClick={() => { setStatus(f.value); setPage(1) }}>
            {f.label}
          </Pill>
        ))}
        {isAdmin && (
          <Btn
            type="button"
            disabled={recalculate.isPending}
            onClick={() => {
              setMessage(null)
              recalculate.mutate(undefined, {
                onSuccess: (r) => setMessage(`Conta feita: ${r.evaluated} notas avaliadas, ${r.shown} passaram a aparecer, ${r.notShown} deixaram de aparecer.`),
                onError: (err) => setMessage(errorText(err)),
              })
            }}
          >
            {recalculate.isPending ? 'Calculando...' : 'Rodar a conta agora'}
          </Btn>
        )}
      </Row>

      {message && <Info role="status">{message}</Info>}

      {isLoading ? (
        <Info>Carregando...</Info>
      ) : !data?.data.length ? (
        <Info>Nenhuma nota encontrada.</Info>
      ) : (
        data.data.map((note) => (
          <Item key={note.id}>
            <Meta>
              <strong>{CONTEXT_NOTE_STATUS_LABELS[note.status]}</strong>
              <span>{CONTEXT_NOTE_KIND_LABELS[note.kind].label}</span>
              <span>{note.ratingsCount} avaliações{note.helpfulShare !== null ? `, ${Math.round(note.helpfulShare * 100)}% úteis` : ''}</span>
              <span>{new Date(note.createdAt).toLocaleString('pt-BR')}</span>
              <span>{note.author ? `Autor: ${note.author.name}` : 'Sem autor (conta excluída ou IA)'}</span>
            </Meta>
            <div>{note.text}</div>
            <Meta style={{ marginTop: 8 }}>
              {note.sources.map((s) => (
                <a key={s} href={s} target="_blank" rel="noopener noreferrer nofollow ugc">{s}</a>
              ))}
            </Meta>
            <Preview>
              <Link to={note.target.link}>{note.target.title}</Link>
              <p>{note.target.excerpt}</p>
            </Preview>
            <Actions>
              {note.status !== ContextNoteStatus.REMOVED && (
                <Btn type="button" $danger onClick={() => { remove.reset(); setRemoving(note) }}>Remover nota</Btn>
              )}
              {note.author && (
                <>
                  <Btn type="button" disabled={contributor.isPending} onClick={() => act(note.author!.id, 'grant-write', 'Escrita liberada para o colaborador.')}>Liberar escrita do autor</Btn>
                  <Btn type="button" $danger disabled={contributor.isPending} onClick={() => act(note.author!.id, 'suspend', 'Colaborador suspenso.')}>Suspender autor</Btn>
                  <Btn type="button" disabled={contributor.isPending} onClick={() => act(note.author!.id, 'restore', 'Colaborador reativado.')}>Reativar autor</Btn>
                </>
              )}
            </Actions>
          </Item>
        ))
      )}

      {data && data.meta.totalPages > 1 && (
        <Row>
          <Btn type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Btn>
          <span>Página {page} de {data.meta.totalPages}</span>
          <Btn type="button" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Btn>
        </Row>
      )}

      <ModerationReasonModal
        isOpen={!!removing}
        title="Remover nota"
        description="A nota sai do ar para todo mundo. Quem escreveu recebe este motivo por e-mail e pode contestar."
        confirmLabel="Remover nota"
        danger
        isPending={remove.isPending}
        errorMessage={remove.isError ? errorText(remove.error) : null}
        onConfirm={(reason) => {
          if (!removing) return
          remove.mutate({ id: removing.id, reason }, { onSuccess: () => { setRemoving(null); setMessage('Nota removida e autor avisado.') } })
        }}
        onClose={() => setRemoving(null)}
      />
    </div>
  )
}
