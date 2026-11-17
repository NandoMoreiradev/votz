import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { Link, useLocation } from 'react-router-dom'
import {
  ChatCircle,
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

const ConversationHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 20px 0;
  h2 { margin: 0; font-family: ${({ theme }) => theme.fonts.heading}; font-size: 17px; }
  span { color: ${({ theme }) => theme.colors.muted}; font-size: 13px; }
  @media (max-width: 480px) { padding-inline: 16px; }
`

const ComposerLayout = styled.div<{ $reply?: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: ${({ $reply }) => $reply ? '0' : '20px'};
  border-bottom: ${({ $reply, theme }) => $reply ? 'none' : `1px solid ${theme.colors.border}`};
  @media (max-width: 480px) { padding: ${({ $reply }) => $reply ? '0' : '16px'}; gap: 10px; }
`

const ComposerAvatar = styled.div<{ $src?: string | null }>`
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.action};
  background: ${({ $src, theme }) => $src ? `url(${$src}) center/cover` : `${theme.colors.action}10`};
`

const ComposerMain = styled.div`
  flex: 1;
  min-width: 0;
`

const CommentList = styled.div`
  padding: 0 20px;
  @media (max-width: 480px) { padding-inline: 16px; }
`

const ConversationState = styled.div`
  padding: 24px 20px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
  line-height: 1.6;
  a { color: ${({ theme }) => theme.colors.action}; font-weight: 600; }
`

const FormBox = styled.form`
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: ${({ theme }) => theme.colors.white};
  padding: 0;
`

const Textarea = styled.textarea`
  width: 100%;
  min-height: 64px;
  border: none;
  background: transparent;
  resize: vertical;
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 16px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text};
  border-radius: 6px;
  padding: 6px 0;
  &:focus-visible { outline: 2px solid ${({ theme }) => `${theme.colors.action}55`}; outline-offset: 3px; }
  box-sizing: border-box;

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
  color: ${({ theme }) => theme.colors.white};
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
`

const ToolIconBtn = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  min-height: 36px;
  border: none;
  background: ${({ $active, theme }) => ($active ? `${theme.colors.primary}12` : theme.colors.white)};
  color: ${({ theme }) => theme.colors.action};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  @media (max-width: 480px) { padding: 8px; font-size: 0; gap: 0; &[data-cancel] { font-size: 12px; } }
`

const Spacer = styled.div`
  flex: 1;
`

const SubmitBtn = styled.button`
  padding: 9px 18px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: none;
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.white};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const CommentRowWrap = styled.div<{ $reply?: boolean }>`
  display: flex;
  gap: 10px;
  padding: ${({ $reply }) => ($reply ? '10px 0 6px' : '12px 0')};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const Avatar = styled(Link)<{ $src: string | null; $small?: boolean }>`
  width: ${({ $small }) => ($small ? '28px' : '34px')};
  height: ${({ $small }) => ($small ? '28px' : '34px')};
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : `${theme.colors.action}10`)};
  color: ${({ theme }) => theme.colors.action};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ $small }) => ($small ? '0.7rem' : '0.8rem')};
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
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
`

const AuthorLink = styled(Link)`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  &:hover { text-decoration: underline; }
`

const AuthorBadge = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10px;
  padding: 2px 6px;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => `${theme.colors.primary}12`};
  color: ${({ theme }) => theme.colors.primary};
  font-weight: 600;
`

const Time = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
`

const CommentText = styled.p`
  margin: 0 0 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text};
  white-space: pre-wrap;
  word-break: break-word;
`

const CommentMediaImg = styled.img`
  max-width: min(300px, 100%);
  max-height: 240px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  display: block;
  margin: 4px 0 6px;
  cursor: pointer;
`

const RowActions = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 4px;
`

const MiniActBtn = styled.button<{ $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 0;
  min-height: 28px;
  border: none;
  background: transparent;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.muted)};
  cursor: pointer;

  &:hover {
    color: ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.text)};
  }
`

const RepliesWrap = styled.div`
  margin-top: 8px;
  padding-left: 14px;
  border-left: 2px solid ${({ theme }) => theme.colors.border};
`

const ErrorMsg = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.action};
`

function authorDisplay(a: PostAuthorInfo) {
  const name = a.orgName ?? a.name
  const avatar = a.orgAvatarUrl ?? a.avatarUrl
  const href =
    a.orgType === 'POLITICIAN' && a.orgId
      ? `/politico/${a.orgId}`
      : a.orgType === 'ENTITY' && a.orgId
        ? `/entidade/${a.orgId}`
        : `/perfil/${a.userId}`
  return { name, avatar, href }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
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
  useEffect(() => {
    if (!parentId && location.hash === '#responder') {
      textareaRef.current?.focus({ preventScroll: true })
      textareaRef.current?.scrollIntoView({ block: 'center' })
    }
  }, [location.hash, location.key, parentId])
  const [content, setContent] = useState('')
  const [attachedMedia, setAttachedMedia] = useState<{
    type: PostCommentMediaType
    url: string
    key?: string
  } | null>(null)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const uploadMedia = useUploadPostCommentMedia()
  const createComment = useCreatePostComment(postId)

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

    createComment.mutate(
      {
        content: trimmed || undefined,
        parentId,
        mediaType: attachedMedia ? attachedMedia.type : PostCommentMediaType.TEXT,
        mediaUrl: attachedMedia?.url,
        mediaKey: attachedMedia?.key,
      },
      {
        onSuccess: () => {
          setContent('')
          setAttachedMedia(null)
          setShowGifPicker(false)
          onDone?.()
        },
        onError: () => {
          setErrorMsg('Não foi possível enviar seu comentário.')
        },
      },
    )
  }

  if (voiceMode) {
    return (
      <div>
        <VoiceRecorder
          onRecorded={handleVoiceRecorded}
          onCancel={() => setVoiceMode(false)}
        />
        {errorMsg && <ErrorMsg style={{ marginTop: 6 }}>{errorMsg}</ErrorMsg>}
      </div>
    )
  }

  return (
    <ComposerLayout $reply={!!parentId}>
      {!parentId && <ComposerAvatar $src={context?.logoUrl ?? user?.avatarUrl} aria-hidden="true">{!(context?.logoUrl ?? user?.avatarUrl) && (context?.name ?? user?.name ?? 'V').charAt(0).toUpperCase()}</ComposerAvatar>}
      <ComposerMain>
      <FormBox onSubmit={handleSubmit}>
        <Textarea
          ref={textareaRef}
          aria-label={parentId ? 'Sua resposta ao comentário' : 'Sua resposta à publicação'}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={1000}
          placeholder={placeholder ?? 'Publique sua resposta…'}
        />

        {attachedMedia && (
          <PreviewBox>
            <img src={attachedMedia.url} alt="Mídia anexada" />
            <RemoveMediaBtn type="button" onClick={() => setAttachedMedia(null)} aria-label="Remover mídia">
              <X size={12} />
            </RemoveMediaBtn>
          </PreviewBox>
        )}

        <ToolBar>
          <ToolIconBtn
            type="button"
            aria-label="Anexar imagem à resposta"
            title="Anexar imagem"
            onClick={() => fileRef.current?.click()}
            disabled={uploadMedia.isPending}
          >
            <ImageIcon size={15} /> Imagem
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
            <FilmStrip size={15} /> GIF
          </ToolIconBtn>

          {canCommentWithAudio && (
            <ToolIconBtn
              type="button"
              aria-label="Gravar resposta em áudio"
              onClick={() => setVoiceMode(true)}
              title="Exclusivo do autor da publicação"
            >
              <Microphone size={15} /> Áudio (autor)
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
              createComment.isPending ||
              uploadMedia.isPending ||
              (!attachedMedia && content.trim().length === 0)
            }
          >
            {createComment.isPending ? 'Enviando...' : parentId ? 'Responder' : 'Comentar'}
          </SubmitBtn>
        </ToolBar>
      </FormBox>

      {showGifPicker && (
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
}: {
  comment: PostCommentDto
  postId: string
  canCommentWithAudio: boolean
  reply?: boolean
}) {
  const user = useAuthStore((s) => s.user)
  const { open: openMedia } = useMediaViewer()
  const deleteComment = useDeletePostComment(postId)
  const [replyOpen, setReplyOpen] = useState(false)
  const [flagOpen, setFlagOpen] = useState(false)

  const author = authorDisplay(comment.author)
  const isOwner = user?.id === comment.author.userId
  const canModerate = user?.type === UserType.ADMIN || user?.type === UserType.MODERATOR

  return (
    <CommentRowWrap $reply={reply}>
      <Avatar to={author.href} $src={author.avatar} $small={reply}>
        {!author.avatar && author.name.charAt(0).toUpperCase()}
      </Avatar>

      <Body>
        <Meta>
          <AuthorLink to={author.href}>{author.name}</AuthorLink>
          {comment.mediaType === PostCommentMediaType.AUDIO && (
            <AuthorBadge>🎙 Áudio do autor</AuthorBadge>
          )}
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

        {comment.replies && comment.replies.length > 0 && (
          <RepliesWrap>
            {comment.replies.map((r) => (
              <CommentRow
                key={r.id}
                comment={r}
                postId={postId}
                canCommentWithAudio={canCommentWithAudio}
                reply
              />
            ))}
          </RepliesWrap>
        )}
      </Body>
    </CommentRowWrap>
  )
}

interface PostCommentsSectionProps {
  postId: string
  canCommentWithAudio: boolean
  commentsCount: number
}

export function PostCommentsSection({ postId, canCommentWithAudio, commentsCount }: PostCommentsSectionProps) {
  const user = useAuthStore((s) => s.user)
  const { data: comments, isLoading, isError, refetch } = usePostComments(postId)

  return (
    <Wrap id="responder" aria-label="Respostas à publicação" style={{ scrollMarginTop: 124 }}>
      <ConversationHeader><h2>Respostas</h2><span>{commentsCount}</span></ConversationHeader>
      {user ? (
        <CommentComposer postId={postId} canCommentWithAudio={canCommentWithAudio} />
      ) : (
        <ConversationState>
          <Link to="/entrar" style={{ fontWeight: 600 }}>Entre</Link> para comentar com texto, imagem ou GIF.
        </ConversationState>
      )}

      {isLoading ? (
        <ConversationState>Carregando respostas…</ConversationState>
      ) : isError ? (
        <ConversationState>Não foi possível carregar as respostas. <MiniActBtn onClick={() => refetch()}>Tentar novamente</MiniActBtn></ConversationState>
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
