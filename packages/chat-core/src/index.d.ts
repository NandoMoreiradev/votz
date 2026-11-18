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
    deviceId: string | null;
    userId: string;
}
export interface ChatRoom {
    roomId: string;
    revision: number;
    canSend: boolean;
    peer: ChatPeer;
}
export interface ChatVerification {
    state: 'none' | 'requested' | 'ready' | 'comparing' | 'confirmed' | 'done' | 'cancelled';
    incoming?: boolean;
    decimals?: number[];
}
export interface ChatMessage {
    id: string;
    sender: 'self' | 'peer';
    text: string | null;
    createdAt: number;
    status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'unverified' | 'unavailable';
    txnId?: string;
}
export declare function messageStatusLabel(status: ChatMessage['status']): string;
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
}
export interface ChatStorage {
    load(): Promise<ChatTransportState>;
    save(value: ChatTransportState): Promise<void>;
}
export type ChatHttp = <T = Json>(path: string, method?: 'GET' | 'POST' | 'PUT', body?: unknown) => Promise<T>;
export type VerificationAction = 'request' | 'accept' | 'compare' | 'confirm' | 'cancel';
export interface ChatCrypto {
    track(userId: string, roomId?: string): Promise<void>;
    receive(sync: Json): Promise<void>;
    pump(http: ChatHttp): Promise<void>;
    verified(userId: string, deviceId: string): Promise<boolean>;
    identity(userId: string, deviceId: string): Promise<{
        curve25519: string;
        ed25519: string;
    }>;
    share(roomId: string, userId: string): Promise<void>;
    encrypt(roomId: string, text: string): Promise<Json>;
    decrypt(roomId: string, event: Json): Promise<string>;
    verification(peer: ChatPeer): Promise<ChatVerification>;
    verify(peer: ChatPeer, action: VerificationAction, http: ChatHttp): Promise<void>;
}
export declare function chatError(error: unknown): string;
export declare class ChatClient {
    private readonly conversationId;
    private readonly session;
    private readonly crypto;
    private readonly http;
    private readonly storage;
    private readonly newId;
    private active;
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
    private save;
    private render;
    start(): Promise<void>;
    stop(): Promise<void>;
    private refresh;
    private poll;
    private refreshMessages;
    verification(action: VerificationAction): Promise<void>;
    send(text: string): Promise<void>;
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