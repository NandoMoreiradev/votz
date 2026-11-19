export type Json = Record<string, any>;
export interface ChatCredentials {
    id: string;
    secret: string;
    platform: 'web' | 'android' | 'ios' | 'test';
}
export interface ChatSession {
    deviceId: string;
    matrixUserId: string;
    singleDevicePilot: boolean;
}
export interface ChatPeer {
    matrixUserId: string;
    /** Primeiro aparelho do contato; mantido por compatibilidade. */
    deviceId: string | null;
    /** Todos os aparelhos ativos do contato. */
    devices?: string[];
    userId: string;
    /** Nome de exibição (usado em grupos para identificar quem enviou). */
    name?: string;
}
export interface ChatRoom {
    kind?: 'DIRECT' | 'GROUP';
    roomId: string;
    revision: number;
    canSend: boolean;
    /** Aparelhos ativos da própria conta (inclui o atual). */
    selfDevices?: string[];
    /** Contato na conversa individual (nulo em grupos). */
    peer: ChatPeer | null;
    /** Todos os outros participantes ativos (1 em conversa individual, N em grupo). */
    peers?: ChatPeer[];
}
/** Aviso de segurança: aparelho novo ou chave trocada num aparelho já conhecido. */
export interface ChatNotice {
    id: string;
    kind: 'device-added' | 'key-changed';
    who: 'peer' | 'self';
    userId?: string;
    deviceId: string;
    fingerprint: string;
    at: number;
}
export interface ChatDeviceLink {
    id: string;
    platform: string;
    label: string | null;
    code: string;
    expiresAt: string;
}
export interface ChatDeviceInfo {
    id: string;
    platform: string;
    label: string | null;
    createdAt: string;
    current: boolean;
}
export type ChatEnrollment = ({
    status: 'ready';
} & ChatSession) | {
    status: 'pending_approval';
    code: string;
    expiresAt: string;
};
export interface ChatVerification {
    state: 'none' | 'requested' | 'ready' | 'comparing' | 'confirmed' | 'done' | 'cancelled';
    incoming?: boolean;
    decimals?: number[];
}
export type ChatMediaKind = 'image' | 'video' | 'audio' | 'file';
export declare const CHAT_MEDIA_LIMITS: Record<ChatMediaKind, number>;
export interface ChatAttachment {
    kind: ChatMediaKind;
    id: string;
    name: string;
    mimeType: string;
    size: number;
    /** JSON padrão Matrix v2 (key, iv, hashes.sha256) trafegado só dentro do evento cifrado. */
    secret: string;
    width?: number;
    height?: number;
    durationMs?: number;
}
export interface ChatReplyTo {
    eventId: string;
    senderName?: string;
    excerpt: string;
}
export interface ChatReactionSummary {
    emoji: string;
    count: number;
    mine: boolean;
}
export interface ChatCard {
    kind: 'post' | 'report';
    id: string;
    title?: string;
    url: string;
}
export interface ChatSendOptions {
    replyTo?: ChatReplyTo;
    forwarded?: boolean;
    card?: ChatCard;
}
export interface ChatDecryptedReaction {
    targetEventId: string;
    emoji: string;
    remove: boolean;
}
export interface ChatDecryptedContent {
    text: string | null;
    attachment?: ChatAttachment;
    replyTo?: ChatReplyTo;
    forwarded?: boolean;
    card?: ChatCard;
    reaction?: ChatDecryptedReaction;
}
export declare const QUICK_REACTIONS: readonly ["👍", "❤️", "😂", "😮", "🙏"];
/** Detecta link interno de publicação ou relato do Votz para exibir cartão na bolha. */
export declare function extractVotzCard(text: string): ChatCard | undefined;
export declare function mediaKindFromMime(mimeType: string): ChatMediaKind;
export declare function mediaKindLabel(kind: ChatMediaKind): string;
export declare function formatFileSize(bytes: number): string;
export declare function buildMediaEventContent(attachment: ChatAttachment, caption?: string): Json;
export declare function parseDecryptedMessage(content: Json): ChatDecryptedContent;
export interface ChatMessage {
    id: string;
    sender: 'self' | 'peer';
    senderName?: string;
    text: string | null;
    attachment?: ChatAttachment;
    replyTo?: ChatReplyTo;
    forwarded?: boolean;
    card?: ChatCard;
    reactions?: ChatReactionSummary[];
    createdAt: number;
    status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'unverified' | 'disconnected' | 'unavailable';
    /** Resumo de entrega/leitura em grupos (ex.: "Lida por 1 de 2"). */
    receiptSummary?: string;
    txnId?: string;
}
export declare function messageStatusLabel(status: ChatMessage['status']): string;
/** Texto mostrado no lugar de uma mensagem que não pôde ser aberta. */
export declare function messagePlaceholder(status: ChatMessage['status']): string;
/** Estado da conversa segura com o contato, para a interface decidir o que mostrar. */
export type ChatPeerStatus = 'none' | 'preparing' | 'blocked' | 'ready';
/** Dica do campo de mensagem, igual no web e no mobile. */
export declare function composerPlaceholder(state: {
    peerStatus: ChatPeerStatus;
    room: {
        canSend: boolean;
    } | null;
}): string;
export interface PendingChatMessage {
    txnId: string;
    conversationId: string;
    roomId: string;
    revision: number;
    content: Json;
    createdAt: number;
    failed?: boolean;
}
export interface ChatState {
    ready: boolean;
    connected: boolean;
    messages: ChatMessage[];
    room: ChatRoom | null;
    verification: ChatVerification;
    error: string | null;
    historyCursor: string | null;
    loadingHistory: boolean;
    readReceiptsEnabled: boolean;
    /** O contato tem ao menos um aparelho em que confiamos para cifrar. */
    peerTrusted: boolean;
    peerStatus: ChatPeerStatus;
    /** Este aparelho perdeu a autorização (foi desconectado): a tela deve recomeçar com credenciais novas. */
    reactivate: boolean;
    notices: ChatNotice[];
    /** Pedidos de novos aparelhos da minha conta aguardando aprovação. */
    deviceLinks: ChatDeviceLink[];
}
export interface ReceiptJob {
    conversationId: string;
    eventId: string;
    read: boolean;
}
export interface ChatTransportState {
    cursor?: string;
    pending: PendingChatMessage[];
    receipts?: ReceiptJob[];
    acknowledged?: ReceiptJob[];
    /** Confiança no primeiro contato: usuário Matrix -> aparelho -> impressão das chaves. */
    pins?: Record<string, Record<string, string>>;
    notices?: ChatNotice[];
}
export interface ChatStorage {
    load(): Promise<ChatTransportState>;
    save(value: ChatTransportState): Promise<void>;
}
export type ChatHttp = <T = Json>(path: string, method?: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown) => Promise<T>;
export type VerificationAction = 'request' | 'accept' | 'compare' | 'confirm' | 'cancel';
export interface ChatCrypto {
    track(userId: string, roomId?: string): Promise<void>;
    /**
     * Define os aparelhos em que confiamos para cifrar para `userId`. Chaves de
     * sala e eventos cifrados nunca saem para outros aparelhos desse usuário.
     */
    trust(userId: string, deviceIds: string[]): void;
    receive(sync: Json): Promise<void>;
    pump(http: ChatHttp): Promise<void>;
    verified(userId: string, deviceId: string): Promise<boolean>;
    identity(userId: string, deviceId: string): Promise<{
        curve25519: string;
        ed25519: string;
    }>;
    share(roomId: string, userIds: string[]): Promise<void>;
    /** Descarta a sessão de envio da sala; a próxima mensagem distribui uma chave nova. */
    rotate?(roomId: string): Promise<void>;
    encrypt(roomId: string, payload: string | Json): Promise<Json>;
    decrypt(roomId: string, event: Json): Promise<string | ChatDecryptedContent>;
    encryptAttachment?(bytes: Uint8Array): Promise<{
        ciphertext: Uint8Array;
        secret: string;
    }>;
    decryptAttachment?(ciphertext: Uint8Array, secret: string): Promise<Uint8Array>;
    verification(peer: ChatPeer): Promise<ChatVerification>;
    verify(peer: ChatPeer, action: VerificationAction, http: ChatHttp): Promise<void>;
}
export declare function chatError(error: unknown): string;
/** Aviso para a pessoa, já em linguagem simples. As duas telas só desenham. */
export interface ChatViewNotice {
    id: string;
    text: string;
    detail?: string;
    /** Rótulo do botão que dispensa o aviso. */
    action: string;
    /** Enquanto não for resolvido, mensagens novas do contato ficam bloqueadas. */
    blocking: boolean;
}
export interface ChatViewDeviceRequest {
    id: string;
    title: string;
    text: string;
    allow: string;
    deny: string;
}
export interface ChatViewVerification {
    /** Há uma confirmação em andamento (o painel deve ficar aberto mesmo sem clique no banner). */
    active: boolean;
    title: string;
    description: string;
    code: string | null;
    primaryAction: {
        action: VerificationAction;
        label: string;
    } | null;
    waitingText: string | null;
    canCancel: boolean;
    cancelLabel: string;
}
export interface ChatViewAttachment {
    kind: ChatMediaKind;
    id: string;
    name: string;
    mimeType: string;
    sizeLabel: string;
    kindLabel: string;
    secret: string;
}
export interface ChatViewMessage {
    id: string;
    own: boolean;
    senderName: string | null;
    body: string;
    attachment: ChatViewAttachment | null;
    replyTo: ChatReplyTo | null;
    forwarded: boolean;
    card: (ChatCard & {
        label: string;
    }) | null;
    reactions: ChatReactionSummary[];
    canReact: boolean;
    time: string;
    meta: string;
    retryTxnId: string | null;
    retryLabel: string;
    canRetry: boolean;
}
export interface ChatViewReadReceipts {
    enabled: boolean;
    disabled: boolean;
    label: string;
    help: string;
}
export interface ChatView {
    canWrite: boolean;
    placeholder: string;
    /** Faixa fixa no topo da conversa. */
    banner: string;
    /** Ainda carregando: mostrar indicador, não formulário. */
    preparing: boolean;
    /** O contato ainda não abriu as conversas no app dele. */
    waitingPeer: string | null;
    notices: ChatViewNotice[];
    /** Pedidos de outros aparelhos da própria conta aguardando permissão. */
    deviceRequests: ChatViewDeviceRequest[];
    /** Indica se a confirmação opcional de identidade está disponível. */
    canVerify: boolean;
    /** Estado e textos do painel opcional de confirmação de identidade. */
    verification: ChatViewVerification | null;
    /** Mensagens prontas para desenhar (texto ou aviso, horário, status e reenvio). */
    messages: ChatViewMessage[];
    /** Texto exibido quando a conversa ainda está vazia e pronta para escrever. */
    emptyText: string | null;
    /** Controle de confirmação de leitura. */
    readReceipts: ChatViewReadReceipts;
    /** Há histórico mais antigo para carregar. */
    canLoadOlder: boolean;
    olderLabel: string;
}
/**
 * Tudo o que a pessoa lê na conversa, num só lugar: o web e o mobile
 * não repetem texto nem regra. Sem jargão: nada de "chave", "dispositivo"
 * ou "ativar".
 */
export declare function chatView(state: ChatState | null, peerName: string, verified?: boolean, searchQuery?: string): ChatView;
/** Pedido de outro aparelho para usar a conta, em linguagem simples. */
export declare function deviceRequestText(link: {
    label: string | null;
    platform: string;
    code: string;
}, names?: Record<string, string>): {
    title: string;
    text: string;
    allow: string;
    deny: string;
};
/** Tela de quem espera a permissão de outro aparelho. */
export declare const ENROLL_WAITING: {
    title: string;
    text: string;
    note: string;
    lost: string;
};
/** Aviso antes de redefinir quando não há mais nenhum aparelho antigo. */
export declare const RESET_WARNING: {
    title: string;
    text: string;
    action: string;
};
export interface ChatPreview {
    /** Id do evento da última mensagem, para casar com `lastMessage.eventId` da lista. */
    eventId: string;
    text: string;
}
/**
 * Prévia (texto da última mensagem) para a lista de conversas.
 *
 * Só na memória do aplicativo: nunca vai ao disco nem ao servidor. Quem usa
 * chama `clear()` ao sair da conta e quando o aplicativo vai para segundo
 * plano, igual ao restante do texto aberto.
 */
export declare const chatPreviews: {
    get: (conversationId: string) => ChatPreview | undefined;
    set(conversationId: string, preview: ChatPreview): void;
    clear(): void;
    subscribe(listener: () => void): () => void;
};
/** Este aparelho foi desconectado (por outro aparelho ou pela redefinição). O app deve recomeçar com credenciais novas. */
export declare class ChatDeviceDisconnectedError extends Error {
    constructor();
}
export interface ChatDevices {
    devices: ChatDeviceInfo[];
    links: ChatDeviceLink[];
}
/**
 * Gerenciamento de aparelhos conectados. Não precisa do motor criptográfico:
 * só das credenciais deste aparelho, enviadas pelo `http` fornecido.
 */
export declare function chatDevicesApi(http: ChatHttp): {
    list: () => Promise<ChatDevices>;
    decide: (linkId: string, approve: boolean) => Promise<Json>;
    revoke: (deviceId: string) => Promise<{
        revoked: boolean;
        self: boolean;
    }>;
};
/**
 * Ativa este aparelho. O primeiro da conta entra direto; os demais ficam
 * aguardando a aprovação de um aparelho já ativo e mostram o código ao usuário.
 * Repetir o pedido é seguro: o servidor devolve o mesmo código até expirar.
 */
export declare function enrollDevice(enroll: () => Promise<ChatEnrollment>, options: {
    onPending: (pending: {
        code: string;
        expiresAt: string;
    }) => void;
    signal?: AbortSignal;
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
}): Promise<ChatSession>;
export declare class ChatClient {
    private readonly conversationId;
    private readonly session;
    private readonly crypto;
    private readonly http;
    private readonly storage;
    private readonly newId;
    private active;
    private pins;
    private notices;
    private trusted;
    private queue;
    private listeners;
    private pending;
    private cursor;
    private events;
    private messages;
    private timer;
    private refreshAt;
    private receipts;
    private acknowledged;
    private visible;
    private received;
    private snapshot;
    constructor(conversationId: string, session: ChatSession, crypto: ChatCrypto, http: ChatHttp, storage: ChatStorage, newId: () => string);
    subscribe(listener: (value: ChatState) => void): () => void;
    getState(): ChatState;
    private update;
    private serial;
    private transport;
    private roomPeers;
    private devicesOf;
    private hasAnyPeerDevice;
    private hasTrustedPeer;
    private notify;
    /**
     * Confiança no primeiro contato. O primeiro conjunto de aparelhos que o Votz
     * apresenta para cada pessoa fica fixado; aparelho novo é aceito com aviso;
     * chave diferente num aparelho já conhecido NÃO é aceita até a pessoa decidir.
     */
    private reconcileTrust;
    /** O usuário decide sobre um aviso: aceitar a chave nova ou apenas dispensar. */
    acknowledgeNotice(id: string): Promise<void>;
    deviceList(): Promise<ChatDevices>;
    decideDeviceLink(linkId: string, approve: boolean): Promise<void>;
    revokeDevice(deviceId: string): Promise<void>;
    private refreshDeviceLinks;
    private save;
    private render;
    private seenAt;
    private seenTimer;
    /** Avisa o servidor que a pessoa abriu a conversa (zera as não lidas). Com intervalo mínimo. */
    private markSeen;
    start(): Promise<void>;
    stop(): Promise<void>;
    private lastPeerUsers;
    private receiptSummaries;
    private refresh;
    private poll;
    private refreshMessages;
    verification(action: VerificationAction): Promise<void>;
    send(text: string, options?: ChatSendOptions): Promise<void>;
    /** Alterna uma reação de emoji cifrada de ponta a ponta em uma mensagem. */
    react(targetEventId: string, emoji: string): Promise<void>;
    /**
     * Envia imagem, vídeo, áudio ou arquivo cifrado no cliente (padrão Matrix v2)
     * antes do upload. O servidor só armazena bytes opacos por 90 dias.
     */
    sendMedia(input: {
        kind: ChatMediaKind;
        name: string;
        mimeType: string;
        bytes: Uint8Array;
        caption?: string;
        width?: number;
        height?: number;
        durationMs?: number;
        upload: (ciphertext: Uint8Array) => Promise<{
            id: string;
        }>;
    }): Promise<void>;
    /** Decifra bytes baixados de um anexo usando o segredo padrão Matrix v2. */
    decryptMedia(ciphertext: Uint8Array, secret: string): Promise<Uint8Array>;
    private flush;
    private readHistory;
    older(): Promise<void>;
    retry(txnId: string): Promise<void>;
    private queueReceipt;
    visibleMessages(ids: string[]): void;
    setReadReceipts(enabled: boolean): Promise<void>;
    private syncReceipts;
}
//# sourceMappingURL=index.d.ts.map