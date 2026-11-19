export interface ConversationPerson {
    id: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
    verified: boolean;
}
export type ConversationRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export interface ConversationSummary {
    id: string;
    kind: 'DIRECT' | 'GROUP';
    title: string | null;
    revision: number;
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
    myState: 'ACTIVE' | 'INVITED';
    myRole: ConversationRole;
    invitedBy: ConversationPerson | null;
    memberCount: number;
    /** Só horário e autoria: o servidor não conhece o texto das mensagens. */
    lastMessage: {
        eventId: string;
        at: string;
        fromMe: boolean;
    } | null;
    /** Mensagens recebidas desde a última vez que você abriu a conversa. */
    unreadCount: number;
    /** Quando preenchido e no futuro, notificações desta conversa ficam silenciadas. */
    mutedUntil?: string | null;
    members: {
        user: ConversationPerson;
        state: 'ACTIVE' | 'INVITED';
        role: ConversationRole;
    }[];
}
export type ConversationMuteDuration = '8h' | '1w' | 'forever' | 'off';
export type ConversationReportReason = 'OFFENSIVE' | 'SPAM_OR_ADS' | 'SEXUAL_OR_VIOLENT' | 'FAKE_PROFILE' | 'PERSONAL_DATA' | 'OTHER';
export declare const CONVERSATION_REPORT_REASONS: {
    value: ConversationReportReason;
    label: string;
}[];
export interface ConversationTypingEvent {
    conversationId: string;
    userId: string;
    userName: string;
    typing: boolean;
}
export interface ConversationsPage {
    items: ConversationSummary[];
    total: number;
    page: number;
    limit: number;
}
export interface ConversationCapabilities {
    enabled: boolean;
    messagingEnabled: boolean;
    callsEnabled: boolean;
}
export interface CreateConversationGroup {
    clientRequestId: string;
    title: string;
    memberIds: string[];
}
export interface ConversationBlocksPage {
    items: {
        blockedId: string;
        createdAt: string;
        blocked: ConversationPerson;
    }[];
    total: number;
    page: number;
    limit: number;
}
/** Horário na lista: hora se for hoje, "Ontem", ou a data. Igual no web e no mobile. */
export declare function conversationTime(iso: string, now?: Date): string;
/** "3", "99+" — o contador de não lidas como aparece no selo. */
export declare function conversationUnreadLabel(count: number): string;
export declare function conversationMemberLabel(count: number): string;
export declare function conversationTitle(conversation: ConversationSummary, userId: string): string;
export declare function conversationIsMuted(mutedUntil: string | null | undefined, now?: Date): boolean;
export declare function conversationTypingLabel(names: string[]): string;
//# sourceMappingURL=conversation.d.ts.map