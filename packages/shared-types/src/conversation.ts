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
export function conversationMemberLabel(count: number): string {
  return `${count} ${count === 1 ? 'participante' : 'participantes'}`
}
export function conversationTitle(conversation: ConversationSummary, userId: string): string {
  return conversation.kind === 'GROUP'
    ? conversation.title || 'Grupo'
    : conversation.members.find((member) => member.user.id !== userId)?.user.name || 'Conversa'
}
