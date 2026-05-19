import { useState } from 'react'
import styled from 'styled-components'
import { useParams, Link } from 'react-router-dom'
import { VoteType, EventType, ReportStatus, RecipientType, UserType } from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import { CategoryBadge, StatusBadge } from '../components/ui/Badge'
import { PressureBar } from '../components/ui/PressureBar'
import { Button } from '../components/ui/Button'
import { CommentsSection } from '../components/comments/CommentsSection'
import { useMediaViewer } from '../components/ui/MediaViewer'
import { useReport, useFollowers, useFollowStatus, useFollowReport } from '../hooks/useReport'
import { useVote, useMyVotes } from '../hooks/useVote'
import { useDisputeReport, useUpdateReportStatus } from '../hooks/useReports'
import { useUser } from '../hooks/useUser'
import { useAuthStore } from '../store/auth.store'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import { TimelineEvent } from '../types/api'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 32px 64px;

  @media (max-width: 640px) { padding: 16px 16px 48px; }
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
  grid-template-columns: 1fr 320px;
  gap: 24px;
  align-items: start;

  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    grid-template-columns: 1fr;
  }
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
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  line-height: 1.25;
  margin-bottom: 12px;
`

const Location = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 20px;
`

const MediaGallery = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  margin-top: 20px;
`

const MediaItem = styled.div`
  display: block;
  aspect-ratio: 1;
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.neutral};
  cursor: pointer;
  position: relative;
  transition: opacity 0.15s;

  &:hover { opacity: 0.88; }

  img, video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    pointer-events: none;
  }
`

const VideoPlayOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.32);
  color: #fff;
  font-size: 1.5rem;
  pointer-events: none;
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

const AuthorCard = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
`

const AuthorAvatar = styled.div<{ $src: string | null }>`
  width: 40px;
  height: 40px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : theme.colors.border)};
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  color: ${({ theme }) => theme.colors.muted};
`

const AuthorLink = styled(Link)`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.9375rem;
  &:hover { color: ${({ theme }) => theme.colors.primary}; }
`

const TimelineList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`

const TimelineItem = styled.div`
  display: flex;
  gap: 12px;
  padding-bottom: 20px;
  position: relative;

  &:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 7px;
    top: 16px;
    bottom: 0;
    width: 2px;
    background: ${({ theme }) => theme.colors.border};
  }
`

const TimelineDot = styled.div<{ $color?: string }>`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: ${({ $color, theme }) => $color || theme.colors.border};
  border: 2px solid ${({ theme }) => theme.colors.white};
  box-shadow: 0 0 0 2px ${({ $color, theme }) => $color || theme.colors.border};
  flex-shrink: 0;
  margin-top: 2px;
`

const TimelineContent = styled.div`
  flex: 1;
  min-width: 0;
`

const TimelineText = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.5;
`

const TimelineDate = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
`

const TimelineMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
`

const TimelineActor = styled(Link)`
  display: flex;
  align-items: center;
  gap: 5px;
  text-decoration: none;
  min-width: 0;

  &:hover span { color: ${({ theme }) => theme.colors.primary}; }
`

const TimelineActorAvatar = styled.div<{ $src: string | null }>`
  width: 18px;
  height: 18px;
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

const AuthorAnonymous = styled.span`
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
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

const AvocBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  background: #EFF6FF;
  border: 1px solid #BFDBFE;
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 12px 16px;
  margin-top: 20px;
`

const AvocIcon = styled.span`
  font-size: 1.25rem;
  flex-shrink: 0;
`

const AvocText = styled.p`
  font-size: 0.875rem;
  color: #1E40AF;
  line-height: 1.5;
  margin: 0;
  b { font-weight: ${({ theme }) => theme.fontWeights.semibold}; }
`

const AvocBtn = styled(Button)`
  width: 100%;
  background: #1E40AF;
  color: #fff;
  border-color: #1E40AF;
  font-size: 0.9375rem;
  margin-top: 4px;

  &:hover:not(:disabled) { background: #1e3a8a; border-color: #1e3a8a; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
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

const DisputeTextarea = styled.textarea`
  width: 100%;
  min-height: 100px;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  font-family: ${({ theme }) => theme.fonts.body};
  color: ${({ theme }) => theme.colors.text};
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s;

  &:focus { border-color: ${({ theme }) => theme.colors.action}; }
`

const CharCount = styled.span<{ $over: boolean }>`
  display: block;
  text-align: right;
  font-size: 0.75rem;
  color: ${({ $over, theme }) => ($over ? theme.colors.action : theme.colors.muted)};
  margin-top: 4px;
`

const DisputeActions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 12px;
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

const UpdateSelect = styled.select`
  width: 100%;
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  font-family: ${({ theme }) => theme.fonts.body};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  outline: none;
  margin-bottom: 10px;
  cursor: pointer;
  transition: border-color 0.15s;

  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`

const UpdateTextarea = styled.textarea`
  width: 100%;
  min-height: 90px;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  font-family: ${({ theme }) => theme.fonts.body};
  color: ${({ theme }) => theme.colors.text};
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s;

  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`

const MediaUploadLabel = styled.label`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 8px;
  margin-top: 10px;
  border: 1.5px dashed ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  box-sizing: border-box;

  &:hover { border-color: ${({ theme }) => theme.colors.primary}; color: ${({ theme }) => theme.colors.primary}; }
`

const MediaPreviewGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-top: 10px;
`

const MediaThumb = styled.div<{ $error?: boolean }>`
  position: relative;
  aspect-ratio: 1;
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
  background: ${({ $error, theme }) => ($error ? '#FEE2E2' : theme.colors.border)};
  border: 1px solid ${({ $error }) => ($error ? '#FCA5A5' : 'transparent')};

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`

const MediaThumbOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  color: #fff;
`

const MediaThumbRemove = styled.button`
  position: absolute;
  top: 3px;
  right: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0,0,0,0.6);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 0.625rem;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0;

  &:hover { background: rgba(220,38,38,0.9); }
`

const UpdateSubmitBtn = styled(Button)`
  width: 100%;
  margin-top: 12px;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-color: ${({ theme }) => theme.colors.primary};
  font-size: 0.9375rem;

  &:hover:not(:disabled) { background: #0f0f1a; border-color: #0f0f1a; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
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

interface UploadMediaItem {
  id: string
  previewUrl: string
  url: string | null
  uploading: boolean
  error: boolean
}

const UPDATABLE_STATUSES: Record<string, string> = {
  UNDER_REVIEW: 'Em análise',
  IN_PROGRESS:  'Em andamento',
  RESOLVED:     'Resolvido',
  ARCHIVED:     'Arquivado',
}

const TERMINAL_STATUSES = new Set(['RESOLVED', 'DISPUTED', 'ARCHIVED'])

const EVENT_COLORS: Record<EventType, string> = {
  [EventType.CREATED]:       '#9CA3AF',
  [EventType.RESPONDED]:     '#3B82F6',
  [EventType.STATUS_CHANGED]:'#F59E0B',
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
                <img src={url} alt="" loading="lazy" />
              </TimelineMediaItem>
            ))}
          </TimelineMediaGrid>
        )}
        <TimelineMeta>
          <TimelineDate>{formatDate(event.createdAt)}</TimelineDate>
          {event.author && (
            <TimelineActor to={`/perfil/${event.author.id}`}>
              <TimelineActorAvatar $src={event.author.avatarUrl}>
                {!event.author.avatarUrl && event.author.name.charAt(0).toUpperCase()}
              </TimelineActorAvatar>
              <TimelineActorName>{event.author.name}</TimelineActorName>
            </TimelineActor>
          )}
        </TimelineMeta>
      </TimelineContent>
    </TimelineItem>
  )
}

export function ReportDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: report, isLoading } = useReport(id!)
  const { mutate: vote } = useVote(id!)
  const { data: myVotes } = useMyVotes(id!)
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const { open: openMedia } = useMediaViewer()

  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const disputeMutation = useDisputeReport(id!)

  const isActorType = user?.type === UserType.POLITICIAN || user?.type === UserType.ENTITY
  const { data: userProfile } = useUser(isActorType && user ? user.id : '')

  const actorId = user?.type === UserType.POLITICIAN
    ? userProfile?.politician?.id
    : user?.type === UserType.ENTITY
      ? userProfile?.entity?.id
      : undefined

  const canFollow = isActorType
  const { data: followers } = useFollowers(id!)
  const { data: followStatus, isLoading: followStatusLoading } = useFollowStatus(id!, canFollow)
  const { follow: followMut, unfollow: unfollowMut } = useFollowReport(id!)

  // Update status form state
  const [updateStatus, setUpdateStatus] = useState('')
  const [updateContent, setUpdateContent] = useState('')
  const [mediaItems, setMediaItems] = useState<UploadMediaItem[]>([])
  const updateStatusMut = useUpdateReportStatus(id!)

  const advocateMutation = useMutation({
    mutationFn: ({ politicianId, reportId }: { politicianId: string; reportId: string }) =>
      api.post(`/politicians/${politicianId}/advocate/${reportId}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report', id] }),
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

  async function handleMediaFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const slots = 4 - mediaItems.length
    const toProcess = files.slice(0, slots)

    const newItems: UploadMediaItem[] = toProcess.map((f) => ({
      id: Math.random().toString(36).slice(2),
      previewUrl: URL.createObjectURL(f),
      url: null,
      uploading: true,
      error: false,
    }))
    setMediaItems((prev) => [...prev, ...newItems])

    await Promise.all(
      toProcess.map(async (file, i) => {
        const localId = newItems[i].id
        try {
          const form = new FormData()
          form.append('file', file)
          const { url } = await api
            .post<{ url: string }>('/storage/upload/report-media', form, {
              headers: { 'Content-Type': 'multipart/form-data' },
            })
            .then((r) => r.data)
          setMediaItems((prev) =>
            prev.map((it) => (it.id === localId ? { ...it, url, uploading: false } : it)),
          )
        } catch {
          setMediaItems((prev) =>
            prev.map((it) => (it.id === localId ? { ...it, uploading: false, error: true } : it)),
          )
        }
      }),
    )
  }

  function handleStatusSubmit() {
    if (!updateStatus || updateContent.trim().length < 10) return
    if (mediaItems.some((m) => m.uploading)) return
    const uploadedUrls = mediaItems.filter((m) => m.url).map((m) => m.url!)
    updateStatusMut.mutate(
      { status: updateStatus, content: updateContent.trim(), media: uploadedUrls },
      {
        onSuccess: () => {
          setMediaItems((prev) => {
            prev.forEach((m) => URL.revokeObjectURL(m.previewUrl))
            return []
          })
          setUpdateStatus('')
          setUpdateContent('')
        },
      },
    )
  }

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
              </Badges>

              <Title>{report.title}</Title>
              {location && <Location>📍 {location}</Location>}

              <PressureBar score={report.pressureScore} />

              <Description style={{ marginTop: 24 }}>
                {report.description}
              </Description>

              {(() => {
                const avocEvent = report.timeline?.find(
                  (e) => e.type === EventType.RESPONDED && (e.metadata as Record<string, unknown>)?.action === 'advocated',
                )
                if (!avocEvent) return null
                return (
                  <AvocBanner>
                    <AvocIcon>🤝</AvocIcon>
                    <AvocText>
                      <b>{avocEvent.author?.name ?? 'Político'}</b> avocou este relato e assumiu a responsabilidade de resolvê-lo.
                    </AvocText>
                  </AvocBanner>
                )
              })()}

              {report.media && report.media.length > 0 && (
                <MediaGallery>
                  {report.media.map((url, i) => {
                    const isVideo = /\.(mp4|mov|webm)$/i.test(url)
                    return (
                      <MediaItem
                        key={url}
                        role="button"
                        tabIndex={0}
                        onClick={() => openMedia(report.media.map((u) => ({ url: u })), i)}
                        onKeyDown={(e) => e.key === 'Enter' && openMedia(report.media.map((u) => ({ url: u })), i)}
                      >
                        {isVideo ? (
                          <>
                            <video src={url} muted playsInline preload="metadata" />
                            <VideoPlayOverlay>▶</VideoPlayOverlay>
                          </>
                        ) : (
                          <img src={url} alt="" loading="lazy" />
                        )}
                      </MediaItem>
                    )
                  })}
                </MediaGallery>
              )}
            </Card>

            <Card>
              <CommentsSection reportId={report.id} />
            </Card>
          </Main>

          <Sidebar>
            <SideCard>
              <SideTitle>Autor</SideTitle>
              {report.author ? (
                <AuthorCard>
                  <AuthorAvatar $src={report.author.avatarUrl}>
                    {!report.author.avatarUrl && report.author.name.charAt(0).toUpperCase()}
                  </AuthorAvatar>
                  <AuthorLink to={`/perfil/${report.author.id}`}>
                    {report.author.name}
                  </AuthorLink>
                </AuthorCard>
              ) : (
                <AuthorCard>
                  <AuthorAvatar $src={null}>?</AuthorAvatar>
                  <AuthorAnonymous>Cidadão anônimo</AuthorAnonymous>
                </AuthorCard>
              )}
            </SideCard>

            <SideCard>
              <SideTitle>Pressão coletiva</SideTitle>
              <VoteButtons>
                <VoteBtn
                  variant="outline"
                  $active={myVotes?.SUPPORT}
                  onClick={() => handleVote(VoteType.SUPPORT)}
                >
                  <span>▲ Apoio</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                    {report._count.votes}
                  </span>
                </VoteBtn>
                <VoteBtn
                  variant="outline"
                  $active={myVotes?.ME_TOO}
                  onClick={() => handleVote(VoteType.ME_TOO)}
                  style={{ fontSize: '0.875rem' }}
                >
                  <span>⚠ Também sofro isso</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                    {report._count.meTooVotes}
                  </span>
                </VoteBtn>
              </VoteButtons>
            </SideCard>

            {(() => {
              const alreadyAdvocated = report.timeline?.some(
                (e) => e.type === EventType.RESPONDED && (e.metadata as Record<string, unknown>)?.action === 'advocated',
              )
              const canAdvocate =
                user?.type === 'POLITICIAN' &&
                report.recipientType === RecipientType.POLITICIAN &&
                (report.status === ReportStatus.OPEN || report.status === ReportStatus.UNDER_REVIEW) &&
                !alreadyAdvocated

              if (!canAdvocate) return null

              return (
                <SideCard>
                  <SideTitle>Ação política</SideTitle>
                  <AvocBtn
                    disabled={advocateMutation.isPending}
                    onClick={() =>
                      advocateMutation.mutate({ politicianId: report.recipientId!, reportId: report.id })
                    }
                  >
                    {advocateMutation.isPending ? 'Avocando…' : '🤝 Avocar este relato'}
                  </AvocBtn>
                  <p style={{ fontSize: '0.8125rem', color: '#6B7280', marginTop: 8, lineHeight: 1.5 }}>
                    Ao avocar, você assume publicamente a responsabilidade de resolver este problema.
                  </p>
                  {advocateMutation.isError && (
                    <p style={{ fontSize: '0.8125rem', color: '#E63946', marginTop: 6 }}>
                      Não foi possível avocar. Verifique se este relato é direcionado ao seu perfil.
                    </p>
                  )}
                </SideCard>
              )
            })()}

            {(() => {
              const alreadyDisputed = report.timeline?.some((e) => e.type === EventType.DISPUTED)
              const canDispute =
                report.status === ReportStatus.RESOLVED &&
                !report.anonymous &&
                user?.id === report.author?.id &&
                !alreadyDisputed

              if (!canDispute) return null

              function handleDisputeSubmit() {
                if (disputeReason.trim().length < 20) return
                disputeMutation.mutate(
                  { reason: disputeReason.trim() },
                  {
                    onSuccess: () => {
                      setShowDisputeForm(false)
                      setDisputeReason('')
                    },
                  },
                )
              }

              return (
                <SideCard>
                  <SideTitle>Contestação</SideTitle>
                  {!showDisputeForm ? (
                    <>
                      <p style={{ fontSize: '0.8125rem', color: '#6B7280', lineHeight: 1.5, marginBottom: 12 }}>
                        Se o problema ainda não foi resolvido, você pode contestar a resolução com justificativa.
                      </p>
                      <DisputeBtn onClick={() => setShowDisputeForm(true)}>
                        ⚡ Contestar resolução
                      </DisputeBtn>
                    </>
                  ) : (
                    <>
                      <DisputeTextarea
                        placeholder="Descreva por que o problema ainda não foi resolvido… (mín. 20 caracteres)"
                        value={disputeReason}
                        onChange={(e) => setDisputeReason(e.target.value)}
                        maxLength={500}
                      />
                      <CharCount $over={disputeReason.length > 500}>
                        {disputeReason.length}/500
                      </CharCount>
                      {disputeMutation.isError && (
                        <p style={{ fontSize: '0.8125rem', color: '#E63946', marginTop: 6 }}>
                          Não foi possível contestar. Tente novamente.
                        </p>
                      )}
                      <DisputeActions>
                        <DisputeBtn
                          disabled={disputeReason.trim().length < 20 || disputeMutation.isPending}
                          onClick={handleDisputeSubmit}
                          style={{ flex: 1 }}
                        >
                          {disputeMutation.isPending ? 'Enviando…' : 'Enviar contestação'}
                        </DisputeBtn>
                        <Button
                          variant="outline"
                          onClick={() => { setShowDisputeForm(false); setDisputeReason('') }}
                          disabled={disputeMutation.isPending}
                        >
                          Cancelar
                        </Button>
                      </DisputeActions>
                    </>
                  )}
                </SideCard>
              )
            })()}

            {(() => {
              const isRecipient = !!actorId && report.recipientId === actorId
              if (!isRecipient || TERMINAL_STATUSES.has(report.status)) return null

              const uploadingCount = mediaItems.filter((m) => m.uploading).length
              const canSubmit =
                !!updateStatus &&
                updateContent.trim().length >= 10 &&
                uploadingCount === 0 &&
                !updateStatusMut.isPending

              return (
                <SideCard>
                  <SideTitle>Dar andamento</SideTitle>

                  <UpdateSelect
                    value={updateStatus}
                    onChange={(e) => setUpdateStatus(e.target.value)}
                  >
                    <option value="">Selecione o novo status…</option>
                    {Object.entries(UPDATABLE_STATUSES)
                      .filter(([key]) => key !== report.status)
                      .map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                  </UpdateSelect>

                  <UpdateTextarea
                    placeholder="Descreva o andamento (mín. 10 caracteres)"
                    value={updateContent}
                    onChange={(e) => setUpdateContent(e.target.value)}
                    maxLength={500}
                  />
                  <CharCount $over={updateContent.length > 480}>
                    {updateContent.length}/500
                  </CharCount>

                  {mediaItems.length < 4 && (
                    <>
                      <MediaUploadLabel>
                        📎 Anexar fotos ({mediaItems.length}/4)
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"
                          multiple
                          style={{ display: 'none' }}
                          onChange={handleMediaFiles}
                        />
                      </MediaUploadLabel>
                    </>
                  )}

                  {mediaItems.length > 0 && (
                    <MediaPreviewGrid>
                      {mediaItems.map((item) => (
                        <MediaThumb key={item.id} $error={item.error}>
                          <img src={item.previewUrl} alt="" />
                          {item.uploading && <MediaThumbOverlay>…</MediaThumbOverlay>}
                          {item.error && <MediaThumbOverlay>✕</MediaThumbOverlay>}
                          {!item.uploading && (
                            <MediaThumbRemove
                              onClick={() => {
                                URL.revokeObjectURL(item.previewUrl)
                                setMediaItems((prev) => prev.filter((m) => m.id !== item.id))
                              }}
                            >
                              ✕
                            </MediaThumbRemove>
                          )}
                        </MediaThumb>
                      ))}
                    </MediaPreviewGrid>
                  )}

                  {updateStatusMut.isError && (
                    <p style={{ fontSize: '0.8125rem', color: '#E63946', marginTop: 8 }}>
                      Não foi possível atualizar. Verifique se você é o destinatário deste relato.
                    </p>
                  )}

                  <UpdateSubmitBtn disabled={!canSubmit} onClick={handleStatusSubmit}>
                    {updateStatusMut.isPending
                      ? 'Enviando…'
                      : uploadingCount > 0
                        ? `Aguardando ${uploadingCount} foto(s)…`
                        : 'Publicar atualização'}
                  </UpdateSubmitBtn>
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
                        🏛 <span>{p.user.name}</span>
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

            {report.timeline && report.timeline.length > 0 && (
              <SideCard>
                <SideTitle>Linha do tempo</SideTitle>
                <TimelineList>
                  {report.timeline.map((event) => (
                    <TimelineRow key={event.id} event={event} onOpenMedia={openMedia} />
                  ))}
                </TimelineList>
              </SideCard>
            )}
          </Sidebar>
        </Layout>
      </Content>
    </Page>
  )
}
