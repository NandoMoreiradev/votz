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
export interface ChatPendingLink {
    id?: string;
    code: string;
    expiresAt: string;
}
export type ChatEnrollment = ({
    status: 'ready';
} & ChatSession) | ({
    status: 'pending_approval';
} & ChatPendingLink);
export interface ChatDeviceStatus {
    enabled: boolean;
    status: 'disabled' | 'active' | 'first_device' | 'needs_approval' | 'revoked';
    activeDevices: number;
    pendingLinks?: number;
}
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
    /** Exporta o histórico cifrado deste aparelho em um cofre protegido pela senha informada. */
    exportKeyVault?(passphrase: string): Promise<string>;
    /** Abre um cofre protegido com a senha e importa o histórico de conversas neste aparelho. */
    importKeyVault?(vault: string, passphrase: string): Promise<{
        offered: number;
        imported: number;
    }>;
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
export type ChatDeliveryIcon = 'clock' | 'check' | 'checks' | 'checks-read' | 'alert';
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
    /** Estado da própria mensagem por extenso ("Entregue", "Lida"); serve a leitores de tela e dicas. */
    statusLabel: string | null;
    /** Mensagem que este aparelho não consegue abrir: as telas mostram em tom discreto. */
    unreadable: boolean;
    dayKey: string;
    dayDivider: string | null;
    isFirstInGroup: boolean;
    deliveryIcon: ChatDeliveryIcon | null;
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
    /** Pode digitar: enquanto a conversa ainda prepara, o texto já pode ser escrito (só o envio espera). */
    canType: boolean;
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
/** Formata o código de 6 dígitos para leitura fácil (ex.: "482 910"). */
export declare function formatLinkCode(code: string): string;
/** Monta o conteúdo do código QR de conexão entre aparelhos. */
export declare function formatDeviceLinkQr(pending: {
    id?: string;
    code: string;
}): string;
/** Lê um código QR de conexão ou um código numérico de 6 dígitos digitado pela pessoa. */
export declare function parseDeviceLinkQr(raw: string): {
    code: string;
    linkId?: string;
} | null;
/** Tela de quem espera a permissão de outro aparelho. */
export declare const ENROLL_WAITING: {
    title: string;
    text: string;
    qrHint: string;
    historyNote: string;
    note: string;
    lost: string;
    bannerTitle: string;
    bannerText: string;
    bannerAction: string;
    bannerDismiss: string;
    enterCodeTitle: string;
    enterCodeHint: string;
    enterCodeAction: string;
    scanQrAction: string;
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
 * Últimas mensagens abertas de cada conversa recente, para a conversa aparecer
 * na hora ao voltar a ela, enquanto a sincronização termina por trás.
 *
 * Só na memória do aplicativo, como a prévia: nunca vai ao disco nem ao
 * servidor, e some junto com ela (`chatPreviews.clear()`: segundo plano, sair da
 * conta ou trocar de usuário).
 */
export declare const chatTranscripts: {
    get: (conversationId: string) => ChatMessage[] | undefined;
    set(conversationId: string, messages: ChatMessage[]): void;
    clear(): void;
};
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
    status: () => Promise<ChatDeviceStatus>;
    decide: (linkId: string, approve: boolean) => Promise<Json>;
    approveByCode: (code: string, linkId?: string) => Promise<{
        approved: boolean;
        id: string;
        label: string | null;
        platform: string;
    }>;
    revoke: (deviceId: string) => Promise<{
        revoked: boolean;
        self: boolean;
    }>;
};
export interface ChatBackupMeta {
    exists: boolean;
    updatedAt: string | null;
    sizeBytes: number;
}
export interface ChatHistoryTransferMeta {
    available: boolean;
    id?: string;
    fromDeviceId?: string;
    expiresAt?: string;
}
export declare const CHAT_BACKUP_MIN_PASSWORD = 8;
/** Formata código temporário de transferência (8 dígitos) em dois blocos de 4. */
export declare function formatTransferCode(code: string): string;
/** Textos de backup e transferência de histórico, sem jargão técnico. */
export declare const CHAT_BACKUP_TEXT: {
    title: string;
    subtitle: string;
    passwordHint: string;
    saveAction: string;
    updateAction: string;
    restoreTitle: string;
    restoreAction: string;
    deleteAction: string;
    transferTitle: string;
    transferSubtitle: string;
    sendTransferAction: string;
    receiveTransferTitle: string;
    receiveTransferAction: string;
};
/** API de backup protegido na nuvem e transferência temporária de histórico. */
export declare function chatBackupApi(http: ChatHttp): {
    meta: () => Promise<ChatBackupMeta>;
    download: () => Promise<{
        vault: string;
        updatedAt: string;
        sizeBytes: number;
    }>;
    upload: (vault: string) => Promise<ChatBackupMeta>;
    remove: () => Promise<{
        exists: false;
    }>;
    transferMeta: () => Promise<ChatHistoryTransferMeta>;
    createTransfer: (vault: string) => Promise<{
        id: string;
        expiresAt: string;
        sizeBytes: number;
    }>;
    consumeTransfer: (id: string) => Promise<{
        vault: string;
        sizeBytes: number;
    }>;
};
/** Espaço de arquivos das conversas da pessoa (a API devolve no envio e na lista). */
export interface ChatStorageUsage {
    usedBytes: number;
    limitBytes: number;
    /** Passou de 80% do espaço. */
    nearLimit: boolean;
}
export type ChatStorageKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE';
export interface ChatStorageItem {
    id: string;
    conversationId: string;
    kind: ChatStorageKind;
    sizeBytes: number;
    createdAt: string;
}
export interface ChatStorageList {
    usage: ChatStorageUsage;
    items: ChatStorageItem[];
    hasMore: boolean;
}
/**
 * "Gerenciar armazenamento": lista e apaga os arquivos que a própria pessoa enviou. Como a lista de
 * aparelhos, não precisa do motor criptográfico, só das credenciais deste aparelho no `http`.
 */
export declare function chatStorageApi(http: ChatHttp): {
    list: (options?: {
        sort?: "size" | "date";
        skip?: number;
        take?: number;
    }) => Promise<ChatStorageList>;
    remove: (ids: string[]) => Promise<{
        deleted: number;
        freedBytes: number;
        usage: ChatStorageUsage;
    }>;
};
/** Tamanho em linguagem de gente: KB, MB ou GB, com vírgula. */
export declare function formatStorageSize(bytes: number): string;
/** Textos da tela "Gerenciar armazenamento", em português simples. */
export declare function chatStorageView(usage: ChatStorageUsage): {
    level: "ok" | "near" | "full";
    percent: number;
    summary: string;
    hint: string;
    help: string;
    empty: string;
    upgrade: {
        label: string;
        soon: string;
    };
};
/** Pergunta antes de apagar: avisa que o arquivo some para todos da conversa. */
export declare function chatStorageDeleteConfirm(count: number): string;
export declare const STORAGE_KIND_LABEL: Record<ChatStorageKind, string>;
/**
 * Ativa este aparelho. O primeiro da conta entra direto; os demais ficam
 * aguardando a aprovação de um aparelho já ativo e mostram o código ao usuário.
 * Repetir o pedido é seguro: o servidor devolve o mesmo código até expirar.
 */
export declare function enrollDevice(enroll: () => Promise<ChatEnrollment>, options: {
    onPending: (pending: ChatPendingLink) => void;
    signal?: AbortSignal;
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
}): Promise<ChatSession>;
/**
 * Estado para desenhar a conversa antes mesmo de o cliente existir: só as
 * últimas mensagens abertas (se houver), sem poder escrever ainda.
 */
export declare function chatSeedState(conversationId: string): ChatState | null;
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
    /** Mensagens já abertas (só memória): evita decifrar tudo de novo a cada ciclo. */
    private decoded;
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
    /** Confere o aparelho remetente e abre uma mensagem cifrada. */
    private decodeEvent;
    private refreshMessages;
    verification(action: VerificationAction): Promise<void>;
    send(text: string, options?: ChatSendOptions): Promise<void>;
    private sendNow;
    /** Alterna uma reação de emoji cifrada de ponta a ponta em uma mensagem. */
    react(targetEventId: string, emoji: string): Promise<void>;
    /**
     * Envia imagem, vídeo, áudio ou arquivo cifrado no cliente (padrão Matrix v2)
     * antes do upload. O servidor só armazena bytes opacos, dentro da cota de quem envia.
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
        /** `info.kind` segue junto no envio só para a tela "Gerenciar armazenamento" (foto, vídeo, áudio, arquivo). */
        upload: (ciphertext: Uint8Array, info: {
            kind: ChatMediaKind;
        }) => Promise<{
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