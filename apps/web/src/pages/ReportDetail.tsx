import { useState } from 'react'
import styled from 'styled-components'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowUp, UsersThree, Flag, LinkSimple, FileText } from '@phosphor-icons/react'
import { OptionsMenu, copyLink } from '../components/ui/OptionsMenu'
import { VoteType, EventType, RecipientType, UserType, FlagTargetType, legacyMediaItems, timelineEventLabel } from '@votz/shared-types'
import { MediaCarousel } from '../components/media/MediaCarousel'
import { Navbar } from '../components/layout/Navbar'
import { CategoryBadge, StatusBadge } from '../components/ui/Badge'
import { PressureBar } from '../components/ui/PressureBar'
import { Button } from '../components/ui/Button'
import { CommentsSection } from '../components/comments/CommentsSection'
import { FlagContentModal } from '../components/moderation/FlagContentModal'
import { ContextNoteCard } from '../components/context-notes/ContextNoteCard'
import { ContextNoteMenuScope } from '../components/context-notes/useContextNoteMenu'
import { ContextNoteTargetType } from '@votz/shared-types'
import { useMediaViewer } from '../components/ui/MediaViewer'
import {
  AdvocacyActionsCard,
  AdvocacyCommitments,
  DisputeCard,
  LifecycleNotice,
  ProgressCard,
  orgProfilePath,
} from '../components/report-lifecycle/ReportLifecycle'
import { OrgContextPrompt } from '../components/ui/OrgContextPrompt'
import { PressContactCard } from '../components/press/PressContactCard'
import { useReport, useFollowers, useFollowStatus, useFollowReport } from '../hooks/useReport'
import { useVote, useMyVotes } from '../hooks/useVote'
import { useMyProfiles } from '../hooks/useAuth'
import { useAuthStore } from '../store/auth.store'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import { TimelineEvent } from '../types/api'
import { usePolitician, usePoliticians } from '../hooks/usePoliticians'
import { useEntities } from '../hooks/useEntities'
import { thumbUrl } from '../lib/image-thumb'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 1480px;
  margin: 0 auto;
  padding: 24px 32px 64px;

  @media (max-width: 820px) { padding: 16px 16px 48px; }
`

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 24px;
  transition: color 0.15s;

  &:hover { color: ${({ theme }) => theme.colors.text}; }
`

const Layout = styled.div`
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 32px;
  align-items: start;

  @media (max-width: 1180px) { grid-template-columns: 1fr 300px; gap: 24px; }
  @media (max-width: 820px)  { grid-template-columns: 1fr; }
`

const Main = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`

const Card = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 28px;
`

const Badges = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['3xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  line-height: 1.2;
  margin-bottom: 14px;
  overflow-wrap: anywhere;
`

const ByLine = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-bottom: 22px;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
`

const ByLineAuthor = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: ${({ theme }) => theme.colors.text};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};

  a { color: inherit; }
  a:hover { color: ${({ theme }) => theme.colors.primary}; }
`

const ByLineAvatar = styled.div<{ $src: string | null }>`
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : theme.colors.border)};
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
`

const Dot = styled.span`
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.muted};
  opacity: 0.6;
`

const StatsStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 18px;

  @media (max-width: 520px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`

const Stat = styled.div`
  background: ${({ theme }) => theme.colors.neutral};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 12px 14px;
`

const StatValue = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 1.375rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.1;
`

const StatLabel = styled.div`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 4px;
`

const SectionLabel = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
  margin: 28px 0 10px;
`

/** Quadradinho da galeria: usa a miniatura e, se a foto for antiga (sem miniatura), a foto inteira. */
function GalleryImage({ url }: { url: string }) {
  const thumb = thumbUrl(url)
  const [src, setSrc] = useState(thumb ?? url)
  return <img src={src} alt="" loading="lazy" onError={() => src !== url && setSrc(url)} />
}

const isVisualUrl = (url: string) => /\.(jpe?g|png|webp|gif|mp4|mov|m4v|webm)(\?|#|$)/i.test(url)

function documentLabel(url: string, index: number) {
  if (/\.pdf(\?|#|$)/i.test(url)) return `Documento ${index + 1} (PDF)`
  if (/\.(mp3|m4a|ogg|wav|webm)(\?|#|$)/i.test(url)) return `Áudio ${index + 1}`
  return `Arquivo ${index + 1}`
}

const DocumentList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const DocumentButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.surfaceHover}; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.action}; }
`

const Description = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.md};
  line-height: 1.75;
  color: ${({ theme }) => theme.colors.text};
  white-space: pre-wrap;
`

const Sidebar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: 80px;
`

const SideCard = styled(Card)`
  padding: 20px;
`

const SideTitle = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 16px;
`

const VoteButtons = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const VoteBtn = styled(Button)<{ $active?: boolean }>`
  width: 100%;
  justify-content: space-between;
  font-size: 0.9375rem;
  ${({ $active, theme }) => $active && `border-color: ${theme.colors.action}; background: ${theme.colors.action}18;`}
`

const TimelineList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`

const TimelineItem = styled.div`
  display: flex;
  gap: 14px;
  padding-bottom: 28px;
  position: relative;

  &:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 9px;
    top: 22px;
    bottom: 0;
    width: 2px;
    background: ${({ theme }) => theme.colors.border};
  }
`

const TimelineDot = styled.div<{ $color?: string }>`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: ${({ $color, theme }) => $color || theme.colors.border};
  border: 2.5px solid ${({ theme }) => theme.colors.white};
  box-shadow: 0 0 0 2px ${({ $color, theme }) => $color || theme.colors.border};
  flex-shrink: 0;
  margin-top: 1px;
`

const TimelineContent = styled.div`
  flex: 1;
  min-width: 0;
`

const TimelineHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
`

const TimelineTypeBadge = styled.span<{ $color?: string }>`
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ $color }) => $color || '#9CA3AF'};
  background: ${({ $color }) => ($color ? `${$color}1a` : '#9CA3AF1a')};
  border: 1px solid ${({ $color }) => ($color ? `${$color}40` : '#9CA3AF40')};
  padding: 2px 8px;
  border-radius: 999px;
  line-height: 1.5;
  white-space: nowrap;
`

const TimelineDate = styled.span`
  font-size: 0.6875rem;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
  white-space: nowrap;
  flex-shrink: 0;
`

const TimelineText = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.55;
  margin-bottom: 10px;
`

const TimelineAuthorRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
`

const TimelineActor = styled(Link)`
  display: flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  min-width: 0;

  &:hover span { color: ${({ theme }) => theme.colors.primary}; }
`

const TimelineOrgPlain = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`

const TimelineActorAvatar = styled.div<{ $src: string | null }>`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : theme.colors.border)};
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.muted};
`

const TimelineActorName = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const Skeleton = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  height: 300px;
  animation: pulse 1.5s ease-in-out infinite;

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`


const DisputeBtn = styled(Button)`
  width: 100%;
  background: ${({ theme }) => theme.colors.action};
  color: #fff;
  border-color: ${({ theme }) => theme.colors.action};
  font-size: 0.9375rem;

  &:hover:not(:disabled) { background: #c1121f; border-color: #c1121f; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`

const FollowBtn = styled(Button)<{ $following?: boolean }>`
  width: 100%;
  font-size: 0.9375rem;
  margin-bottom: 12px;
  ${({ $following, theme }) =>
    $following
      ? `background: transparent; color: ${theme.colors.muted}; border-color: ${theme.colors.border};`
      : `background: #1A1A2E; color: #fff; border-color: #1A1A2E;`}

  &:hover:not(:disabled) {
    ${({ $following, theme }) =>
      $following
        ? `border-color: ${theme.colors.action}; color: ${theme.colors.action};`
        : `background: #0f0f1a; border-color: #0f0f1a;`}
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`

const FollowerCount = styled.p`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 12px;
  line-height: 1.4;
`

const FollowerList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const FollowerItem = styled.li`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.text};
  display: flex;
  align-items: center;
  gap: 6px;
`

const FollowerRole = styled.span`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.75rem;
`

const TimelineMediaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 6px;
  margin-top: 8px;
`

const TimelineMediaItem = styled.div`
  display: block;
  aspect-ratio: 1;
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.border};
  cursor: pointer;
  transition: opacity 0.15s;

  &:hover { opacity: 0.82; }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    pointer-events: none;
  }
`

const EVENT_COLORS: Record<EventType, string> = {
  [EventType.CREATED]:       '#9CA3AF',
  [EventType.RESPONDED]:     '#3B82F6',
  [EventType.STATUS_CHANGED]:'#F59E0B',
  [EventType.UPDATE]:        '#8B5CF6',
  [EventType.DISPUTED]:      '#F97316',
  [EventType.RESOLVED]:      '#2DC653',
  [EventType.ARCHIVED]:      '#6B7280',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function TimelineRow({
  event,
  onOpenMedia,
}: {
  event: TimelineEvent
  onOpenMedia: (items: { url: string }[], index: number) => void
}) {
  const meta = event.metadata as Record<string, unknown> | null
  const media = Array.isArray(meta?.media) ? (meta.media as string[]).filter(Boolean) : []

  return (
    <TimelineItem>
      <TimelineDot $color={EVENT_COLORS[event.type]} />
      <TimelineContent>
        <TimelineHeader>
          <TimelineTypeBadge $color={EVENT_COLORS[event.type]}>
            {timelineEventLabel(event.type, meta)}
          </TimelineTypeBadge>
          <TimelineDate>{formatDate(event.createdAt)}</TimelineDate>
        </TimelineHeader>
        <TimelineText>{event.content}</TimelineText>
        {media.length > 0 && (
          <TimelineMediaGrid>
            {media.map((url, i) => (
              <TimelineMediaItem
                key={url}
                role="button"
                tabIndex={0}
                onClick={() => onOpenMedia(media.map((u) => ({ url: u })), i)}
                onKeyDown={(e) => e.key === 'Enter' && onOpenMedia(media.map((u) => ({ url: u })), i)}
              >
                <GalleryImage url={url} />
              </TimelineMediaItem>
            ))}
          </TimelineMediaGrid>
        )}
        {event.actorOrg && (
          <TimelineAuthorRow>
            {(() => {
              const org = event.actorOrg
              const path = orgProfilePath(org.type, org.id)
              const inner = (
                <>
                  <TimelineActorAvatar $src={org.avatarUrl ?? null}>
                    {!org.avatarUrl && org.name.charAt(0).toUpperCase()}
                  </TimelineActorAvatar>
                  <TimelineActorName>{org.name}</TimelineActorName>
                </>
              )
              return path ? <TimelineActor to={path}>{inner}</TimelineActor> : <TimelineOrgPlain>{inner}</TimelineOrgPlain>
            })()}
          </TimelineAuthorRow>
        )}
        {!event.actorOrg && event.author && (
          <TimelineAuthorRow>
            <TimelineActor to={`/perfil/${event.author.id}`}>
              <TimelineActorAvatar $src={event.author.avatarUrl}>
                {!event.author.avatarUrl && event.author.name.charAt(0).toUpperCase()}
              </TimelineActorAvatar>
              <TimelineActorName>{event.author.name}</TimelineActorName>
            </TimelineActor>
          </TimelineAuthorRow>
        )}
      </TimelineContent>
    </TimelineItem>
  )
}

export function ReportDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: report, isLoading } = useReport(id!)
  const { mutate: vote } = useVote(id!)
  const { data: myVotes } = useMyVotes(id!)
  const { user, activeContext, sessionReady } = useAuthStore()
  const { data: profiles } = useMyProfiles(!!user && sessionReady)
  const qc = useQueryClient()
  const { open: openMedia } = useMediaViewer()

  const [flagOpen, setFlagOpen] = useState(false)
  const navigate = useNavigate()

  const isActorType = activeContext?.type === 'POLITICIAN' || activeContext?.type === 'ENTITY'
  const actorId = activeContext?.id

  const canFollow = isActorType
  const { data: followers } = useFollowers(id!)
  const { data: followStatus, isLoading: followStatusLoading } = useFollowStatus(id!, canFollow)
  const { follow: followMut, unfollow: unfollowMut } = useFollowReport(id!)


  const [showReatribuir, setShowReatribuir] = useState(false)
  const [reatribuirSearch, setReatribuirSearch] = useState('')
  const [reatribuirType, setReatribuirType] = useState<'POLITICIAN' | 'ENTITY'>('POLITICIAN')
  const { data: politiciansSearch } = usePoliticians({
    search: reatribuirSearch.length >= 2 ? reatribuirSearch : undefined,
    status: 'ATIVO',
    enabled: showReatribuir && reatribuirType === 'POLITICIAN',
  })

  const { data: entitiesSearch } = useEntities({
    search: reatribuirSearch.length >= 2 ? reatribuirSearch : undefined,
    enabled: showReatribuir && reatribuirType === 'ENTITY',
  })

  const recipientPoliticianId = report?.recipientType === RecipientType.POLITICIAN ? report.recipientId : null
  const { data: recipientPolitician } = usePolitician(recipientPoliticianId ?? '')

  const updateRecipientMutation = useMutation({
    mutationFn: ({ recipientType, recipientId }: { recipientType: string; recipientId: string }) =>
      api.patch(`/reports/${id}/recipient`, { recipientType, recipientId }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report', id] })
      setShowReatribuir(false)
      setReatribuirSearch('')
    },
  })

  if (isLoading) {
    return (
      <Page>
        <Navbar />
        <Content>
          <BackLink to="/">← Voltar</BackLink>
          <Layout>
            <Skeleton />
            <Skeleton style={{ height: 200 }} />
          </Layout>
        </Content>
      </Page>
    )
  }

  if (!report) return null

  const location = [report.neighborhood, report.city, report.state].filter(Boolean).join(', ')

  function handleVote(type: VoteType) {
    if (!user) {
      window.location.href = '/entrar'
      return
    }
    vote(type)
  }

  const isAuthor = !!user && !report.anonymous && report.author?.id === user.id
  // Quem pode contestar: o autor ou quem marcou "Eu também" (a API confere de novo).
  const canDispute = !!user && (isAuthor || !!myVotes?.ME_TOO)
  const isRecipient = !!actorId && activeContext?.type === report.recipientType && report.recipientId === actorId
  const hasActiveAdvocacy =
    !!actorId && (report.advocacies ?? []).some((a) => a.orgType === activeContext?.type && a.orgId === actorId && !a.closedAt)

  return (
    <Page>
      <Navbar />
      <Content>
        <BackLink to="/">← Voltar</BackLink>

        <Layout>
          <Main>
            <Card>
              <Badges>
                <CategoryBadge category={report.category} />
                <StatusBadge status={report.status} />
                <ContextNoteMenuScope
                  targetType={ContextNoteTargetType.REPORT}
                  targetId={report.id}
                  isOwner={!!(user && !report.anonymous && report.author?.id === user.id)}
                >
                  {(contextItems) => (
                    <OptionsMenu
                      label="Mais opções do relato"
                      items={[
                        { key: 'link', label: 'Copiar link', icon: <LinkSimple size={18} />, onSelect: () => copyLink(`/relatos/${report.id}`) },
                        ...(!(user && !report.anonymous && report.author?.id === user.id)
                          ? [{ key: 'flag', label: 'Denunciar relato', icon: <Flag size={18} />, onSelect: () => (user ? setFlagOpen(true) : navigate('/entrar')) }]
                          : []),
                        ...contextItems,
                      ]}
                    />
                  )}
                </ContextNoteMenuScope>
              </Badges>

              <FlagContentModal
                isOpen={flagOpen}
                targetType={FlagTargetType.REPORT}
                targetId={report.id}
                onClose={() => setFlagOpen(false)}
              />

              <Title>{report.title}</Title>

              <ByLine>
                {report.author ? (
                  <ByLineAuthor>
                    <ByLineAvatar $src={report.author.avatarUrl}>
                      {!report.author.avatarUrl && report.author.name.charAt(0).toUpperCase()}
                    </ByLineAvatar>
                    <Link to={`/perfil/${report.author.id}`}>{report.author.name}</Link>
                  </ByLineAuthor>
                ) : (
                  <ByLineAuthor>
                    <ByLineAvatar $src={null}>?</ByLineAvatar>
                    <span>Cidadão anônimo</span>
                  </ByLineAuthor>
                )}
                <Dot />
                <span>Relatado em {formatDate(report.createdAt)}</span>
                {location && (
                  <>
                    <Dot />
                    <span>📍 {location}</span>
                  </>
                )}
              </ByLine>

              <StatsStrip>
                <Stat>
                  <StatValue>{Math.round(report.pressureScore)}</StatValue>
                  <StatLabel>Pressão</StatLabel>
                </Stat>
                <Stat>
                  <StatValue>{report._count.votes}</StatValue>
                  <StatLabel>Apoios</StatLabel>
                </Stat>
                <Stat>
                  <StatValue>{report._count.meTooVotes}</StatValue>
                  <StatLabel>Eu também</StatLabel>
                </Stat>
                <Stat>
                  <StatValue>{report._count.comments}</StatValue>
                  <StatLabel>Comentários</StatLabel>
                </Stat>
              </StatsStrip>

              <PressureBar score={report.pressureScore} />

              <SectionLabel>O que está acontecendo</SectionLabel>
              <Description>
                {report.description}
              </Description>

              <ContextNoteCard type={ContextNoteTargetType.REPORT} id={report.id} />

              <LifecycleNotice report={report} isAuthor={isAuthor} />
              <AdvocacyCommitments report={report} />

              {report.media && report.media.length > 0 && (() => {
                // Foto de relato é prova: aparece inteira na moldura padrão (fundo desfocado), nunca recortada.
                const visual = report.mediaItems ?? legacyMediaItems(report.media.filter(isVisualUrl))
                const visualUrls = new Set(visual.map((item) => item.url))
                const documents = report.media.filter((url) => !visualUrls.has(url) && !isVisualUrl(url))
                return (
                  <>
                    <SectionLabel>{documents.length ? 'Fotos, vídeos e documentos' : 'Fotos e vídeos'}</SectionLabel>
                    {visual.length > 0 && (
                      <MediaCarousel
                        items={visual}
                        label="Fotos e vídeos do relato"
                        onOpen={(i) => openMedia(visual.map((item) => ({ url: item.fullUrl ?? item.url ?? '', type: item.kind === 'VIDEO' ? 'video' : 'image' })), i)}
                      />
                    )}
                    {documents.length > 0 && (
                      <DocumentList>
                        {documents.map((url, i) => (
                          <li key={url}>
                            <DocumentButton type="button" onClick={() => openMedia(documents.map((u) => ({ url: u })), i)}>
                              <FileText size={18} aria-hidden /> {documentLabel(url, i)}
                            </DocumentButton>
                          </li>
                        ))}
                      </DocumentList>
                    )}
                  </>
                )
              })()}
            </Card>

            {report.timeline && report.timeline.length > 0 && (
              <Card>
                <SideTitle>Andamento do relato</SideTitle>
                <TimelineList>
                  {report.timeline.map((event) => (
                    <TimelineRow key={event.id} event={event} onOpenMedia={openMedia} />
                  ))}
                </TimelineList>
              </Card>
            )}

            <Card>
              <CommentsSection reportId={report.id} />
            </Card>
          </Main>

          <Sidebar>
            <SideCard>
              <SideTitle>Isso também é com você?</SideTitle>
              <p style={{ fontSize: '0.8125rem', color: '#6B7280', lineHeight: 1.5, marginTop: -6, marginBottom: 14 }}>
                Cada apoio aumenta a pressão para alguém responder.
              </p>
              <VoteButtons>
                <VoteBtn
                  variant="outline"
                  $active={myVotes?.SUPPORT}
                  onClick={() => handleVote(VoteType.SUPPORT)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ArrowUp size={18} weight="bold" />
                    {myVotes?.SUPPORT ? 'Apoiado' : 'Apoiar'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                    {report._count.votes}
                  </span>
                </VoteBtn>
                <VoteBtn
                  variant="outline"
                  $active={myVotes?.ME_TOO}
                  onClick={() => handleVote(VoteType.ME_TOO)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <UsersThree size={18} weight="duotone" />
                    Eu também
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                    {report._count.meTooVotes}
                  </span>
                </VoteBtn>
              </VoteButtons>
            </SideCard>

            <PressContactCard reportId={report.id} anonymous={report.anonymous} />

            {(() => {
              if (report.recipientType !== RecipientType.POLITICIAN || !recipientPolitician) return null
              if (recipientPolitician.status === 'ATIVO') return null
              const isAuthor = user?.id === report.author?.id && !report.anonymous
              const label = recipientPolitician.status === 'ENCERRADO' ? 'Mandato encerrado' : 'Político afastado'

              return (
                <SideCard>
                  <SideTitle style={{ color: '#6B7280' }}>Destinatário</SideTitle>
                  <p style={{ fontSize: '0.8125rem', color: '#6B7280', lineHeight: 1.5, marginBottom: isAuthor ? 12 : 0 }}>
                    {label}: {recipientPolitician.name}. Este relato pode ser reatribuído a um novo destinatário.
                  </p>
                  {isAuthor && !showReatribuir && (
                    <DisputeBtn
                      style={{ background: '#1A1A2E', color: '#fff', marginTop: 8 }}
                      onClick={() => setShowReatribuir(true)}
                    >
                      Reatribuir destinatário
                    </DisputeBtn>
                  )}
                  {isAuthor && showReatribuir && (
                    <>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 10, marginTop: 8 }}>
                        {(['POLITICIAN', 'ENTITY'] as const).map((t) => (
                          <button
                            key={t}
                            style={{
                              flex: 1, padding: '5px 10px', borderRadius: 8,
                              border: reatribuirType === t ? '1.5px solid #1A1A2E' : '1px solid #E5E5E5',
                              background: reatribuirType === t ? '#1A1A2E12' : 'transparent',
                              cursor: 'pointer', fontSize: '0.8125rem',
                              color: reatribuirType === t ? '#1A1A2E' : '#6B7280',
                            }}
                            onClick={() => { setReatribuirType(t); setReatribuirSearch('') }}
                          >
                            {t === 'POLITICIAN' ? 'Político' : 'Entidade'}
                          </button>
                        ))}
                      </div>

                      <input
                        type="text"
                        placeholder={reatribuirType === 'POLITICIAN' ? 'Buscar político ativo…' : 'Buscar entidade…'}
                        value={reatribuirSearch}
                        onChange={(e) => setReatribuirSearch(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #E5E5E5', borderRadius: 8, fontSize: '0.8125rem', marginBottom: 6, boxSizing: 'border-box' }}
                      />

                      {reatribuirSearch.length >= 2 && (
                        <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #E5E5E5', borderRadius: 8, marginBottom: 8 }}>
                          {reatribuirType === 'POLITICIAN' && (() => {
                            const items = politiciansSearch?.data ?? []
                            if (items.length === 0) return (
                              <p style={{ padding: '10px 12px', fontSize: '0.8125rem', color: '#6B7280' }}>Nenhum político encontrado</p>
                            )
                            return items.map((p) => (
                              <button
                                key={p.id}
                                disabled={updateRecipientMutation.isPending}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', borderBottom: '1px solid #F0F0F0' }}
                                onClick={() => updateRecipientMutation.mutate({ recipientType: 'POLITICIAN', recipientId: p.id })}
                              >
                                <strong>{p.name}</strong> — {p.office}, {p.party.abbreviation}
                              </button>
                            ))
                          })()}

                          {reatribuirType === 'ENTITY' && (() => {
                            const items = entitiesSearch?.data ?? []
                            if (items.length === 0) return (
                              <p style={{ padding: '10px 12px', fontSize: '0.8125rem', color: '#6B7280' }}>Nenhuma entidade encontrada</p>
                            )
                            return items.map((e) => (
                              <button
                                key={e.id}
                                disabled={updateRecipientMutation.isPending}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', borderBottom: '1px solid #F0F0F0' }}
                                onClick={() => updateRecipientMutation.mutate({ recipientType: 'ENTITY', recipientId: e.id })}
                              >
                                <strong>{e.legalName}</strong>{e.city ? ` — ${e.city}` : ''}
                              </button>
                            ))
                          })()}
                        </div>
                      )}

                      {updateRecipientMutation.isPending && (
                        <p style={{ fontSize: '0.8125rem', color: '#6B7280', marginBottom: 6 }}>Reatribuindo…</p>
                      )}
                      {updateRecipientMutation.isError && (
                        <p style={{ fontSize: '0.8125rem', color: '#E63946', marginBottom: 6 }}>Não foi possível reatribuir. Tente novamente.</p>
                      )}
                      <Button variant="outline" size="sm" onClick={() => { setShowReatribuir(false); setReatribuirSearch('') }}>
                        Cancelar
                      </Button>
                    </>
                  )}
                </SideCard>
              )
            })()}

            {(activeContext?.type === 'POLITICIAN' || activeContext?.type === 'ENTITY') && actorId && (
              <AdvocacyActionsCard report={report} actorType={activeContext.type} actorId={actorId} />
            )}

            <DisputeCard report={report} canDispute={canDispute} />

            {(isRecipient || hasActiveAdvocacy) && <ProgressCard report={report} isRecipient={isRecipient} />}

            {(() => {
              const recipientOrg = report.recipientId
                ? profiles?.orgs.find(
                    (o) => o.id === report.recipientId && o.type === report.recipientType,
                  )
                : undefined
              const matchingRecipientActive =
                !!actorId &&
                activeContext?.type === report.recipientType &&
                report.recipientId === actorId
              const fallbackOrg = !isActorType
                ? profiles?.orgs.find((o) => o.type === 'ENTITY' || o.type === 'POLITICIAN')
                : undefined
              const promptOrg =
                recipientOrg && !matchingRecipientActive ? recipientOrg : fallbackOrg

              if (!promptOrg) return null

              return (
                <SideCard>
                  <SideTitle>Perfil institucional</SideTitle>
                  <OrgContextPrompt orgName={promptOrg.name} />
                </SideCard>
              )
            })()}

            {(canFollow || (followers && followers.count > 0)) && (
              <SideCard>
                <SideTitle>Acompanhando</SideTitle>

                {canFollow && (
                  <>
                    <FollowBtn
                      $following={followStatus?.following}
                      disabled={followStatusLoading || followMut.isPending || unfollowMut.isPending}
                      onClick={() =>
                        followStatus?.following
                          ? unfollowMut.mutate()
                          : followMut.mutate()
                      }
                    >
                      {followMut.isPending || unfollowMut.isPending
                        ? 'Aguarde…'
                        : followStatus?.following
                          ? '✓ Deixar de acompanhar'
                          : '+ Acompanhar este relato'}
                    </FollowBtn>
                    {(followMut.isError || unfollowMut.isError) && (
                      <p style={{ fontSize: '0.8125rem', color: '#E63946', marginBottom: 8 }}>
                        Não foi possível atualizar. Tente novamente.
                      </p>
                    )}
                  </>
                )}

                {followers && (
                  <FollowerCount>
                    {followers.count === 0
                      ? 'Nenhum político ou entidade acompanha este relato ainda.'
                      : `${followers.count} ${followers.count === 1 ? 'ator público acompanha' : 'atores públicos acompanham'} este relato.`}
                  </FollowerCount>
                )}

                {followers && followers.count > 0 && (
                  <FollowerList>
                    {followers.politicians.map((p) => (
                      <FollowerItem key={p.id}>
                        🏛 <span>{p.name}</span>
                        <FollowerRole>· {p.office} – {p.state}</FollowerRole>
                      </FollowerItem>
                    ))}
                    {followers.entities.map((e) => (
                      <FollowerItem key={e.id}>
                        🏢 <span>{e.legalName}</span>
                      </FollowerItem>
                    ))}
                  </FollowerList>
                )}
              </SideCard>
            )}

          </Sidebar>
        </Layout>
      </Content>
    </Page>
  )
}
