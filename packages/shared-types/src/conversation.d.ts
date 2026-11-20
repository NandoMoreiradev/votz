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
    /** Quando preenchido, conversa fixada no topo da lista. */
    pinnedAt?: string | null;
    /** Último acesso do contato em conversas individuais, respeitando reciprocidade de privacidade. */
    peerLastSeenAt?: string | null;
    members: {
        user: ConversationPerson;
        state: 'ACTIVE' | 'INVITED';
        role: ConversationRole;
    }[];
}
/**
 * Junta listas já ordenadas da mais nova para a mais antiga (conversas entre pessoas e conversas
 * com páginas) numa caixa só, sem furar a ordem entre páginas de resultado: o que for mais antigo
 * que o último item carregado de uma lista que ainda tem mais fica de fora até carregar a próxima.
 * Fixadas vêm primeiro, na ordem em que chegaram.
 */
export declare function mergeInboxLists<T>(lists: {
    items: T[];
    hasMore: boolean;
}[], at: (item: T) => string, pinned?: (item: T) => boolean): T[];
export type ConversationAudience = 'EVERYONE' | 'CONTACTS' | 'NOBODY';
export type ConversationDirectPolicy = 'EVERYONE' | 'FOLLOWING' | 'NOBODY';
/** Página (político, entidade ou empresa) que a pessoa segue, como aparece em "Nova conversa". */
export interface ConversationPageOption {
    orgType: 'POLITICIAN' | 'ENTITY' | 'COMPANY';
    orgId: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
}
/** Primeira tela de "Nova conversa": quem eu sigo, quem me segue e as páginas que eu sigo. */
export interface ConversationStartOptions {
    following: ConversationPerson[];
    followers: ConversationPerson[];
    pages: ConversationPageOption[];
}
export type ConversationMediaAutoDownload = 'WIFI_ONLY' | 'ALWAYS' | 'NEVER';
/** Qualidade das fotos e dos vídeos que a pessoa envia (NORMAL: 1600 px / 720p; HIGH: 2560 px / 1080p). */
export type ConversationMediaUploadQuality = 'NORMAL' | 'HIGH';
export type ConversationFontScale = 'SMALL' | 'MEDIUM' | 'LARGE';
export type ConversationWallpaper = 'DEFAULT' | 'SOFT' | 'PLAIN';
export interface ConversationSettings {
    readReceiptsEnabled: boolean;
    lastSeenVisibility: ConversationAudience;
    groupInvitePolicy: ConversationAudience;
    directRequestPolicy: ConversationDirectPolicy;
    notifySound: boolean;
    notifyVibration: boolean;
    notifyPreview: boolean;
    securityAlertsEnabled: boolean;
    keyBackupEnabled: boolean;
    mediaAutoDownload: ConversationMediaAutoDownload;
    mediaUploadQuality: ConversationMediaUploadQuality;
    fontScale: ConversationFontScale;
    wallpaper: ConversationWallpaper;
}
export type UpdateConversationSettings = Partial<ConversationSettings>;
export declare const DEFAULT_CONVERSATION_SETTINGS: ConversationSettings;
export declare function conversationFontSize(scale: ConversationFontScale | undefined): number;
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
/** "Visto por último hoje às 21:40", "…ontem às 21:40" ou "…em 18/11/26". */
export declare function conversationLastSeenLabel(iso: string, now?: Date): string;
/**
 * Linha abaixo do nome no cabeçalho da conversa, igual no web e no celular:
 * "digitando…" (destacado), número de participantes, visto por último ou, sem
 * essa informação, o aviso de que a conversa é protegida.
 */
export declare function conversationHeaderStatus(conversation: Pick<ConversationSummary, 'kind' | 'memberCount' | 'peerLastSeenAt'>, typingNames: string[], now?: Date): {
    text: string;
    typing: boolean;
};
//# sourceMappingURL=conversation.d.ts.map