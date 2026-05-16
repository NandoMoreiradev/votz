import { useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { Comment } from '../../types/api'
import { useComments, useCreateComment, useDeleteComment } from '../../hooks/useComments'
import { useAuthStore } from '../../store/auth.store'
import { UserType } from '@votz/shared-types'

// ── Styled ─────────────────────────────────────────────────────────────────

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
`

const SectionTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const Count = styled.span`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
`

// ── Formulário ─────────────────────────────────────────────────────────────

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 28px;
`

const Textarea = styled.textarea<{ $compact?: boolean }>`
  padding: ${({ $compact }) => ($compact ? '10px 12px' : '12px 14px')};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ $compact }) => ($compact ? '0.875rem' : '0.9375rem')};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  resize: vertical;
  min-height: ${({ $compact }) => ($compact ? '72px' : '88px')};
  font-family: ${({ theme }) => theme.fonts.body};
  line-height: 1.5;
  transition: border-color 0.15s;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }
`

const FormRow = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`

const SubmitBtn = styled.button`
  padding: 8px 18px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:not(:disabled):hover {
    opacity: 0.88;
  }
`

const CancelBtn = styled.button`
  padding: 8px 14px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: none;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.875rem;
  border: 1px solid ${({ theme }) => theme.colors.border};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
    border-color: #c4c4c4;
  }
`

const LoginPrompt = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 28px;

  a {
    color: ${({ theme }) => theme.colors.primary};
    font-weight: ${({ theme }) => theme.fontWeights.medium};
    &:hover { text-decoration: underline; }
  }
`

// ── Lista de comentários ────────────────────────────────────────────────────

const CommentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`

const CommentItem = styled.div<{ $reply?: boolean }>`
  display: flex;
  gap: 12px;
  padding: ${({ $reply }) => ($reply ? '12px 0 12px 0' : '16px 0')};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const AvatarCircle = styled(Link)<{ $src: string | null; $small?: boolean }>`
  width: ${({ $small }) => ($small ? '32px' : '38px')};
  height: ${({ $small }) => ($small ? '32px' : '38px')};
  border-radius: 50%;
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover` : theme.colors.border};
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${({ $small }) => ($small ? '0.75rem' : '0.875rem')};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.muted};
  text-decoration: none;
`

const CommentBody = styled.div`
  flex: 1;
  min-width: 0;
`

const CommentMeta = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
`

const AuthorName = styled(Link)`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: 0.9rem;
  color: ${({ theme }) => theme.colors.text};
  &:hover { color: ${({ theme }) => theme.colors.primary}; }
`

const CommentDate = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
`

const CommentText = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
`

const CommentActions = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 8px;
`

const ActionBtn = styled.button<{ $danger?: boolean }>`
  font-size: 0.8125rem;
  color: ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.muted)};
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: color 0.15s;

  &:hover {
    color: ${({ $danger, theme }) => ($danger ? '#c8313d' : theme.colors.text)};
  }
`

const RepliesBlock = styled.div`
  margin-top: 4px;
  padding-left: 20px;
  border-left: 2px solid ${({ theme }) => theme.colors.border};
`

const Empty = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  padding: 32px 0;
  font-size: 0.9375rem;
`

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return `${Math.floor(d / 30)}m`
}

// ── Formulário inline ──────────────────────────────────────────────────────

interface CommentFormProps {
  reportId: string
  parentId?: string
  placeholder?: string
  compact?: boolean
  onDone?: () => void
}

function CommentForm({ reportId, parentId, placeholder, compact, onDone }: CommentFormProps) {
  const [text, setText] = useState('')
  const { mutate, isPending } = useCreateComment(reportId)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const content = text.trim()
    if (!content) return
    mutate(
      { content, parentId },
      {
        onSuccess: () => {
          setText('')
          onDone?.()
        },
      },
    )
  }

  return (
    <Form onSubmit={handleSubmit}>
      <Textarea
        $compact={compact}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder ?? 'Escreva um comentário...'}
        maxLength={1000}
        required
      />
      <FormRow>
        {onDone && (
          <CancelBtn type="button" onClick={onDone}>
            Cancelar
          </CancelBtn>
        )}
        <SubmitBtn type="submit" disabled={isPending || text.trim().length < 3}>
          {isPending ? 'Enviando...' : parentId ? 'Responder' : 'Comentar'}
        </SubmitBtn>
      </FormRow>
    </Form>
  )
}

// ── Item de comentário ─────────────────────────────────────────────────────

interface CommentRowProps {
  comment: Comment
  reportId: string
  currentUserId?: string
  canModerate?: boolean
  reply?: boolean
}

function CommentRow({ comment, reportId, currentUserId, canModerate, reply }: CommentRowProps) {
  const [showReplyForm, setShowReplyForm] = useState(false)
  const { mutate: del, isPending: deleting } = useDeleteComment(reportId)

  const isOwner = currentUserId === comment.author.id
  const showDelete = isOwner || canModerate

  return (
    <CommentItem $reply={reply}>
      <AvatarCircle
        to={`/perfil/${comment.author.id}`}
        $src={comment.author.avatarUrl}
        $small={reply}
      >
        {!comment.author.avatarUrl && comment.author.name.charAt(0).toUpperCase()}
      </AvatarCircle>

      <CommentBody>
        <CommentMeta>
          <AuthorName to={`/perfil/${comment.author.id}`}>{comment.author.name}</AuthorName>
          <CommentDate>{timeAgo(comment.createdAt)}</CommentDate>
        </CommentMeta>

        <CommentText>{comment.content}</CommentText>

        <CommentActions>
          {currentUserId && !reply && (
            <ActionBtn type="button" onClick={() => setShowReplyForm((v) => !v)}>
              {showReplyForm ? 'Cancelar' : 'Responder'}
            </ActionBtn>
          )}
          {showDelete && (
            <ActionBtn
              $danger
              type="button"
              disabled={deleting}
              onClick={() => del(comment.id)}
            >
              Excluir
            </ActionBtn>
          )}
        </CommentActions>

        {showReplyForm && (
          <div style={{ marginTop: 12 }}>
            <CommentForm
              reportId={reportId}
              parentId={comment.id}
              placeholder={`Respondendo a ${comment.author.name}...`}
              compact
              onDone={() => setShowReplyForm(false)}
            />
          </div>
        )}

        {comment.replies && comment.replies.length > 0 && (
          <RepliesBlock>
            {comment.replies.map((r) => (
              <CommentRow
                key={r.id}
                comment={r}
                reportId={reportId}
                currentUserId={currentUserId}
                canModerate={canModerate}
                reply
              />
            ))}
          </RepliesBlock>
        )}
      </CommentBody>
    </CommentItem>
  )
}

// ── Componente principal ───────────────────────────────────────────────────

interface CommentsSectionProps {
  reportId: string
}

export function CommentsSection({ reportId }: CommentsSectionProps) {
  const user = useAuthStore((s) => s.user)
  const { data: comments, isLoading } = useComments(reportId)

  const canModerate =
    user?.type === UserType.MODERATOR || user?.type === UserType.ADMIN

  const total = comments?.reduce((acc, c) => acc + 1 + (c.replies?.length ?? 0), 0) ?? 0

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>Comentários</SectionTitle>
        {!isLoading && <Count>{total}</Count>}
      </SectionHeader>

      {user ? (
        <CommentForm reportId={reportId} />
      ) : (
        <LoginPrompt>
          <Link to="/entrar">Entre</Link> para deixar um comentário.
        </LoginPrompt>
      )}

      {isLoading ? (
        <Empty>Carregando...</Empty>
      ) : comments && comments.length > 0 ? (
        <CommentList>
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              reportId={reportId}
              currentUserId={user?.id}
              canModerate={canModerate}
            />
          ))}
        </CommentList>
      ) : (
        <Empty>Seja o primeiro a comentar.</Empty>
      )}
    </Section>
  )
}
