import { useState } from 'react'
import styled, { css } from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowsClockwise,
  Broadcast,
  ChatCircle,
  CheckCircle,
  Flag,
  Heart,
  Megaphone,
  Quotes,
  ShareNetwork,
  ShieldCheck,
  Trash,
  UserPlus,
  UserCheck,
} from '@phosphor-icons/react'
import { FlagTargetType, PostKind, UserType } from '@votz/shared-types'
import { PostAuthorInfo, PostDto } from '../../types/api'
import {
  useDeletePost,
  useTogglePostLike,
  useTogglePostRepost,
  useVoteDebatePollInline,
  useVotePostPoll,
} from '../../hooks/usePosts'
import { useIsFollowingTarget, useToggleFollowTarget } from '../../hooks/useFollow'
import { useAuthStore } from '../../store/auth.store'
import { useMediaViewer } from '../ui/MediaViewer'
import { FlagContentModal } from '../moderation/FlagContentModal'
import { PostCommentsSection } from './PostCommentsSection'

interface PostCardProps {
  post: PostDto
  showCommentsInline?: boolean
  onQuote?: (post: PostDto) => void
}

const Card = styled.article<{ $advocacy?: boolean }>`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ $advocacy, theme }) => ($advocacy ? theme.colors.primary : theme.colors.border)};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 18px 20px;
  transition: border-color 0.15s, box-shadow 0.15s;
  ${({ $advocacy, theme }) =>
    $advocacy &&
    css`
      border-left: 4px solid ${theme.colors.primary};
    `}

  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.sm};
  }
`

const AdvocacyTag = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.primary};
  background: ${({ theme }) => `${theme.colors.primary}10`};
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  margin-bottom: 10px;
`

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 10px;
`

const Avatar = styled(Link)<{ $src: string | null }>`
  width: 42px;
  height: 42px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : theme.colors.primary)};
  color: ${({ theme }) => theme.colors.white};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  font-size: 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`

const AuthorCol = styled.div`
  flex: 1;
  min-width: 0;
`

const AuthorTop = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`

const AuthorName = styled(Link)`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.text};
  &:hover { text-decoration: underline; }
`

const RolePill = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10px;
  padding: 2px 6px;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.neutral};
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
`

const SubLine = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 2px;
`

const FollowMiniBtn = styled.button<{ $following?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ $following, theme }) => ($following ? theme.colors.border : theme.colors.primary)};
  background: ${({ $following, theme }) => ($following ? theme.colors.white : theme.colors.primary)};
  color: ${({ $following, theme }) => ($following ? theme.colors.text : theme.colors.white)};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
`

const BodyText = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.md};
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.text};
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 10px;
`

const TopicLink = styled(Link)`
  color: ${({ theme }) => theme.colors.action};
  font-weight: 600;
  &:hover { text-decoration: underline; }
`

const MediaGrid = styled.div<{ $count: number }>`
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
  border-radius: ${({ theme }) => theme.radii.lg};
  overflow: hidden;
  grid-template-columns: ${({ $count }) => ($count === 1 ? '1fr' : 'repeat(2, 1fr)')};
`

const MediaTile = styled.div<{ $single?: boolean }>`
  position: relative;
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
  max-height: ${({ $single }) => ($single ? '520px' : '260px')};
  aspect-ratio: ${({ $single }) => ($single ? 'auto' : '4 / 3')};

  img {
    width: 100%;
    height: 100%;
    max-height: ${({ $single }) => ($single ? '520px' : '260px')};
    object-fit: cover;
    display: block;
    cursor: pointer;
  }

  video {
    width: 100%;
    max-height: 460px;
    display: block;
    background: #0d0d0d;
  }
`

const PollBox = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 12px 14px;
  margin-bottom: 12px;
  background: ${({ theme }) => theme.colors.surfaceHover};
`

const PollQuestion = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 8px;
`

const PollOptionBtn = styled.button<{ $voted: boolean; $mine: boolean; $pct: number }>`
  position: relative;
  width: 100%;
  text-align: left;
  padding: 9px 12px;
  margin-bottom: 6px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ $mine, theme }) => ($mine ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme }) => theme.colors.white};
  cursor: ${({ $voted }) => ($voted ? 'default' : 'pointer')};
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};

  &::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: ${({ $voted, $pct }) => ($voted ? `${$pct}%` : '0%')};
    background: ${({ $mine, theme }) =>
      $mine ? `${theme.colors.primary}1F` : `${theme.colors.muted}1A`};
    transition: width 0.25s ease;
    pointer-events: none;
  }

  > * {
    position: relative;
  }
`

const PollMeta = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 4px;
`

const EmbedCard = styled(Link)`
  display: block;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 12px 14px;
  margin-bottom: 12px;
  background: ${({ theme }) => theme.colors.surfaceHover};
  transition: border-color 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const EmbedKicker = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.primary};
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
`

const EmbedTitle = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`

const EmbedSub = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
`

const ActionsBar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px dashed ${({ theme }) => theme.colors.border};
  flex-wrap: wrap;
`

const ActBtn = styled.button<{ $active?: boolean; $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: none;
  background: ${({ $active, theme }) => ($active ? `${theme.colors.action}12` : 'transparent')};
  color: ${({ $active, $danger, theme }) =>
    $danger ? theme.colors.action : $active ? theme.colors.action : theme.colors.muted};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral};
    color: ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.text)};
  }

  span.ct {
    font-family: ${({ theme }) => theme.fonts.mono};
  }
`

const Spacer = styled.div`
  flex: 1;
`

const InlineCommentsWrap = styled.div`
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

function resolveAuthor(a: PostAuthorInfo) {
  const name = a.orgName ?? a.name
  const avatar = a.orgAvatarUrl ?? a.avatarUrl
  const verified = a.orgType ? a.orgVerified : a.verified
  const href =
    a.orgType === 'POLITICIAN' && a.orgId
      ? `/politico/${a.orgId}`
      : a.orgType === 'ENTITY' && a.orgId
        ? `/entidade/${a.orgId}`
        : `/perfil/${a.userId}`
  const badge =
    a.orgType === 'POLITICIAN'
      ? 'Político'
      : a.orgType === 'ENTITY'
        ? 'Entidade'
        : a.orgType === 'COMPANY'
          ? 'Empresa'
          : a.userType === UserType.PRESS
            ? 'Imprensa'
            : null
  const followTargetType: 'USER' | 'POLITICIAN' | 'ENTITY' =
    a.orgType === 'POLITICIAN'
      ? 'POLITICIAN'
      : a.orgType === 'ENTITY'
        ? 'ENTITY'
        : 'USER'
  const followTargetId = a.orgType === 'POLITICIAN' || a.orgType === 'ENTITY' ? a.orgId ?? undefined : a.userId
  return { name, avatar, verified, href, badge, followTargetType, followTargetId }
}

function normalizeTagSlug(raw: string) {
  return raw
    .replace(/^#/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function renderContentWithTopics(text: string) {
  const parts = text.split(/(#[\p{L}\p{N}_]{2,40})/gu)
  return parts.map((part, idx) => {
    if (/^#[\p{L}\p{N}_]{2,40}$/u.test(part)) {
      return (
        <TopicLink key={idx} to={`/pautas/${normalizeTagSlug(part)}`}>
          {part}
        </TopicLink>
      )
    }
    return <span key={idx}>{part}</span>
  })
}

function isVideoUrl(url: string) {
  return /\.(mp4|mov|webm|mkv)(\?|$)/i.test(url)
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'agora'
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

export function PostCard({ post, showCommentsInline = false, onQuote }: PostCardProps) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { open: openMedia } = useMediaViewer()

  const [commentsExpanded, setCommentsExpanded] = useState(showCommentsInline)
  const [flagOpen, setFlagOpen] = useState(false)

  const toggleLike = useTogglePostLike()
  const toggleRepost = useTogglePostRepost()
  const deletePost = useDeletePost()
  const votePoll = useVotePostPoll(post.id)
  const voteDebatePoll = useVoteDebatePollInline(
    post.id,
    post.mentionedDebatePoll?.debateId ?? '',
    post.mentionedDebatePoll?.id ?? '',
  )

  const author = resolveAuthor(post.author)
  const isOwner = user?.id === post.author.userId
  const canModerate = user?.type === UserType.ADMIN || user?.type === UserType.MODERATOR

  const { data: followState } = useIsFollowingTarget(author.followTargetType, author.followTargetId)
  const toggleFollow = useToggleFollowTarget(author.followTargetType, author.followTargetId)

  const showFollowBtn =
    !!user &&
    !!author.followTargetId &&
    (author.followTargetType !== 'USER' || user.id !== post.author.userId)

  function handleShare() {
    const url = `${window.location.origin}/publicacoes/${post.id}`
    if (navigator.share) {
      navigator.share({ title: `${author.name} no Votz`, url }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(url).catch(() => {})
    }
  }

  return (
    <Card $advocacy={post.kind === PostKind.ADVOCACY}>
      {post.kind === PostKind.ADVOCACY && (
        <AdvocacyTag>
          <ShieldCheck size={14} weight="duotone" />
          Avocação Oficial de Relato
        </AdvocacyTag>
      )}

      <Header>
        <Avatar to={author.href} $src={author.avatar}>
          {!author.avatar && author.name.charAt(0).toUpperCase()}
        </Avatar>

        <AuthorCol>
          <AuthorTop>
            <AuthorName to={author.href}>{author.name}</AuthorName>
            {author.verified && <CheckCircle size={15} weight="fill" color="#2DC653" />}
            {author.badge && <RolePill>{author.badge}</RolePill>}
          </AuthorTop>
          <SubLine>
            {post.author.orgSubtitle && <span>{post.author.orgSubtitle} ·</span>}
            {(post.city || post.state) && (
              <span>{[post.city, post.state].filter(Boolean).join(' · ')} ·</span>
            )}
            <Link to={`/publicacoes/${post.id}`}>{timeAgo(post.createdAt)}</Link>
          </SubLine>
        </AuthorCol>

        {showFollowBtn && (
          <FollowMiniBtn
            type="button"
            $following={followState?.following}
            disabled={toggleFollow.isPending}
            onClick={() => toggleFollow.mutate()}
          >
            {followState?.following ? (
              <>
                <UserCheck size={13} /> Seguindo
              </>
            ) : (
              <>
                <UserPlus size={13} /> Seguir
              </>
            )}
          </FollowMiniBtn>
        )}
      </Header>

      {post.content && <BodyText>{renderContentWithTopics(post.content)}</BodyText>}

      {post.media.length > 0 && (
        <MediaGrid $count={post.media.length}>
          {post.media.map((url, idx) => (
            <MediaTile key={url} $single={post.media.length === 1}>
              {isVideoUrl(url) ? (
                <video src={url} controls playsInline preload="metadata" />
              ) : (
                <img
                  src={url}
                  alt={`Mídia ${idx + 1}`}
                  loading="lazy"
                  onClick={() =>
                    openMedia(
                      post.media.map((m) => ({ url: m, type: isVideoUrl(m) ? 'video' : 'image' })),
                      idx,
                    )
                  }
                />
              )}
            </MediaTile>
          ))}
        </MediaGrid>
      )}

      {post.poll && (
        <PollBox>
          {post.poll.question && <PollQuestion>{post.poll.question}</PollQuestion>}
          {post.poll.options.map((opt) => {
            const hasVoted = !!post.poll!.myVoteOptionId || post.poll!.expired
            const pct =
              post.poll!.totalVotes > 0
                ? Math.round((opt.votesCount / post.poll!.totalVotes) * 100)
                : 0
            return (
              <PollOptionBtn
                key={opt.id}
                type="button"
                $voted={hasVoted}
                $mine={post.poll!.myVoteOptionId === opt.id}
                $pct={pct}
                disabled={hasVoted || votePoll.isPending || !user}
                onClick={() => votePoll.mutate(opt.id)}
              >
                <span>{opt.text}</span>
                {hasVoted && <strong>{pct}%</strong>}
              </PollOptionBtn>
            )
          })}
          <PollMeta>
            {post.poll.totalVotes} {post.poll.totalVotes === 1 ? 'voto' : 'votos'} ·{' '}
            {post.poll.expired ? 'Encerrada' : 'Aberta'}
          </PollMeta>
        </PollBox>
      )}

      {post.mentionedReport && (
        <EmbedCard to={`/relatos/${post.mentionedReport.id}`}>
          <EmbedKicker>
            <Megaphone size={13} /> Relato Mencionado · Pressão {post.mentionedReport.pressureScore.toFixed(1)}
          </EmbedKicker>
          <EmbedTitle>{post.mentionedReport.title}</EmbedTitle>
          <EmbedSub>
            {[post.mentionedReport.city, post.mentionedReport.state].filter(Boolean).join(' · ') || 'Brasil'} ·{' '}
            {post.mentionedReport._count.votes} apoios · {post.mentionedReport._count.comments} comentários
          </EmbedSub>
        </EmbedCard>
      )}

      {post.mentionedDebate && (
        <EmbedCard to={`/debates/${post.mentionedDebate.id}`}>
          <EmbedKicker>
            <Broadcast size={13} /> Debate · {post.mentionedDebate.status}
          </EmbedKicker>
          <EmbedTitle>{post.mentionedDebate.title}</EmbedTitle>
          <EmbedSub>
            Por {post.mentionedDebate.creator.name} ·{' '}
            {new Date(post.mentionedDebate.scheduledFor).toLocaleDateString('pt-BR')}
          </EmbedSub>
        </EmbedCard>
      )}

      {post.mentionedProposta && (
        <EmbedCard to={`/propostas/${post.mentionedProposta.id}`}>
          <EmbedKicker>Proposta Legislativa · {post.mentionedProposta.status}</EmbedKicker>
          <EmbedTitle>{post.mentionedProposta.titulo}</EmbedTitle>
          <EmbedSub>{post.mentionedProposta.politico.name}</EmbedSub>
        </EmbedCard>
      )}

      {post.mentionedDebatePoll && (
        <PollBox>
          <EmbedKicker>
            <Broadcast size={13} /> Enquete do Debate: {post.mentionedDebatePoll.debateTitle}
          </EmbedKicker>
          <PollQuestion>{post.mentionedDebatePoll.question}</PollQuestion>
          {(() => {
            const total = post.mentionedDebatePoll.options.reduce((s, o) => s + o.totalVotes, 0)
            const votedOrClosed =
              !!post.mentionedDebatePoll.myVoteOptionId || !post.mentionedDebatePoll.active
            return post.mentionedDebatePoll.options.map((opt) => {
              const pct = total > 0 ? Math.round((opt.totalVotes / total) * 100) : 0
              return (
                <PollOptionBtn
                  key={opt.id}
                  type="button"
                  $voted={votedOrClosed}
                  $mine={post.mentionedDebatePoll!.myVoteOptionId === opt.id}
                  $pct={pct}
                  disabled={votedOrClosed || voteDebatePoll.isPending || !user}
                  onClick={() => voteDebatePoll.mutate(opt.id)}
                >
                  <span>{opt.text}</span>
                  {votedOrClosed && <strong>{pct}%</strong>}
                </PollOptionBtn>
              )
            })
          })()}
        </PollBox>
      )}

      {post.quotePost && (
        <EmbedCard to={`/publicacoes/${post.quotePost.id}`}>
          <EmbedKicker>
            <Quotes size={13} /> {post.quotePost.author.orgName ?? post.quotePost.author.name}
          </EmbedKicker>
          <EmbedTitle style={{ fontWeight: 500 }}>
            {post.quotePost.content.slice(0, 180)}
          </EmbedTitle>
        </EmbedCard>
      )}

      <ActionsBar>
        <ActBtn
          type="button"
          $active={post.likedByMe}
          onClick={() => (user ? toggleLike.mutate(post.id) : navigate('/entrar'))}
        >
          <Heart size={16} weight={post.likedByMe ? 'fill' : 'regular'} />
          <span className="ct">{post.likesCount}</span>
        </ActBtn>

        <ActBtn
          type="button"
          onClick={() => {
            if (showCommentsInline) {
              setCommentsExpanded((v) => !v)
            } else {
              setCommentsExpanded((v) => !v)
            }
          }}
        >
          <ChatCircle size={16} />
          <span className="ct">{post.commentsCount}</span>
        </ActBtn>

        <ActBtn
          type="button"
          $active={post.repostedByMe}
          onClick={() => (user ? toggleRepost.mutate(post.id) : navigate('/entrar'))}
          title="Repostar"
        >
          <ArrowsClockwise size={16} />
          <span className="ct">{post.repostsCount}</span>
        </ActBtn>

        {onQuote && user && (
          <ActBtn type="button" onClick={() => onQuote(post)} title="Citar publicação">
            <Quotes size={15} /> Citar
          </ActBtn>
        )}

        <Spacer />

        {user && !isOwner && (
          <ActBtn type="button" onClick={() => setFlagOpen(true)} title="Sinalizar">
            <Flag size={15} />
          </ActBtn>
        )}

        {(isOwner || canModerate) && (
          <ActBtn
            $danger
            type="button"
            disabled={deletePost.isPending}
            onClick={() => deletePost.mutate(post.id)}
            title="Excluir publicação"
          >
            <Trash size={15} />
          </ActBtn>
        )}

        <ActBtn type="button" onClick={handleShare} title="Compartilhar">
          <ShareNetwork size={15} />
        </ActBtn>
      </ActionsBar>

      {commentsExpanded && (
        <InlineCommentsWrap>
          <PostCommentsSection
            postId={post.id}
            canCommentWithAudio={post.canCommentWithAudio}
          />
        </InlineCommentsWrap>
      )}

      <FlagContentModal
        isOpen={flagOpen}
        targetType={FlagTargetType.POST}
        targetId={post.id}
        onClose={() => setFlagOpen(false)}
      />
    </Card>
  )
}
