import type { Debate, DebateStatus, ReactionType } from './types'

/** Endereço do site do Votz. O YouTube exige uma origem de verdade para mostrar o vídeo dentro de um app. */
export const EMBED_ORIGIN = 'https://votz.app'

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export const STATUS_LABELS: Record<DebateStatus, string> = {
  LIVE: 'Ao vivo', SCHEDULED: 'Agendado', ENDED: 'Encerrado', CANCELLED: 'Cancelado',
}

export const REACTIONS: readonly { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'APPLAUSE', emoji: '👏', label: 'Aplaudir' },
  { type: 'FIRE', emoji: '🔥', label: 'Concordar com força' },
  { type: 'POSITIVE', emoji: '👍', label: 'Gostei' },
  { type: 'QUESTION', emoji: '❓', label: 'Fiquei com dúvida' },
  { type: 'DISAGREEMENT', emoji: '😤', label: 'Discordo' },
]

export function isVideoId(value: unknown): value is string {
  return typeof value === 'string' && VIDEO_ID.test(value)
}

/** Player do YouTube sem cookies de rastreio. Só vale para um id de vídeo válido. */
export function youtubeEmbedUrl(videoId: string): string | null {
  if (!isVideoId(videoId)) return null
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1&origin=${encodeURIComponent(EMBED_ORIGIN)}`
}

export function youtubeWatchUrl(videoId: string): string | null {
  return isVideoId(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : null
}

/**
 * Qual vídeo mostrar: o do debatedor escolhido, se ele tiver link; senão o principal (canal do anfitrião).
 * Só conta debatedor com presença confirmada.
 */
export function activeStream(debate: Pick<Debate, 'youtubeVideoId' | 'youtubeChannelTitle' | 'participants'>, participantId: string | null) {
  const chosen = participantId
    ? debate.participants.find((p) => p.id === participantId && p.inviteStatus === 'CONFIRMED' && isVideoId(p.youtubeVideoId))
    : undefined
  if (chosen) return { videoId: chosen.youtubeVideoId, channelTitle: chosen.youtubeChannelTitle, participantId: chosen.id }
  return { videoId: debate.youtubeVideoId, channelTitle: debate.youtubeChannelTitle, participantId: null }
}

export function hostLabel(debate: Pick<Debate, 'creator' | 'hostEntity'>): string {
  return debate.creator?.name ?? debate.hostEntity?.legalName ?? 'Votz'
}

/** "Começa em 2h 05min", "Começa em 12min" ou "Começa em instantes". */
export function countdownLabel(scheduledFor: string, now = Date.now()): string {
  const minutes = Math.ceil((new Date(scheduledFor).getTime() - now) / 60_000)
  if (!(minutes > 1)) return 'Começa em instantes'
  if (minutes < 60) return `Começa em ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Começa em ${hours}h ${String(minutes % 60).padStart(2, '0')}min`
  const days = Math.floor(hours / 24)
  return `Começa em ${days} ${days === 1 ? 'dia' : 'dias'}`
}
