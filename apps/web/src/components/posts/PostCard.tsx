import { Fragment, useState, type MouseEvent } from 'react'
import styled, { css, keyframes } from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ArrowsClockwise,
  Broadcast,
  ChatCircle,
  CheckCircle,
  Fire,
  Flag,
  Heart,
  LinkSimple,
  Megaphone,
  Quotes,
  ShareNetwork,
  ShieldCheck,
  Trash,
  UserPlus,
  UserCheck,
} from '@phosphor-icons/react'
import { ContextNoteTargetType, FlagTargetType, PostKind, UserType, legacyMediaItems } from '@votz/shared-types'
import { FEED_MEDIA_MAX_HEIGHT, MediaCarousel } from '../media/MediaCarousel'
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
import { ContextNoteCard } from '../context-notes/ContextNoteCard'
import { ContextNoteMenuScope } from '../context-notes/useContextNoteMenu'
import { ConfirmDialog, OptionsMenu, copyLink, type MenuItem } from '../ui/OptionsMenu'
import { socialRow } from '../ui/social'

interface PostCardProps {
  post: PostDto
  detail?: boolean
  isNew?: boolean
  onQuote?: (post: PostDto) => void
}

const postSlideIn = keyframes`
  0% {
    opacity: 0;
    transform: translateY(-10px);
    box-shadow: 0 0 0 2px rgba(230, 57, 70, 0.28);
  }
  70% {
    opacity: 1;
    transform: translateY(0);
    box-shadow: 0 0 0 2px rgba(230, 57, 70, 0.14);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
    box-shadow: none;
  }
`

const Card = styled.article<{ $advocacy?: boolean; $isNew?: boolean; $detail?: boolean }>`
  ${socialRow}
  padding: ${({ $detail }) => ($detail ? '16px 16px 0' : '14px 16px 10px 68px')};
  position: relative;
  cursor: ${({ $detail }) => ($detail ? 'default' : 'pointer')};
  ${({ $advocacy, theme }) =>
    $advocacy &&
    css`
      border-left: 4px solid ${theme.colors.primary};
    `}
  ${({ $isNew }) =>
    $isNew &&
    css`
      animation: ${postSlideIn} 1.4s ease-out;
    `}

  @media (max-width: 480px) {
    padding: ${({ $detail }) => ($detail ? '14px 14px 0' : '12px 12px 10px 60px')};
  }
  ${({ $detail, theme }) =>
    $detail &&
    css`
      border-bottom: none;
      &:hover {
        background: ${theme.colors.white};
      }
    `}
`

const AdvocacyTag = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.primaryText};
  background: ${({ theme }) => theme.colors.surfaceHover};
  border: 1px solid ${({ theme }) => theme.colors.border};
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  margin-bottom: 10px;
`

const Header = styled.div<{ $detail?: boolean }>`
  position: relative;
  display: flex;
  align-items: ${({ $detail }) => ($detail ? 'center' : 'flex-start')};
  gap: 12px;
  margin-bottom: ${({ $detail }) => ($detail ? '14px' : '4px')};
`

const RepostContext = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 13px;
  font-weight: 600;
  max-width: 100%;
  span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  svg {
    flex-shrink: 0;
  }
  &:hover {
    text-decoration: underline;
  }
`

const Avatar = styled(Link)<{ $src: string | null; $detail?: boolean; $org?: boolean }>`
  position: ${({ $detail }) => ($detail ? 'static' : 'absolute')};
  top: 0;
  left: -52px;
  width: 40px;
  height: 40px;
  border-radius: ${({ $org }) => ($org ? '10px' : '50%')};
  flex-shrink: 0;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : theme.colors.primary)};
  color: ${({ theme }) => theme.colors.onAccent};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  font-size: 0.95rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.9;
  }
  @media (max-width: 480px) {
    left: -48px;
    width: 36px;
    height: 36px;
  }
`

const AuthorCol = styled.div`
  flex: 1;
  min-width: 0;
`

const AuthorTop = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  line-height: 1.3;
`

const AuthorName = styled(Link)`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  font-size: 15px;
  color: ${({ theme }) => theme.colors.text};
  &:hover {
    text-decoration: underline;
  }
`

const InlineMeta = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  font-variant-numeric: tabular-nums;
`

const TimeLink = styled(Link)`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  font-variant-numeric: tabular-nums;
  &:hover {
    text-decoration: underline;
  }
`

const ReasonTag = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.muted};
`

const RolePill = styled.span`
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.neutral};
  color: ${({ theme }) => theme.colors.muted};
`

const SubLine = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 1px;
`

const FollowMiniBtn = styled.button<{ $following?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ $following, theme }) => ($following ? theme.colors.border : theme.colors.text)};
  background: ${({ $following, theme }) => ($following ? theme.colors.white : theme.colors.text)};
  color: ${({ $following, theme }) => ($following ? theme.colors.text : theme.colors.white)};
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.88;
  }
`

const BodyText = styled.div<{ $detail?: boolean }>`
  font-size: ${({ $detail }) => ($detail ? '18px' : '15px')};
  line-height: ${({ $detail }) => ($detail ? '1.48' : '1.45')};
  color: ${({ theme }) => theme.colors.text};
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 10px;

  @media (max-width: 480px) {
    font-size: ${({ $detail }) => ($detail ? '17px' : '15px')};
  }
`

const TopicLink = styled(Link)`
  color: ${({ theme }) => theme.colors.action};
  font-weight: 600;
  &:hover {
    text-decoration: underline;
  }
`

const MentionSpan = styled.span`
  color: ${({ theme }) => theme.colors.info};
  font-weight: 500;
`

const ExternalLink = styled.a`
  color: ${({ theme }) => theme.colors.info};
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`

const PollBox = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 14px;
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
  font-variant-numeric: tabular-nums;

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
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
`

const EmbedCard = styled(Link)`
  display: block;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 12px;
  background: ${({ theme }) => theme.colors.surfaceHover};
  transition: border-color 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const EmbedKicker = styled.div`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: ${({ theme }) => theme.colors.primaryText};
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
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  font-variant-numeric: tabular-nums;
`

const QuoteCard = styled(Link)`
  display: block;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 12px;
  background: ${({ theme }) => theme.colors.white};
  transition: background 0.15s, border-color 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
    border-color: ${({ theme }) => theme.colors.borderStrong};
  }
`

const QuoteHead = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
`

const QuoteAvatar = styled.span<{ $src: string | null; $org?: boolean }>`
  width: 20px;
  height: 20px;
  border-radius: ${({ $org }) => ($org ? '5px' : '50%')};
  flex-shrink: 0;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : theme.colors.primary)};
  color: ${({ theme }) => theme.colors.onAccent};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 10px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`

const QuoteAuthor = styled.span`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 13.5px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`

const QuoteMeta = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  font-variant-numeric: tabular-nums;
`

const QuoteBody = styled.div`
  font-size: 14px;
  line-height: 1.45;
  color: ${({ theme }) => theme.colors.text};
  white-space: pre-wrap;
  word-break: break-word;
`

const QuoteMediaImg = styled.img`
  display: block;
  width: 100%;
  max-height: 200px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  margin-top: 8px;
`

const PublishedAt = styled.time`
  display: block;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
  margin-top: 14px;
  padding-bottom: 12px;
`

const DetailMetrics = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 12px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  font-variant-numeric: tabular-nums;

  strong {
    color: ${({ theme }) => theme.colors.text};
    font-weight: 700;
  }
`

const ActionsBar = styled.div<{ $detail?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${({ $detail }) => ($detail ? 'space-around' : 'space-between')};
  max-width: ${({ $detail }) => ($detail ? 'none' : '460px')};
  margin-left: ${({ $detail }) => ($detail ? '0' : '-8px')};
  padding: ${({ $detail }) => ($detail ? '6px 0' : '4px 0 0')};
  ${({ $detail, theme }) =>
    $detail &&
    css`
      border-top: 1px solid ${theme.colors.border};
      border-bottom: 1px solid ${theme.colors.border};
    `}
`

type ActionTone = 'reply' | 'repost' | 'like' | 'share'

const ActBtn = styled.button<{ $active?: boolean; $tone?: ActionTone }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 10px;
  min-height: 36px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: none;
  background: transparent;
  color: ${({ $active, $tone, theme }) => {
    if ($active && $tone === 'repost') return theme.colors.positiveText
    if ($active && $tone === 'like') return theme.colors.action
    return theme.colors.muted
  }};
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: ${({ $tone, theme }) => {
      if ($tone === 'repost') return `${theme.colors.positive}1A`
      if ($tone === 'like') return `${theme.colors.action}14`
      return `${theme.colors.info}14`
    }};
    color: ${({ $tone, theme }) => {
      if ($tone === 'repost') return theme.colors.positiveText
      if ($tone === 'like') return theme.colors.action
      return theme.colors.info
    }};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.action};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  @media (max-width: 480px) {
    padding: 6px 8px;
    gap: 4px;
  }
`

const PopoverContent = styled(DropdownMenu.Content)`
  min-width: 196px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  box-shadow: ${({ theme }) => theme.shadows.md};
  padding: 4px;
  z-index: 60;
`

const PopoverItem = styled(DropdownMenu.Item)`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  outline: none;

  &:hover,
  &[data-highlighted] {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

function resolveAuthor(a: PostAuthorInfo) {
  const name = a.orgName ?? a.name
  const avatar = a.orgAvatarUrl ?? a.avatarUrl
  const verified = a.orgType ? a.orgVerified : a.verified
  const isOrg = a.orgType === 'ENTITY' || a.orgType === 'COMPANY'
  const href =
    a.orgType === 'POLITICIAN' && a.orgId
      ? `/politico/${a.orgId}`
      : a.orgType === 'ENTITY' && a.orgId
        ? `/entidade/${a.orgId}`
        : a.orgType === 'COMPANY' && a.orgId
          ? `/empresa/${a.orgId}`
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
  const followTargetId =
    a.orgType === 'POLITICIAN' || a.orgType === 'ENTITY' ? a.orgId ?? undefined : a.userId
  return { name, avatar, verified, isOrg, href, badge, followTargetType, followTargetId }
}

function normalizeTagSlug(raw: string) {
  return raw
    .replace(/^#/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function renderRichContent(text: string) {
  const tokenRegex = /(https?:\/\/[^\s<>()]+|#[\p{L}\p{N}_]{2,40}|@[\p{L}\p{N}_.]{2,30})/gu
  const parts = text.split(tokenRegex)
  return parts.map((part, idx) => {
    if (/^https?:\/\//i.test(part)) {
      const cleanLabel = part.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 42)
      return (
        <ExternalLink key={idx} href={part} target="_blank" rel="noopener noreferrer">
          {cleanLabel}
          {part.replace(/^https?:\/\/(www\.)?/i, '').length > 42 ? '…' : ''}
        </ExternalLink>
      )
    }
    if (/^#[\p{L}\p{N}_]{2,40}$/u.test(part)) {
      return (
        <TopicLink key={idx} to={`/pautas/${normalizeTagSlug(part)}`}>
          {part}
        </TopicLink>
      )
    }
    if (/^@[\p{L}\p{N}_.]{2,30}$/u.test(part)) {
      return <MentionSpan key={idx}>{part}</MentionSpan>
    }
    return <Fragment key={idx}>{part}</Fragment>
  })
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

function formatDetailDate(iso: string): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const day = date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${time} · ${day}`
}

export function PostCard({ post, detail = false, isNew = false, onQuote }: PostCardProps) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { open: openMedia } = useMediaViewer()
  // Padrão de formatos; publicação de API antiga (sem `mediaItems`) cai nos links, medidos ao carregar.
  const mediaItems = post.mediaItems?.length ? post.mediaItems : legacyMediaItems(post.media)

  const [flagOpen, setFlagOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

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

  const menuItems: MenuItem[] = [
    { key: 'link', label: 'Copiar link', icon: <LinkSimple size={18} />, onSelect: () => copyLink(`/publicacoes/${post.id}`) },
    ...(!isOwner
      ? [{ key: 'flag', label: 'Denunciar publicação', icon: <Flag size={18} />, onSelect: () => (user ? setFlagOpen(true) : navigate('/entrar')) }]
      : []),
    ...(isOwner || canModerate
      ? [{ key: 'delete', label: 'Excluir publicação', icon: <Trash size={18} />, danger: true, onSelect: () => setConfirmDelete(true) }]
      : []),
  ]

  function handleShare() {
    const url = `${window.location.origin}/publicacoes/${post.id}`
    if (navigator.share) {
      navigator.share({ title: `${author.name} no Votz`, url }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(url).catch(() => {})
    }
  }

  function handleCardClick(e: MouseEvent<HTMLElement>) {
    if (detail) return
    const selection = window.getSelection()?.toString()
    if (selection) return
    const target = e.target as HTMLElement | null
    if (target?.closest('a, button, input, textarea, select, video, [role="button"], [role="menu"], [role="menuitem"]')) {
      return
    }
    navigate(`/publicacoes/${post.id}`)
  }

  const handleTag = !post.author.orgName && post.author.username ? `@${post.author.username}` : null
  const locationLabel = [post.city, post.state].filter(Boolean).join(' · ')
  const detailSubParts = [handleTag, post.author.orgSubtitle, locationLabel].filter(Boolean)
  const hasAnyMetrics = post.commentsCount > 0 || post.repostsCount > 0 || post.likesCount > 0

  const quoteAuthor = post.quotePost ? resolveAuthor(post.quotePost.author) : null
  const quoteThumb =
    post.quotePost?.mediaItems?.[0]?.thumbUrl ??
    post.quotePost?.mediaItems?.[0]?.url ??
    post.quotePost?.media?.[0] ??
    null

  return (
    <Card
      $advocacy={post.kind === PostKind.ADVOCACY}
      $isNew={isNew}
      $detail={detail}
      onClick={handleCardClick}
      aria-label={detail ? 'Publicação' : undefined}
    >
      {!detail && post.feedReason && (
        <ReasonTag>
          <Fire size={14} weight="fill" />
          <span>{post.feedReason}</span>
        </ReasonTag>
      )}
      {!detail && post.repost && (
        <RepostContext to={`/perfil/${post.repost.user.id}`}>
          <ArrowsClockwise size={14} />
          <span>{post.repost.user.name} repostou</span>
        </RepostContext>
      )}
      {post.kind === PostKind.ADVOCACY && (
        <AdvocacyTag>
          <ShieldCheck size={14} weight="duotone" />
          Avocação Oficial de Relato
        </AdvocacyTag>
      )}

      <Header $detail={detail}>
        <Avatar to={author.href} $src={author.avatar} $detail={detail} $org={author.isOrg}>
          {!author.avatar && author.name.charAt(0).toUpperCase()}
        </Avatar>

        <AuthorCol>
          <AuthorTop>
            <AuthorName to={author.href}>{author.name}</AuthorName>
            {author.verified && <CheckCircle size={15} weight="fill" color="#2DC653" />}
            {author.badge && <RolePill>{author.badge}</RolePill>}
            {!detail && handleTag && <InlineMeta>{handleTag}</InlineMeta>}
            {!detail && (
              <>
                <InlineMeta>·</InlineMeta>
                <TimeLink to={`/publicacoes/${post.id}`}>{timeAgo(post.createdAt)}</TimeLink>
              </>
            )}
          </AuthorTop>

          {!detail && (post.author.orgSubtitle || locationLabel) && (
            <SubLine>
              {post.author.orgSubtitle && <span>{post.author.orgSubtitle}</span>}
              {post.author.orgSubtitle && locationLabel && <span>·</span>}
              {locationLabel && <span>{locationLabel}</span>}
            </SubLine>
          )}

          {detail && detailSubParts.length > 0 && (
            <SubLine>{detailSubParts.join(' · ')}</SubLine>
          )}
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

        <ContextNoteMenuScope targetType={ContextNoteTargetType.POST} targetId={post.id} isOwner={isOwner}>
          {(contextItems) => <OptionsMenu label="Mais opções da publicação" items={[...menuItems, ...contextItems]} />}
        </ContextNoteMenuScope>
      </Header>

      {post.content && <BodyText $detail={detail}>{renderRichContent(post.content)}</BodyText>}

      {mediaItems.length > 0 && (
        <MediaCarousel
          items={mediaItems}
          label="Fotos e vídeos da publicação"
          maxHeight={FEED_MEDIA_MAX_HEIGHT}
          onOpen={(idx) =>
            openMedia(
              mediaItems
                .filter((item) => item.status === 'READY' && item.fullUrl)
                .map((item) => ({ url: item.fullUrl!, type: item.kind === 'VIDEO' ? 'video' : 'image' })),
              mediaItems.slice(0, idx).filter((item) => item.status === 'READY' && item.fullUrl).length,
            )
          }
        />
      )}

      <ContextNoteCard type={ContextNoteTargetType.POST} id={post.id} />

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
            <Megaphone size={13} /> Relato Mencionado · Pressão {Math.round(post.mentionedReport.pressureScore)}
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
            Por {post.mentionedDebate.creator?.name ?? post.mentionedDebate.hostEntity?.legalName ?? 'Votz'} ·{' '}
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

      {post.quotePost && quoteAuthor && (
        <QuoteCard to={`/publicacoes/${post.quotePost.id}`}>
          <QuoteHead>
            <QuoteAvatar $src={quoteAuthor.avatar} $org={quoteAuthor.isOrg}>
              {!quoteAuthor.avatar && quoteAuthor.name.charAt(0).toUpperCase()}
            </QuoteAvatar>
            <QuoteAuthor>{quoteAuthor.name}</QuoteAuthor>
            {quoteAuthor.verified && <CheckCircle size={13} weight="fill" color="#2DC653" />}
            {!post.quotePost.author.orgName && post.quotePost.author.username && (
              <QuoteMeta>@{post.quotePost.author.username}</QuoteMeta>
            )}
            <QuoteMeta>· {timeAgo(post.quotePost.createdAt)}</QuoteMeta>
          </QuoteHead>
          {post.quotePost.content && (
            <QuoteBody>
              {post.quotePost.content.length > 240
                ? `${post.quotePost.content.slice(0, 240)}…`
                : post.quotePost.content}
            </QuoteBody>
          )}
          {quoteThumb && <QuoteMediaImg src={quoteThumb} alt="Mídia da publicação citada" loading="lazy" />}
        </QuoteCard>
      )}

      {detail && (
        <PublishedAt dateTime={post.createdAt}>
          {formatDetailDate(post.createdAt)}
        </PublishedAt>
      )}

      {detail && hasAnyMetrics && (
        <DetailMetrics aria-label="Resumo de interações">
          {post.commentsCount > 0 && (
            <span>
              <strong>{post.commentsCount}</strong> {post.commentsCount === 1 ? 'resposta' : 'respostas'}
            </span>
          )}
          {post.repostsCount > 0 && (
            <span>
              <strong>{post.repostsCount}</strong> {post.repostsCount === 1 ? 'repost' : 'reposts'}
            </span>
          )}
          {post.likesCount > 0 && (
            <span>
              <strong>{post.likesCount}</strong> {post.likesCount === 1 ? 'curtida' : 'curtidas'}
            </span>
          )}
        </DetailMetrics>
      )}

      <ActionsBar $detail={detail}>
        <ActBtn
          as={Link}
          to={`/publicacoes/${post.id}#responder`}
          $tone="reply"
          aria-label="Responder à publicação"
          title="Responder"
        >
          <ChatCircle size={detail ? 19 : 17} />
          {!detail && post.commentsCount > 0 && <span>{post.commentsCount}</span>}
        </ActBtn>

        {onQuote && user ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <ActBtn
                type="button"
                $tone="repost"
                $active={post.repostedByMe}
                aria-pressed={post.repostedByMe}
                disabled={toggleRepost.isPending}
                aria-label="Repostar ou citar publicação"
                title="Repostar ou citar"
              >
                <ArrowsClockwise size={detail ? 19 : 17} weight={post.repostedByMe ? 'bold' : 'regular'} />
                {!detail && post.repostsCount > 0 && <span>{post.repostsCount}</span>}
              </ActBtn>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <PopoverContent align="start" sideOffset={6}>
                <PopoverItem onSelect={() => toggleRepost.mutate(post.id)}>
                  <ArrowsClockwise size={16} />
                  {post.repostedByMe ? 'Desfazer repost' : 'Repostar'}
                </PopoverItem>
                <PopoverItem onSelect={() => onQuote(post)}>
                  <Quotes size={16} />
                  Citar publicação
                </PopoverItem>
              </PopoverContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : (
          <ActBtn
            type="button"
            $tone="repost"
            $active={post.repostedByMe}
            aria-pressed={post.repostedByMe}
            disabled={toggleRepost.isPending}
            onClick={() => (user ? toggleRepost.mutate(post.id) : navigate('/entrar'))}
            aria-label={post.repostedByMe ? 'Desfazer repost' : 'Repostar'}
            title="Repostar"
          >
            <ArrowsClockwise size={detail ? 19 : 17} weight={post.repostedByMe ? 'bold' : 'regular'} />
            {!detail && post.repostsCount > 0 && <span>{post.repostsCount}</span>}
          </ActBtn>
        )}

        <ActBtn
          type="button"
          $tone="like"
          $active={post.likedByMe}
          aria-label={post.likedByMe ? 'Descurtir publicação' : 'Curtir publicação'}
          aria-pressed={post.likedByMe}
          title={post.likedByMe ? 'Descurtir' : 'Curtir'}
          onClick={() => (user ? toggleLike.mutate(post.id) : navigate('/entrar'))}
        >
          <Heart size={detail ? 19 : 17} weight={post.likedByMe ? 'fill' : 'regular'} />
          {!detail && post.likesCount > 0 && <span>{post.likesCount}</span>}
        </ActBtn>

        <ActBtn type="button" $tone="share" onClick={handleShare} aria-label="Compartilhar publicação" title="Compartilhar">
          <ShareNetwork size={detail ? 19 : 17} />
        </ActBtn>
      </ActionsBar>

      {confirmDelete && (
        <ConfirmDialog
          title="Excluir esta publicação?"
          text="Ela some para todo mundo e não dá para desfazer."
          confirmLabel="Excluir"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false)
            deletePost.mutate(post.id, { onSuccess: () => { if (detail) navigate('/?tab=publicacoes') } })
          }}
        />
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
