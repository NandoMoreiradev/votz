import { useEffect, useRef, useState } from 'react'
import styled, { keyframes } from 'styled-components'
import { useParams, Link } from 'react-router-dom'
import Hls from 'hls.js'
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  ControlBar,
  useTracks,
} from '@livekit/components-react'
import '@livekit/components-styles'
import { Track } from 'livekit-client'
import { Navbar } from '../components/layout/Navbar'
import {
  useDebate,
  useDebateLivekitToken,
  useDebateQuestions,
  useDebateMessages,
  useDebateActivePoll,
  useStartDebate,
  useEndDebate,
  useSubmitQuestion,
  useUpvoteQuestion,
  useVotePoll,
  useSetDebateStream,
  useSetParticipantStream,
} from '../hooks/useDebates'
import { YoutubePlayer } from '../components/debates/YoutubePlayer'
import { useDebateSocket } from '../hooks/useDebateSocket'
import { useDebateStore } from '../store/debate.store'
import { useAuthStore } from '../store/auth.store'
import { ReactionType } from '../types/api'

// ── Animations ─────────────────────────────────────────────────────────────

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`

const floatUp = keyframes`
  0% { transform: translateY(0) scale(1); opacity: 1; }
  100% { transform: translateY(-120px) scale(1.4); opacity: 0; }
`

// ── Layout ─────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background: #0d0d0d;
`

const Body = styled.div`
  display: grid;
  grid-template-columns: 1fr 380px;
  height: calc(100vh - 56px);
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    height: auto;
  }
`

// ── Main column ─────────────────────────────────────────────────────────────

const Main = styled.div`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #000;
`

const VideoArea = styled.div`
  flex: 1;
  position: relative;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
`

const HlsVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: contain;
`

const LiveBadge = styled.div`
  position: absolute;
  top: 14px;
  left: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: ${({ theme }) => theme.colors.action};
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  letter-spacing: 0.5px;
`

const LiveDot = styled.span`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #fff;
  animation: ${pulse} 1.2s ease-in-out infinite;
`

const ViewerBadge = styled.div`
  position: absolute;
  top: 14px;
  right: 14px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-size: 0.75rem;
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
`

const Countdown = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #fff;
  padding: 40px;
`

const CountdownLabel = styled.p`
  font-size: 0.9375rem;
  color: rgba(255,255,255,0.6);
  margin-bottom: 4px;
`

const CountdownTime = styled.p`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 2rem;
  font-weight: 700;
`

const EndedPlaceholder = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: rgba(255,255,255,0.5);
  padding: 40px;
  text-align: center;
`

const DebateInfoBar = styled.div`
  padding: 12px 20px;
  background: #111;
  border-top: 1px solid #222;
`

const DebateTitle = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 6px;
`

const ParticipantRow = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`

const ParticipantChip = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
  color: rgba(255,255,255,0.7);
`

const SmallAvatar = styled.div<{ $url?: string | null }>`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: ${({ $url, theme }) => $url ? `url(${$url}) center/cover` : theme.colors.primary};
  flex-shrink: 0;
`

const HostLine = styled.p`
  font-size: 0.8125rem;
  color: rgba(255,255,255,0.55);
  margin-bottom: 8px;
`

const StreamNote = styled.p`
  font-size: 0.75rem;
  color: rgba(255,255,255,0.4);
  margin-top: 8px;
  line-height: 1.4;
`

const WatchBtn = styled.button<{ $active?: boolean }>`
  padding: 2px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.action : 'rgba(255,255,255,0.25)')};
  background: ${({ $active, theme }) => ($active ? theme.colors.action : 'transparent')};
  color: ${({ theme }) => theme.colors.white};
  font-size: 0.75rem;
  cursor: pointer;
`

const ProfileLink = styled(Link)`
  color: inherit;
  text-decoration: none;
  &:hover { text-decoration: underline; }
`

// ── Link da live (anfitrião e debatedores) ──────────────────────────────────

const StreamBar = styled.div`
  padding: 10px 20px 12px;
  background: ${({ theme }) => theme.colors.primary};
  border-top: 1px solid rgba(255,255,255,0.12);
`

const StreamBarLabel = styled.p`
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(255,255,255,0.85);
  margin-bottom: 6px;
`

const StreamForm = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`

const StreamInput = styled.input`
  flex: 1;
  min-width: 220px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: ${({ theme }) => theme.radii.md};
  background: rgba(255,255,255,0.06);
  color: ${({ theme }) => theme.colors.white};
  font-size: 0.875rem;
  outline: none;
  &:focus { border-color: rgba(255,255,255,0.45); }
  &::placeholder { color: rgba(255,255,255,0.35); }
`

const StreamError = styled.p`
  margin-top: 6px;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.action};
`

// ── Actions for creator ─────────────────────────────────────────────────────

const CreatorActions = styled.div`
  display: flex;
  gap: 10px;
  padding: 10px 20px;
  background: #111;
  border-top: 1px solid #222;
`

const ActionBtn = styled.button<{ $variant?: 'danger' }>`
  padding: 0 16px;
  height: 34px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: none;
  background: ${({ $variant, theme }) => $variant === 'danger' ? theme.colors.action : theme.colors.primary};
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
  &:hover { opacity: 0.88; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

// ── Sidebar ─────────────────────────────────────────────────────────────────

const Sidebar = styled.div`
  background: #111;
  border-left: 1px solid #222;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  @media (max-width: 900px) {
    border-left: none;
    border-top: 1px solid #222;
    height: 480px;
  }
`

const SidebarTabs = styled.div`
  display: flex;
  border-bottom: 1px solid #222;
  flex-shrink: 0;
`

const SidebarTab = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 12px;
  border: none;
  background: none;
  color: ${({ $active }) => $active ? '#fff' : 'rgba(255,255,255,0.4)'};
  font-size: 0.8125rem;
  font-weight: ${({ $active }) => $active ? 700 : 400};
  border-bottom: 2px solid ${({ $active }) => $active ? '#E63946' : 'transparent'};
  cursor: pointer;
  transition: all 0.15s;
`

const SidebarContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
`

// ── Reaction layer ──────────────────────────────────────────────────────────

const ReactionLayer = styled.div`
  position: relative;
  padding: 12px;
  border-bottom: 1px solid #222;
  flex-shrink: 0;
`

const ReactionBursts = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
`

const FloatingEmoji = styled.span<{ $x: number }>`
  position: absolute;
  bottom: 8px;
  left: ${({ $x }) => $x}%;
  font-size: 1.5rem;
  animation: ${floatUp} 2.5s ease-out forwards;
  pointer-events: none;
`

const ReactionButtons = styled.div`
  display: flex;
  gap: 6px;
  justify-content: space-around;
  position: relative;
  z-index: 1;
`

const ReactionBtn = styled.button`
  flex: 1;
  padding: 6px 0;
  border: 1px solid #2a2a2a;
  border-radius: ${({ theme }) => theme.radii.md};
  background: #1a1a1a;
  font-size: 1.25rem;
  cursor: pointer;
  transition: background 0.1s, transform 0.1s;
  &:hover { background: #2a2a2a; transform: scale(1.1); }
  &:active { transform: scale(0.95); }
`

const REACTION_EMOJIS: Record<ReactionType, string> = {
  APPLAUSE: '👏',
  FIRE: '🔥',
  POSITIVE: '👍',
  QUESTION: '❓',
  DISAGREEMENT: '😤',
}

// ── Chat ────────────────────────────────────────────────────────────────────

const ChatMessage = styled.div`
  display: flex;
  gap: 8px;
  align-items: flex-start;
`

const MsgAvatar = styled.div<{ $url?: string | null }>`
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: ${({ $url, theme }) => $url ? `url(${$url}) center/cover` : theme.colors.primary};
  flex-shrink: 0;
  margin-top: 2px;
`

const MsgBody = styled.div`
  flex: 1;
`

const MsgAuthor = styled.span`
  font-size: 0.75rem;
  font-weight: 700;
  color: rgba(255,255,255,0.7);
  margin-right: 6px;
`

const MsgText = styled.span`
  font-size: 0.8125rem;
  color: rgba(255,255,255,0.9);
  line-height: 1.4;
`

const ChatInput = styled.div`
  padding: 10px 12px;
  border-top: 1px solid #222;
  flex-shrink: 0;
  display: flex;
  gap: 8px;
`

const TextInput = styled.input`
  flex: 1;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #2a2a2a;
  border-radius: ${({ theme }) => theme.radii.md};
  background: #1a1a1a;
  color: #fff;
  font-size: 0.875rem;
  outline: none;
  &:focus { border-color: #444; }
  &::placeholder { color: rgba(255,255,255,0.3); }
`

const SendBtn = styled.button`
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`

const Cooldown = styled.span`
  font-size: 0.75rem;
  color: rgba(255,255,255,0.3);
  align-self: center;
`

// ── Questions ───────────────────────────────────────────────────────────────

const QuestionCard = styled.div`
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 10px 12px;
`

const QuestionText = styled.p`
  font-size: 0.875rem;
  color: rgba(255,255,255,0.9);
  margin-bottom: 8px;
  line-height: 1.4;
`

const QuestionMeta = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`

const QuestionAuthor = styled.span`
  font-size: 0.75rem;
  color: rgba(255,255,255,0.4);
`

const UpvoteBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid #333;
  border-radius: ${({ theme }) => theme.radii.full};
  background: none;
  color: rgba(255,255,255,0.6);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.1s;
  &:hover { border-color: #E63946; color: #E63946; }
`

const QAInput = styled.div`
  padding: 10px 12px;
  border-top: 1px solid #222;
  flex-shrink: 0;
  display: flex;
  gap: 8px;
`

// ── Polls ────────────────────────────────────────────────────────────────────

const PollCard = styled.div`
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 14px;
`

const PollQuestion = styled.p`
  font-size: 0.9375rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 12px;
`

const PollOption = styled.button<{ $voted: boolean }>`
  width: 100%;
  margin-bottom: 8px;
  padding: 8px 12px;
  border: 1px solid ${({ $voted }) => $voted ? '#E63946' : '#2a2a2a'};
  border-radius: ${({ theme }) => theme.radii.md};
  background: none;
  color: #fff;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: border-color 0.15s;
  &:hover { border-color: #E63946; }
`

const PollBar = styled.div<{ $pct: number }>`
  position: absolute;
  inset: 0;
  width: ${({ $pct }) => $pct}%;
  background: rgba(230, 57, 70, 0.12);
  transition: width 0.4s ease;
`

const PollOptionText = styled.span`
  position: relative;
  z-index: 1;
`

const PollPct = styled.span`
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.75rem;
  font-weight: 700;
  color: rgba(255,255,255,0.6);
  z-index: 1;
`

const NoPoll = styled.p`
  font-size: 0.875rem;
  color: rgba(255,255,255,0.3);
  text-align: center;
  padding: 32px 0;
`

// ── HLS Player component ────────────────────────────────────────────────────

function HlsPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { setPlayerReady } = useDebateStore()

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setPlayerReady(true)
        video.play().catch(() => null)
      })
      return () => hls.destroy()
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      video.onloadedmetadata = () => {
        setPlayerReady(true)
        video.play().catch(() => null)
      }
    }
  }, [src, setPlayerReady])

  return <HlsVideo ref={videoRef} playsInline controls />
}

// ── LiveKit video grid for participants ─────────────────────────────────────

function LiveKitVideoGrid() {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ])
  return (
    <GridLayout tracks={tracks} style={{ height: '100%' }}>
      <ParticipantTile />
    </GridLayout>
  )
}

// ── Countdown timer ─────────────────────────────────────────────────────────

function DebateCountdown({ scheduledFor }: { scheduledFor: string }) {
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    const tick = () => {
      const diff = new Date(scheduledFor).getTime() - Date.now()
      if (diff <= 0) { setRemaining('Em breve...'); return }
      const h = Math.floor(diff / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      const s = Math.floor((diff % 60_000) / 1_000)
      setRemaining(`${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [scheduledFor])

  return (
    <Countdown>
      <CountdownLabel>O debate começa em</CountdownLabel>
      <CountdownTime>{remaining}</CountdownTime>
    </Countdown>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

type SidebarTab = 'chat' | 'questions' | 'poll'

export default function DebateWatch() {
  const { id } = useParams<{ id: string }>()
  const { data: debate, isLoading } = useDebate(id!)
  const store = useDebateStore()
  const activeContext = useAuthStore((s) => s.activeContext)
  const user = useAuthStore((s) => s.user)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('chat')
  const [chatText, setChatText] = useState('')
  const [qaText, setQaText] = useState('')
  const [votedPolls, setVotedPolls] = useState<Record<string, string>>({}) // pollId → optionId
  const [watchParticipantId, setWatchParticipantId] = useState<string | null>(null) // null = transmissão principal
  const [streamUrl, setStreamUrl] = useState('')
  const [ownStreamUrl, setOwnStreamUrl] = useState('')
  const [streamError, setStreamError] = useState('')

  const isParticipant = debate?.participants.some(
    (p) => p.politicianId === activeContext?.id && p.inviteStatus === 'CONFIRMED'
  ) ?? false

  // Anfitrião: o político (creatorId) ou a entidade (hostEntityId) que organiza o debate.
  const isCreator =
    !!activeContext && (debate?.creatorId === activeContext.id || debate?.hostEntityId === activeContext.id)
  const isLive = (store.debate ?? debate)?.status === 'LIVE'
  const isYoutube = (store.debate ?? debate)?.streamProvider === 'YOUTUBE'

  // Só debates antigos (LiveKit) usam token; os do YouTube não passam por aqui.
  const { data: livekitData } = useDebateLivekitToken(id!, !!user && isLive && !isYoutube)
  const { data: questionsData } = useDebateQuestions(id!, isLive)
  const { data: initialMessages } = useDebateMessages(id!)
  const { data: activePollData } = useDebateActivePoll(id!)

  const startDebate = useStartDebate(id!)
  const endDebate = useEndDebate(id!)
  const submitQuestion = useSubmitQuestion(id!)
  const upvoteQuestion = useUpvoteQuestion(id!)
  const votePoll = useVotePoll(id!)
  const setStream = useSetDebateStream(id!)
  const setOwnStream = useSetParticipantStream(id!)

  const { sendReaction, sendMessage } = useDebateSocket(id!)

  useEffect(() => {
    if (debate) store.setDebate(debate)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debate?.id, debate?.status])

  // Link da live (do anfitrião ou de um debatedor) mudou: traz o debate novo para a tela.
  const streamKey = JSON.stringify([debate?.youtubeVideoId, debate?.participants.map((p) => p.youtubeVideoId)])
  useEffect(() => {
    if (debate) store.setDebate(debate)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamKey])

  useEffect(() => {
    if (questionsData) store.setQuestions(questionsData)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionsData])

  // Seed chat with last 50 messages on mount
  useEffect(() => {
    if (initialMessages?.length) {
      initialMessages.forEach((msg) => store.addMessage(msg))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!initialMessages])

  // Seed active poll on mount
  useEffect(() => {
    if (activePollData) store.setActivePoll(activePollData)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePollData?.id])

  const currentDebate = store.debate ?? debate
  const cooldownRemaining = Math.max(0, Math.ceil((store.chatCooldownUntil - Date.now()) / 1000))

  function handleSendMessage() {
    if (!chatText.trim()) return
    const ok = sendMessage(chatText.trim())
    if (ok) setChatText('')
  }

  async function handleSendQuestion() {
    if (!qaText.trim()) return
    await submitQuestion.mutateAsync(qaText.trim())
    setQaText('')
  }

  async function handleVotePoll(pollId: string, optionId: string) {
    if (votedPolls[pollId]) return
    setVotedPolls((v) => ({ ...v, [pollId]: optionId }))
    await votePoll.mutateAsync({ pollId, optionId })
  }

  function streamErrorMessage(err: unknown) {
    const message = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
    return (Array.isArray(message) ? message[0] : message) ?? 'Não deu para salvar o link agora. Tente de novo.'
  }

  function handleSaveStream() {
    if (!streamUrl.trim()) return
    setStreamError('')
    setStream.mutate(streamUrl.trim(), {
      onSuccess: () => setStreamUrl(''),
      onError: (e) => setStreamError(streamErrorMessage(e)),
    })
  }

  function handleSaveOwnStream(url: string | null) {
    if (!activeContext) return
    setStreamError('')
    setOwnStream.mutate(
      { politicianId: activeContext.id, url },
      {
        onSuccess: () => setOwnStreamUrl(''),
        onError: (e) => setStreamError(streamErrorMessage(e)),
      },
    )
  }

  if (isLoading || !currentDebate) {
    return (
      <Page>
        <Navbar />
        <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingTop: 80 }}>
          Carregando debate...
        </div>
      </Page>
    )
  }

  const hlsUrl = currentDebate.hlsUrl
  const recordingUrl = currentDebate.recordingUrl

  // YouTube: o vídeo principal é do canal anfitrião; um debatedor pode ter o dele.
  const watchingParticipant = currentDebate.participants.find(
    (p) => p.id === watchParticipantId && p.youtubeVideoId,
  )
  const activeVideoId = watchingParticipant?.youtubeVideoId ?? currentDebate.youtubeVideoId
  const activeChannelTitle = watchingParticipant
    ? watchingParticipant.youtubeChannelTitle
    : currentDebate.youtubeChannelTitle
  const hasParticipantStreams = currentDebate.participants.some(
    (p) => p.inviteStatus === 'CONFIRMED' && p.youtubeVideoId,
  )
  const hostName = currentDebate.creator?.name ?? currentDebate.hostEntity?.legalName ?? 'Votz'
  const streamEditable = currentDebate.status === 'SCHEDULED' || currentDebate.status === 'LIVE'
  const myParticipant = currentDebate.participants.find(
    (p) => p.politicianId === activeContext?.id && p.inviteStatus === 'CONFIRMED',
  )

  return (
    <Page>
      <Navbar />
      <Body>
        {/* ── Main column ─────────────────────────────────────────────────── */}
        <Main>
          <VideoArea>
            {isYoutube ? (
              currentDebate.status === 'SCHEDULED' ? (
                <DebateCountdown scheduledFor={currentDebate.scheduledFor} />
              ) : (currentDebate.status === 'LIVE' || currentDebate.status === 'ENDED') && activeVideoId ? (
                <YoutubePlayer
                  key={activeVideoId}
                  videoId={activeVideoId}
                  channelTitle={activeChannelTitle}
                  title={currentDebate.title}
                />
              ) : (
                <EndedPlaceholder>
                  <p>{currentDebate.status === 'CANCELLED' ? 'Debate cancelado' : 'Debate encerrado'}</p>
                </EndedPlaceholder>
              )
            ) : currentDebate.status === 'LIVE' && livekitData?.token && !hlsUrl ? (
              // LiveKit: participants publish, citizens subscribe-only
              <LiveKitRoom
                token={livekitData.token}
                serverUrl={import.meta.env.VITE_LIVEKIT_URL as string ?? 'wss://localhost:7880'}
                video={livekitData.canPublish}
                audio={livekitData.canPublish}
                data-lk-theme="default"
                style={{ width: '100%', height: '100%' }}
              >
                <LiveKitVideoGrid />
                <RoomAudioRenderer />
                {livekitData.canPublish && <ControlBar variation="minimal" />}
              </LiveKitRoom>
            ) : currentDebate.status === 'LIVE' && hlsUrl ? (
              // HLS Egress (when R2 is configured) — scales to unlimited viewers
              <HlsPlayer src={hlsUrl} />
            ) : currentDebate.status === 'LIVE' ? (
              <Countdown>
                <CountdownLabel>Stream iniciando...</CountdownLabel>
              </Countdown>
            ) : currentDebate.status === 'SCHEDULED' ? (
              <DebateCountdown scheduledFor={currentDebate.scheduledFor} />
            ) : currentDebate.status === 'ENDED' && recordingUrl ? (
              <HlsVideo src={recordingUrl} controls playsInline />
            ) : (
              <EndedPlaceholder>
                <p>Debate encerrado</p>
                {!recordingUrl && <p style={{ fontSize: '0.8125rem', marginTop: 4 }}>Gravação sendo processada...</p>}
              </EndedPlaceholder>
            )}

            {currentDebate.status === 'LIVE' && <LiveBadge><LiveDot />AO VIVO</LiveBadge>}
            {currentDebate.status === 'LIVE' && (
              <ViewerBadge>{(store.viewerCount || currentDebate.viewerCount).toLocaleString('pt-BR')} assistindo</ViewerBadge>
            )}
          </VideoArea>

          <DebateInfoBar>
            <DebateTitle>{currentDebate.title}</DebateTitle>
            <HostLine>
              Organizado por {hostName}
              {isYoutube && currentDebate.youtubeChannelTitle
                ? ` · transmissão pelo canal ${currentDebate.youtubeChannelTitle}`
                : ''}
            </HostLine>
            <ParticipantRow>
              {isYoutube && hasParticipantStreams && (
                <WatchBtn $active={!watchingParticipant} onClick={() => setWatchParticipantId(null)}>
                  Transmissão principal
                </WatchBtn>
              )}
              {currentDebate.participants
                .filter((p) => p.inviteStatus === 'CONFIRMED')
                .map((p) => (
                  <ParticipantChip key={p.id}>
                    <SmallAvatar $url={p.politician.avatarUrl} />
                    <ProfileLink to={`/politico/${p.politicianId}`}>{p.politician.name}</ProfileLink>
                    <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                      · {p.politician.party.abbreviation}
                    </span>
                    {isYoutube && p.youtubeVideoId && (
                      <WatchBtn
                        $active={watchingParticipant?.id === p.id}
                        onClick={() => setWatchParticipantId(p.id)}
                      >
                        Assistir pelo canal de {p.youtubeChannelTitle ?? p.politician.name}
                      </WatchBtn>
                    )}
                  </ParticipantChip>
                ))}
            </ParticipantRow>
            {isYoutube && (
              <StreamNote>
                Vídeo hospedado no YouTube. O Votz guarda o registro do debate (quem participou, perguntas, enquetes e
                resultado), mas não controla o vídeo, que pode sair do ar.
              </StreamNote>
            )}
          </DebateInfoBar>

          {isCreator && isYoutube && streamEditable && (
            <StreamBar>
              <StreamBarLabel>
                {currentDebate.youtubeVideoId
                  ? 'Live do YouTube definida. Cole outro link para trocar.'
                  : 'Cole o link da live do YouTube para poder iniciar o debate.'}
              </StreamBarLabel>
              <StreamForm>
                <StreamInput
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveStream()}
                  placeholder="https://www.youtube.com/watch?v=..."
                  maxLength={300}
                />
                <ActionBtn onClick={handleSaveStream} disabled={!streamUrl.trim() || setStream.isPending}>
                  {setStream.isPending ? 'Conferindo...' : 'Salvar link'}
                </ActionBtn>
              </StreamForm>
              <StreamNote>
                A live precisa ser de um canal verificado e ter “Permitir incorporação” ligado.
                Verifique o canal no perfil, em “Canais do YouTube”.
              </StreamNote>
              {streamError && <StreamError>{streamError}</StreamError>}
            </StreamBar>
          )}

          {isParticipant && !isCreator && isYoutube && streamEditable && myParticipant && (
            <StreamBar>
              <StreamBarLabel>
                {myParticipant.youtubeVideoId
                  ? `Seu link está no ar (${myParticipant.youtubeChannelTitle ?? 'seu canal'}).`
                  : 'Você tem uma live no seu canal? Cole o link para o público assistir por lá também (opcional).'}
              </StreamBarLabel>
              <StreamForm>
                <StreamInput
                  value={ownStreamUrl}
                  onChange={(e) => setOwnStreamUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && ownStreamUrl.trim() && handleSaveOwnStream(ownStreamUrl.trim())}
                  placeholder="https://www.youtube.com/watch?v=..."
                  maxLength={300}
                />
                <ActionBtn
                  onClick={() => handleSaveOwnStream(ownStreamUrl.trim())}
                  disabled={!ownStreamUrl.trim() || setOwnStream.isPending}
                >
                  {setOwnStream.isPending ? 'Conferindo...' : 'Salvar meu link'}
                </ActionBtn>
                {myParticipant.youtubeVideoId && (
                  <ActionBtn $variant="danger" onClick={() => handleSaveOwnStream(null)} disabled={setOwnStream.isPending}>
                    Tirar meu link
                  </ActionBtn>
                )}
              </StreamForm>
              {streamError && <StreamError>{streamError}</StreamError>}
            </StreamBar>
          )}

          {isCreator && (
            <CreatorActions>
              {currentDebate.status === 'SCHEDULED' && (
                <ActionBtn
                  onClick={() => startDebate.mutate()}
                  disabled={startDebate.isPending || (isYoutube && !currentDebate.youtubeVideoId)}
                  title={isYoutube && !currentDebate.youtubeVideoId ? 'Cole o link da live antes de iniciar' : undefined}
                >
                  {startDebate.isPending ? 'Iniciando...' : '▶ Iniciar ao vivo'}
                </ActionBtn>
              )}
              {currentDebate.status === 'LIVE' && (
                <ActionBtn $variant="danger" onClick={() => endDebate.mutate()} disabled={endDebate.isPending}>
                  {endDebate.isPending ? 'Encerrando...' : '■ Encerrar debate'}
                </ActionBtn>
              )}
            </CreatorActions>
          )}
        </Main>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <Sidebar>
          {/* Reactions */}
          <ReactionLayer>
            <ReactionBursts>
              {store.reactionBursts.map((b) => (
                <FloatingEmoji key={b.id} $x={b.x}>
                  {REACTION_EMOJIS[b.type]}
                </FloatingEmoji>
              ))}
            </ReactionBursts>
            <ReactionButtons>
              {(Object.keys(REACTION_EMOJIS) as ReactionType[]).map((type) => (
                <ReactionBtn key={type} onClick={() => sendReaction(type)} title={type.toLowerCase()}>
                  {REACTION_EMOJIS[type]}
                </ReactionBtn>
              ))}
            </ReactionButtons>
          </ReactionLayer>

          {/* Tabs */}
          <SidebarTabs>
            <SidebarTab $active={sidebarTab === 'chat'} onClick={() => setSidebarTab('chat')}>Chat</SidebarTab>
            <SidebarTab $active={sidebarTab === 'questions'} onClick={() => setSidebarTab('questions')}>
              Perguntas {store.questions.length > 0 && `(${store.questions.length})`}
            </SidebarTab>
            <SidebarTab $active={sidebarTab === 'poll'} onClick={() => setSidebarTab('poll')}>Enquete</SidebarTab>
          </SidebarTabs>

          {/* Chat */}
          {sidebarTab === 'chat' && (
            <>
              <SidebarContent>
                {store.messages.length === 0 && (
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8125rem', textAlign: 'center', paddingTop: 16 }}>
                    Nenhuma mensagem ainda. Seja o primeiro!
                  </p>
                )}
                {store.messages.map((msg) => (
                  <ChatMessage key={msg.id}>
                    <MsgAvatar $url={msg.author.avatarUrl} />
                    <MsgBody>
                      <MsgAuthor>{msg.author.name}</MsgAuthor>
                      <MsgText>{msg.text}</MsgText>
                    </MsgBody>
                  </ChatMessage>
                ))}
              </SidebarContent>
              {user && (
                <ChatInput>
                  <TextInput
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Escreva uma mensagem..."
                    maxLength={500}
                    disabled={cooldownRemaining > 0}
                  />
                  {cooldownRemaining > 0 ? (
                    <Cooldown>{cooldownRemaining}s</Cooldown>
                  ) : (
                    <SendBtn onClick={handleSendMessage} disabled={!chatText.trim()}>
                      Enviar
                    </SendBtn>
                  )}
                </ChatInput>
              )}
            </>
          )}

          {/* Questions */}
          {sidebarTab === 'questions' && (
            <>
              <SidebarContent>
                {store.questions.length === 0 && (
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8125rem', textAlign: 'center', paddingTop: 16 }}>
                    Nenhuma pergunta ainda.
                  </p>
                )}
                {[...store.questions].sort((a, b) => b.upvotes - a.upvotes).map((q) => (
                  <QuestionCard key={q.id}>
                    <QuestionText>{q.text}</QuestionText>
                    <QuestionMeta>
                      <QuestionAuthor>{q.author.name}</QuestionAuthor>
                      <UpvoteBtn onClick={() => {
                        store.upvoteQuestionOptimistic(q.id)
                        upvoteQuestion.mutate(q.id)
                      }}>
                        ▲ {q.upvotes}
                      </UpvoteBtn>
                    </QuestionMeta>
                  </QuestionCard>
                ))}
              </SidebarContent>
              {user && (
                <QAInput>
                  <TextInput
                    value={qaText}
                    onChange={(e) => setQaText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendQuestion()}
                    placeholder="Faça uma pergunta..."
                    maxLength={500}
                  />
                  <SendBtn onClick={handleSendQuestion} disabled={!qaText.trim() || submitQuestion.isPending}>
                    Enviar
                  </SendBtn>
                </QAInput>
              )}
            </>
          )}

          {/* Poll */}
          {sidebarTab === 'poll' && (
            <SidebarContent>
              {!store.activePoll ? (
                <NoPoll>Nenhuma enquete ativa no momento.</NoPoll>
              ) : (
                <PollCard>
                  <PollQuestion>{store.activePoll.question}</PollQuestion>
                  {(() => {
                    const totalVotes = store.activePoll.options.reduce((s, o) => s + o.totalVotes, 0)
                    const myVote = votedPolls[store.activePoll.id]
                    return store.activePoll.options.map((opt) => {
                      const pct = totalVotes > 0 ? Math.round((opt.totalVotes / totalVotes) * 100) : 0
                      return (
                        <PollOption
                          key={opt.id}
                          $voted={myVote === opt.id}
                          onClick={() => handleVotePoll(store.activePoll!.id, opt.id)}
                          disabled={!!myVote}
                        >
                          <PollBar $pct={pct} />
                          <PollOptionText>{opt.text}</PollOptionText>
                          {myVote && <PollPct>{pct}%</PollPct>}
                        </PollOption>
                      )
                    })
                  })()}
                  <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
                    {store.activePoll.options.reduce((s, o) => s + o.totalVotes, 0)} votos
                  </p>
                </PollCard>
              )}
            </SidebarContent>
          )}
        </Sidebar>
      </Body>
    </Page>
  )
}
