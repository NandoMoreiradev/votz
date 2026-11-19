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
  members: { user: ConversationPerson; state: 'ACTIVE' | 'INVITED'; role: ConversationRole }[]
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
