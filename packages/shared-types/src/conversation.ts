export interface ConversationPerson {
  id: string
  name: string
  username: string | null
  avatarUrl: string | null
  verified: boolean
}
export type ConversationRole = 'OWNER' | 'ADMIN' | 'MEMBER'
export interface ConversationSummary {
  id: string
  kind: 'DIRECT' | 'GROUP'
  title: string | null
  revision: number
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  myState: 'ACTIVE' | 'INVITED'
  myRole: ConversationRole
  invitedBy: ConversationPerson | null
  memberCount: number
  /** Só horário e autoria: o servidor não conhece o texto das mensagens. */
  lastMessage: { eventId: string; at: string; fromMe: boolean } | null
  /** Mensagens recebidas desde a última vez que você abriu a conversa. */
  unreadCount: number
  /** Quando preenchido e no futuro, notificações desta conversa ficam silenciadas. */
  mutedUntil?: string | null
  members: { user: ConversationPerson; state: 'ACTIVE' | 'INVITED'; role: ConversationRole }[]
}
export type ConversationMuteDuration = '8h' | '1w' | 'forever' | 'off'
export type ConversationReportReason =
  | 'OFFENSIVE'
  | 'SPAM_OR_ADS'
  | 'SEXUAL_OR_VIOLENT'
  | 'FAKE_PROFILE'
  | 'PERSONAL_DATA'
  | 'OTHER'
export const CONVERSATION_REPORT_REASONS: { value: ConversationReportReason; label: string }[] = [
  { value: 'OFFENSIVE', label: 'Ofensa ou assédio' },
  { value: 'SPAM_OR_ADS', label: 'Spam ou golpe' },
  { value: 'SEXUAL_OR_VIOLENT', label: 'Conteúdo violento ou impróprio' },
  { value: 'FAKE_PROFILE', label: 'Perfil falso ou se passando por alguém' },
  { value: 'PERSONAL_DATA', label: 'Exposição de dados pessoais' },
  { value: 'OTHER', label: 'Outro motivo' },
]
export interface ConversationTypingEvent {
  conversationId: string
  userId: string
  userName: string
  typing: boolean
}
export interface ConversationsPage {
  items: ConversationSummary[]
  total: number
  page: number
  limit: number
}
export interface ConversationCapabilities {
  enabled: boolean
  messagingEnabled: boolean
  callsEnabled: boolean
}
export interface CreateConversationGroup {
  clientRequestId: string
  title: string
  memberIds: string[]
}
export interface ConversationBlocksPage {
  items: { blockedId: string; createdAt: string; blocked: ConversationPerson }[]
  total: number
  page: number
  limit: number
}
/** Horário na lista: hora se for hoje, "Ontem", ou a data. Igual no web e no mobile. */
export function conversationTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const day = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((day(now) - day(at)) / 86_400_000)
  if (days <= 0)
    return at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Ontem'
  return at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
/** "3", "99+" — o contador de não lidas como aparece no selo. */
export function conversationUnreadLabel(count: number): string {
  return count > 99 ? '99+' : String(Math.max(0, Math.floor(count)))
}
export function conversationMemberLabel(count: number): string {
  return `${count} ${count === 1 ? 'participante' : 'participantes'}`
}
export function conversationTitle(conversation: ConversationSummary, userId: string): string {
  return conversation.kind === 'GROUP'
    ? conversation.title || 'Grupo'
    : conversation.members.find((member) => member.user.id !== userId)?.user.name || 'Conversa'
}
export function conversationIsMuted(mutedUntil: string | null | undefined, now: Date = new Date()): boolean {
  if (!mutedUntil) return false
  const until = new Date(mutedUntil)
  return !Number.isNaN(until.getTime()) && until.getTime() > now.getTime()
}
export function conversationTypingLabel(names: string[]): string {
  const unique = names.map((n) => n.trim().split(' ')[0]).filter(Boolean)
  if (!unique.length) return ''
  if (unique.length === 1) return `${unique[0]} está digitando...`
  if (unique.length === 2) return `${unique[0]} e ${unique[1]} estão digitando...`
  return 'Várias pessoas estão digitando...'
}
