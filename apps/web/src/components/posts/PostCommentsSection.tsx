import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { Link, useLocation } from 'react-router-dom'
import {
  ChatCircle,
  CheckCircle,
  FilmStrip,
  Flag,
  Image as ImageIcon,
  Microphone,
  Trash,
  X,
} from '@phosphor-icons/react'
import { FlagTargetType, PostCommentMediaType, UserType } from '@votz/shared-types'
import { PostAuthorInfo, PostCommentDto } from '../../types/api'
import {
  useCreatePostComment,
  useDeletePostComment,
  usePostComments,
  useUploadPostCommentMedia,
} from '../../hooks/usePosts'
import { useAuthStore } from '../../store/auth.store'
import { VoiceRecorder } from '../comments/VoiceRecorder'
import { VoiceCommentPlayer } from '../comments/VoiceCommentPlayer'
import { useMediaViewer } from '../ui/MediaViewer'
import { FlagContentModal } from '../moderation/FlagContentModal'
import { GifPickerPopover } from './GifPickerPopover'

const Wrap = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0;
`

const ComposerLayout = styled.div<{ $reply?: boolean; $collapsed?: boolean }>`
  display: flex;
  align-items: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
  gap: 12px;
  padding: ${({ $reply }) => ($reply ? '0' : '14px 16px')};
  border-bottom: ${({ $reply, theme }) => ($reply ? 'none' : `1px solid ${theme.colors.border}`)};
  @media (max-width: 480px) {
    padding: ${({ $reply }) => ($reply ? '0' : '12px 14px')};
    gap: 10px;
  }
`

const ComposerAvatar = styled.div<{ $src?: string | null; $org?: boolean }>`
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: ${({ $org }) => ($org ? '10px' : '50%')};
  display: grid;
  place-items: center;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  font-size: 0.95rem;
  color: ${({ theme }) => theme.colors.onAccent};
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : theme.colors.primary)};
`

const ComposerMain = styled.div`
  flex: 1;
  min-width: 0;
`

const CommentList = styled.div`
  display: flex;
  flex-direction: column;
`

const ConversationState = styled.div`
  padding: 28px 16px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
  line-height: 1.6;
  text-align: center;
  a {
    color: ${({ theme }) => theme.colors.action};
    font-weight: 600;
  }
`

const FormBox = styled.form<{ $collapsed?: boolean }>`
  display: flex;
  flex-direction: ${({ $collapsed }) => ($collapsed ? 'row' : 'column')};
  align-items: ${({ $collapsed }) => ($collapsed ? 'center' : 'stretch')};
  gap: 8px;
  background: ${({ theme }) => theme.colors.white};
  padding: 0;
`

const Textarea = styled.textarea<{ $collapsed?: boolean }>`
  width: 100%;
  min-height: ${({ $collapsed }) => ($collapsed ? '36px' : '56px')};
  border: none;
  background: transparent;
  resize: none;
  overflow: hidden;
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 16px;
  line-height: 1.45;
  color: ${({ theme }) => theme.colors.text};
  border-radius: 6px;
  padding: 6px 0;
  box-sizing: border-box;

  &:focus {
    outline: none;
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }
`

const PreviewBox = styled.div`
  position: relative;
  display: inline-flex;
  align-self: flex-start;
  max-width: 240px;
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.border};

  img {
    display: block;
    max-width: 100%;
    max-height: 180px;
    object-fit: cover;
  }
`

const RemoveMediaBtn = styled.button`
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: rgba(13, 13, 13, 0.72);
  color: ${({ theme }) => theme.colors.onAccent};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`

const ToolBar = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  padding-top: 8px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const ToolIconBtn = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  min-height: 34px;
  border: none;
  background: ${({ $active, theme }) => ($active ? `${theme.colors.primary}12` : 'transparent')};
  color: ${({ theme }) => theme.colors.action};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => `${theme.colors.action}12`};
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  @media (max-width: 480px) {
    padding: 8px;
    font-size: 0;
    gap: 0;
    &[data-cancel] {
      font-size: 12px;
    }
  }
`

const Spacer = styled.div`
  flex: 1;
`

const SubmitBtn = styled.button`
  padding: 8px 18px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: none;
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.onAccent};
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const CommentThreadBlock = styled.div`
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`

const CommentRowWrap = styled.div<{ $reply?: boolean; $hasReplies?: boolean }>`
  display: flex;
  gap: 12px;
  padding: ${({ $reply, $hasReplies }) =>
    $reply ? '4px 16px 12px' : $hasReplies ? '14px 16px 4px' : '14px 16px'};
  transition: background 0.15s;

  @media (max-width: 480px) {
    padding-inline: 14px;
    gap: 10px;
  }
`

const AvatarRail = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 38px;
`

const ThreadLine = styled.div`
  width: 2px;
  flex: 1;
  min-height: 16px;
  margin-top: 4px;
  border-radius: 2px;
  background: ${({ theme }) => theme.colors.border};
`

const Avatar = styled(Link)<{ $src: string | null; $small?: boolean; $org?: boolean }>`
  width: ${({ $small }) => ($small ? '32px' : '38px')};
  height: ${({ $small }) => ($small ? '32px' : '38px')};
  border-radius: ${({ $org }) => ($org ? '9px' : '50%')};
  flex-shrink: 0;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : theme.colors.primary)};
  color: ${({ theme }) => theme.colors.onAccent};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ $small }) => ($small ? '0.75rem' : '0.85rem')};
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`

const Body = styled.div`
  flex: 1;
  min-width: 0;
`

const Meta = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  margin-bottom: 3px;
  line-height: 1.3;
`

const AuthorLink = styled(Link)`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 14.5px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  &:hover {
    text-decoration: underline;
  }
`

const HandleText = styled.span`
  font-size: 13.5px;
  color: ${({ theme }) => theme.colors.muted};
`

const AuthorBadge = styled.span`
  font-size: 11px;
  padding: 2px 7px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.surfaceHover};
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.primaryText};
  font-weight: 600;
`

const Time = styled.span`
  font-size: 13.5px;
  color: ${({ theme }) => theme.colors.muted};
  font-variant-numeric: tabular-nums;
`

const CommentText = styled.p`
  margin: 0 0 6px;
  font-size: 15px;
  line-height: 1.45;
  color: ${({ theme }) => theme.colors.text};
  white-space: pre-wrap;
  word-break: break-word;
`

const CommentMediaImg = styled.img`
  max-width: min(320px, 100%);
  max-height: 240px;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  display: block;
  margin: 6px 0;
  cursor: pointer;
`

const RowActions = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 2px;
`

const MiniActBtn = styled.button<{ $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  min-height: 28px;
  border: none;
  background: transparent;
  font-size: 12.5px;
  font-weight: 500;
  color: ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.muted)};
  cursor: pointer;

  &:hover {
    color: ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.text)};
  }
`

const ErrorMsg = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.action};
`

function authorDisplay(a: PostAuthorInfo) {
  const name = a.orgName ?? a.name
  const avatar = a.orgAvatarUrl ?? a.avatarUrl
  const verified = a.orgType ? a.orgVerified : a.verified
  const isOrg = a.orgType === 'ENTITY' || a.orgType === 'COMPANY'
  const handle = !a.orgName && a.username ? `@${a.username}` : null
  const href =
    a.orgType === 'POLITICIAN' && a.orgId
      ? `/politico/${a.orgId}`
      : a.orgType === 'ENTITY' && a.orgId
        ? `/entidade/${a.orgId}`
        : a.orgType === 'COMPANY' && a.orgId
          ? `/empresa/${a.orgId}`
          : `/perfil/${a.userId}`
  return { name, avatar, verified, isOrg, handle, href }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
}

interface CommentComposerProps {
  postId: string
  parentId?: string
  canCommentWithAudio: boolean
  onDone?: () => void
  placeholder?: string
}

function CommentComposer({
  postId,
  parentId,
  canCommentWithAudio,
  onDone,
  placeholder,
}: CommentComposerProps) {
  const user = useAuthStore((s) => s.user)
  const context = useAuthStore((s) => s.activeContext)
  const location = useLocation()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [expanded, setExpanded] = useState(!!parentId || location.hash === '#responder')
  const [content, setContent] = useState('')
  const [attachedMedia, setAttachedMedia] = useState<{
    type: PostCommentMediaType
    url: string
    key?: string
  } | null>(null)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!parentId && location.hash === '#responder') {
      setExpanded(true)
      textareaRef.current?.focus({ preventScroll: true })
      textareaRef.current?.scrollIntoView({ block: 'center' })
    }
  }, [location.hash, location.key, parentId])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [content, expanded])

  const fileRef = useRef<HTMLInputElement>(null)
  const uploadMedia = useUploadPostCommentMedia()
  const createComment = useCreatePostComment(postId)

  const isCollapsed = !parentId && !expanded && !content && !attachedMedia && !showGifPicker

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErrorMsg(null)
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setErrorMsg('Use JPEG, PNG, WebP ou GIF.')
      return
    }
    try {
      const uploaded = await uploadMedia.mutateAsync(file)
      setAttachedMedia({
        type: file.type === 'image/gif' ? PostCommentMediaType.GIF : PostCommentMediaType.IMAGE,
        url: uploaded.url,
        key: uploaded.key,
      })
      setShowGifPicker(false)
    } catch {
      setErrorMsg('Falha no upload da imagem.')
    }
  }

  async function handleVoiceRecorded(blob: Blob, durationSeconds: number) {
    setErrorMsg(null)
    try {
      const uploaded = await uploadMedia.mutateAsync(blob)
      await createComment.mutateAsync({
        content: content.trim() || undefined,
        parentId,
        mediaType: PostCommentMediaType.AUDIO,
        mediaUrl: uploaded.url,
        mediaKey: uploaded.key,
        mediaDuration: durationSeconds,
      })
      setContent('')
      setVoiceMode(false)
      onDone?.()
    } catch {
      setErrorMsg('Somente o autor da publicação pode enviar comentário em áudio.')
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    const trimmed = content.trim()
    if (!attachedMedia && !trimmed) return

    const sentMedia = attachedMedia
    createComment.mutate(
      {
        content: trimmed || undefined,
        parentId,
        mediaType: sentMedia ? sentMedia.type : PostCommentMediaType.TEXT,
        mediaUrl: sentMedia?.url,
        mediaKey: sentMedia?.key,
      },
      {
        onError: () => {
          setContent((current) => current || trimmed)
          setAttachedMedia((current) => current ?? sentMedia)
          setErrorMsg('Não foi possível enviar seu comentário.')
        },
      },
    )
    setContent('')
    setAttachedMedia(null)
    setShowGifPicker(false)
    if (!parentId) setExpanded(false)
    onDone?.()
  }

  if (voiceMode) {
    return (
      <div style={{ padding: parentId ? '8px 0' : '14px 16px' }}>
        <VoiceRecorder
          onRecorded={handleVoiceRecorded}
          onCancel={() => setVoiceMode(false)}
        />
        {errorMsg && <ErrorMsg style={{ marginTop: 6 }}>{errorMsg}</ErrorMsg>}
      </div>
    )
  }

  const avatarSrc = context?.logoUrl ?? user?.avatarUrl
  const avatarInitial = (context?.name ?? user?.name ?? 'V').charAt(0).toUpperCase()
  const isOrgContext = context?.type === 'ENTITY'

  return (
    <ComposerLayout $reply={!!parentId} $collapsed={isCollapsed}>
      {!parentId && (
        <ComposerAvatar $src={avatarSrc} $org={isOrgContext} aria-hidden="true">
          {!avatarSrc && avatarInitial}
        </ComposerAvatar>
      )}
      <ComposerMain>
        <FormBox onSubmit={handleSubmit} $collapsed={isCollapsed}>
          <Textarea
            ref={textareaRef}
            rows={1}
            $collapsed={isCollapsed}
            aria-label={parentId ? 'Sua resposta ao comentário' : 'Sua resposta à publicação'}
            value={content}
            onFocus={() => setExpanded(true)}
            onChange={(e) => setContent(e.target.value)}
            maxLength={1000}
            placeholder={placeholder ?? 'Poste sua resposta'}
          />

          {isCollapsed && (
            <SubmitBtn type="submit" disabled>
              Responder
            </SubmitBtn>
          )}

          {!isCollapsed && attachedMedia && (
            <PreviewBox>
              <img src={attachedMedia.url} alt="Mídia anexada" />
              <RemoveMediaBtn type="button" onClick={() => setAttachedMedia(null)} aria-label="Remover mídia">
                <X size={12} />
              </RemoveMediaBtn>
            </PreviewBox>
          )}

          {!isCollapsed && (
            <ToolBar>
              <ToolIconBtn
                type="button"
                aria-label="Anexar imagem à resposta"
                title="Anexar imagem"
                onClick={() => fileRef.current?.click()}
                disabled={uploadMedia.isPending}
              >
                <ImageIcon size={16} /> Imagem
              </ToolIconBtn>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: 'none' }}
                onChange={handleImagePick}
              />

              <ToolIconBtn
                type="button"
                aria-label="Escolher GIF"
                title="Escolher GIF"
                $active={showGifPicker}
                onClick={() => setShowGifPicker((v) => !v)}
              >
                <FilmStrip size={16} /> GIF
              </ToolIconBtn>

              {canCommentWithAudio && (
                <ToolIconBtn
                  type="button"
                  aria-label="Gravar resposta em áudio"
                  onClick={() => setVoiceMode(true)}
                  title="Exclusivo do autor da publicação"
                >
                  <Microphone size={16} /> Áudio (autor)
                </ToolIconBtn>
              )}

              <Spacer />

              {onDone && (
                <ToolIconBtn type="button" data-cancel onClick={onDone}>
                  Cancelar
                </ToolIconBtn>
              )}

              <SubmitBtn
                type="submit"
                disabled={
                  uploadMedia.isPending ||
                  (!attachedMedia && content.trim().length === 0)
                }
              >
                Responder
              </SubmitBtn>
            </ToolBar>
          )}
        </FormBox>

        {!isCollapsed && showGifPicker && (
          <GifPickerPopover
            onSelectGif={({ url, key }) => {
              setAttachedMedia({ type: PostCommentMediaType.GIF, url, key })
              setShowGifPicker(false)
            }}
            onClose={() => setShowGifPicker(false)}
          />
        )}

        {errorMsg && <ErrorMsg style={{ marginTop: 6 }}>{errorMsg}</ErrorMsg>}
      </ComposerMain>
    </ComposerLayout>
  )
}

function CommentRow({
  comment,
  postId,
  canCommentWithAudio,
  reply,
  hasNextSibling,
}: {
  comment: PostCommentDto
  postId: string
  canCommentWithAudio: boolean
  reply?: boolean
  hasNextSibling?: boolean
}) {
  const user = useAuthStore((s) => s.user)
  const { open: openMedia } = useMediaViewer()
  const deleteComment = useDeletePostComment(postId)
  const [replyOpen, setReplyOpen] = useState(false)
  const [flagOpen, setFlagOpen] = useState(false)

  const author = authorDisplay(comment.author)
  const isOwner = user?.id === comment.author.userId
  const canModerate = user?.type === UserType.ADMIN || user?.type === UserType.MODERATOR
  const replies = comment.replies ?? []
  const hasReplies = !reply && replies.length > 0
  const showConnector = hasReplies || (!!reply && !!hasNextSibling)

  const row = (
    <CommentRowWrap $reply={reply} $hasReplies={hasReplies}>
      <AvatarRail>
        <Avatar to={author.href} $src={author.avatar} $small={reply} $org={author.isOrg}>
          {!author.avatar && author.name.charAt(0).toUpperCase()}
        </Avatar>
        {showConnector && <ThreadLine aria-hidden="true" />}
      </AvatarRail>

      <Body>
        <Meta>
          <AuthorLink to={author.href}>{author.name}</AuthorLink>
          {author.verified && <CheckCircle size={14} weight="fill" color="#2DC653" />}
          {author.handle && <HandleText>{author.handle}</HandleText>}
          {comment.mediaType === PostCommentMediaType.AUDIO && (
            <AuthorBadge>🎙 Áudio do autor</AuthorBadge>
          )}
          <HandleText>·</HandleText>
          <Time>{timeAgo(comment.createdAt)}</Time>
        </Meta>

        {comment.content && <CommentText>{comment.content}</CommentText>}

        {(comment.mediaType === PostCommentMediaType.IMAGE ||
          comment.mediaType === PostCommentMediaType.GIF) &&
          comment.mediaUrl && (
            <CommentMediaImg
              src={comment.mediaUrl}
              alt="Mídia do comentário"
              onClick={() => openMedia([{ url: comment.mediaUrl!, type: 'image' }])}
            />
          )}

        {comment.mediaType === PostCommentMediaType.AUDIO && comment.mediaUrl && (
          <VoiceCommentPlayer
            url={comment.mediaUrl}
            duration={comment.mediaDuration}
            transcript={comment.transcript}
          />
        )}

        <RowActions>
          {user && !reply && (
            <MiniActBtn type="button" aria-expanded={replyOpen} onClick={() => setReplyOpen((v) => !v)}>
              <ChatCircle size={15} />
              {replyOpen ? 'Cancelar' : 'Responder'}
            </MiniActBtn>
          )}
          {user && !isOwner && (
            <MiniActBtn type="button" title="Sinalizar comentário" aria-label="Sinalizar comentário" onClick={() => setFlagOpen(true)}>
              <Flag size={14} />
            </MiniActBtn>
          )}
          {(isOwner || canModerate) && (
            <MiniActBtn
              $danger
              type="button"
              title="Excluir comentário"
              aria-label="Excluir comentário"
              disabled={deleteComment.isPending}
              onClick={() => deleteComment.mutate(comment.id)}
            >
              <Trash size={14} />
            </MiniActBtn>
          )}
        </RowActions>

        <FlagContentModal
          isOpen={flagOpen}
          targetType={FlagTargetType.POST_COMMENT}
          targetId={comment.id}
          onClose={() => setFlagOpen(false)}
        />

        {replyOpen && (
          <div style={{ marginTop: 10 }}>
            <CommentComposer
              postId={postId}
              parentId={comment.id}
              canCommentWithAudio={canCommentWithAudio}
              placeholder={`Respondendo a ${author.name}...`}
              onDone={() => setReplyOpen(false)}
            />
          </div>
        )}
      </Body>
    </CommentRowWrap>
  )

  if (reply) return row

  return (
    <CommentThreadBlock>
      {row}
      {replies.map((r, idx) => (
        <CommentRow
          key={r.id}
          comment={r}
          postId={postId}
          canCommentWithAudio={canCommentWithAudio}
          reply
          hasNextSibling={idx < replies.length - 1}
        />
      ))}
    </CommentThreadBlock>
  )
}

interface PostCommentsSectionProps {
  postId: string
  canCommentWithAudio: boolean
  commentsCount: number
}

export function PostCommentsSection({ postId, canCommentWithAudio }: PostCommentsSectionProps) {
  const user = useAuthStore((s) => s.user)
  const { data: comments, isLoading, isError, refetch } = usePostComments(postId)

  return (
    <Wrap id="responder" aria-label="Respostas à publicação" style={{ scrollMarginTop: 112 }}>
      {user ? (
        <CommentComposer postId={postId} canCommentWithAudio={canCommentWithAudio} />
      ) : (
        <ConversationState style={{ borderBottom: '1px solid var(--border, #E5E5E5)' }}>
          <Link to="/entrar">Entre na sua conta</Link> para responder com texto, imagem ou GIF.
        </ConversationState>
      )}

      {isLoading ? (
        <ConversationState>Carregando respostas…</ConversationState>
      ) : isError ? (
        <ConversationState>
          Não foi possível carregar as respostas.{' '}
          <MiniActBtn onClick={() => refetch()}>Tentar novamente</MiniActBtn>
        </ConversationState>
      ) : comments && comments.length > 0 ? (
        <CommentList>
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              postId={postId}
              canCommentWithAudio={canCommentWithAudio}
            />
          ))}
        </CommentList>
      ) : (
        <ConversationState>Nenhuma resposta ainda. Comece a conversa.</ConversationState>
      )}
    </Wrap>
  )
}
