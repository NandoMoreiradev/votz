export type Json = Record<string, any>
export interface ChatCredentials {
  id: string
  secret: string
  platform: 'web' | 'android' | 'ios' | 'test'
}
export interface ChatSession {
  deviceId: string
  matrixUserId: string
  singleDevicePilot: boolean
}
export interface ChatPeer {
  matrixUserId: string
  /** Primeiro aparelho do contato; mantido por compatibilidade. */
  deviceId: string | null
  /** Todos os aparelhos ativos do contato. */
  devices?: string[]
  userId: string
  /** Nome de exibição (usado em grupos para identificar quem enviou). */
  name?: string
}
export interface ChatRoom {
  kind?: 'DIRECT' | 'GROUP'
  roomId: string
  revision: number
  canSend: boolean
  /** Aparelhos ativos da própria conta (inclui o atual). */
  selfDevices?: string[]
  /** Contato na conversa individual (nulo em grupos). */
  peer: ChatPeer | null
  /** Todos os outros participantes ativos (1 em conversa individual, N em grupo). */
  peers?: ChatPeer[]
}
/** Aviso de segurança: aparelho novo ou chave trocada num aparelho já conhecido. */
export interface ChatNotice {
  id: string
  kind: 'device-added' | 'key-changed'
  who: 'peer' | 'self'
  userId?: string
  deviceId: string
  fingerprint: string
  at: number
}
export interface ChatDeviceLink {
  id: string
  platform: string
  label: string | null
  code: string
  expiresAt: string
}
export interface ChatDeviceInfo {
  id: string
  platform: string
  label: string | null
  createdAt: string
  current: boolean
}
export type ChatEnrollment =
  | ({ status: 'ready' } & ChatSession)
  | { status: 'pending_approval'; code: string; expiresAt: string }
export interface ChatVerification {
  state:
    | 'none'
    | 'requested'
    | 'ready'
    | 'comparing'
    | 'confirmed'
    | 'done'
    | 'cancelled'
  incoming?: boolean
  decimals?: number[]
}
export type ChatMediaKind = 'image' | 'video' | 'audio' | 'file'
export const CHAT_MEDIA_LIMITS: Record<ChatMediaKind, number> = {
  image: 10 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  file: 25 * 1024 * 1024,
  video: 50 * 1024 * 1024,
}
export interface ChatAttachment {
  kind: ChatMediaKind
  id: string
  name: string
  mimeType: string
  size: number
  /** JSON padrão Matrix v2 (key, iv, hashes.sha256) trafegado só dentro do evento cifrado. */
  secret: string
  width?: number
  height?: number
  durationMs?: number
}
export interface ChatDecryptedContent {
  text: string | null
  attachment?: ChatAttachment
}
const MEDIA_MSGTYPE: Record<ChatMediaKind, string> = {
  image: 'm.image',
  video: 'm.video',
  audio: 'm.audio',
  file: 'm.file',
}
const MSGTYPE_TO_KIND: Record<string, ChatMediaKind> = {
  'm.image': 'image',
  'm.video': 'video',
  'm.audio': 'audio',
  'm.file': 'file',
}
export function mediaKindFromMime(mimeType: string): ChatMediaKind {
  const mime = (mimeType || '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}
export function mediaKindLabel(kind: ChatMediaKind): string {
  return { image: 'Foto', video: 'Vídeo', audio: 'Áudio', file: 'Arquivo' }[kind]
}
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes || 0))} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
export function buildMediaEventContent(
  attachment: ChatAttachment,
  caption?: string,
): Json {
  const parsed = JSON.parse(attachment.secret) as Json
  const trimmed = (caption || '').trim().slice(0, 1000)
  return {
    msgtype: MEDIA_MSGTYPE[attachment.kind],
    body: trimmed || attachment.name,
    filename: attachment.name,
    info: {
      mimetype: attachment.mimeType || 'application/octet-stream',
      size: attachment.size,
      ...(attachment.width ? { w: attachment.width } : {}),
      ...(attachment.height ? { h: attachment.height } : {}),
      ...(attachment.durationMs ? { duration: attachment.durationMs } : {}),
    },
    file: {
      ...parsed,
      url: `votz-media://${attachment.id}`,
    },
  }
}
export function parseDecryptedMessage(content: Json): ChatDecryptedContent {
  if (!content || typeof content !== 'object')
    throw new Error('Conteúdo de mensagem inválido.')
  if (content.msgtype === 'm.text') {
    if (typeof content.body !== 'string' || content.body.length > 4000)
      throw new Error('Conteúdo de mensagem não suportado.')
    return { text: content.body }
  }
  const kind = MSGTYPE_TO_KIND[String(content.msgtype || '')]
  if (!kind) throw new Error('Conteúdo de mensagem não suportado.')
  const file = content.file as Json | undefined
  if (
    !file ||
    typeof file !== 'object' ||
    file.v !== 'v2' ||
    typeof file.url !== 'string' ||
    !/^votz-media:\/\/[0-9a-f-]{36}$/i.test(file.url) ||
    typeof file.iv !== 'string' ||
    !file.key ||
    !file.hashes?.sha256
  )
    throw new Error('Anexo cifrado inválido.')
  const id = file.url.slice('votz-media://'.length)
  const { url: _unused, ...secretObj } = file
  const info = (content.info && typeof content.info === 'object' ? content.info : {}) as Json
  const name =
    typeof content.filename === 'string' && content.filename.trim()
      ? content.filename.trim().slice(0, 200)
      : typeof content.body === 'string' && content.body.trim()
        ? content.body.trim().slice(0, 200)
        : mediaKindLabel(kind)
  const body = typeof content.body === 'string' ? content.body.trim().slice(0, 1000) : ''
  const caption = body && body !== name ? body : ''
  return {
    text: caption,
    attachment: {
      kind,
      id,
      name,
      mimeType:
        typeof info.mimetype === 'string'
          ? info.mimetype
          : 'application/octet-stream',
      size: typeof info.size === 'number' && info.size > 0 ? info.size : 0,
      secret: JSON.stringify(secretObj),
      ...(typeof info.w === 'number' ? { width: info.w } : {}),
      ...(typeof info.h === 'number' ? { height: info.h } : {}),
      ...(typeof info.duration === 'number' ? { durationMs: info.duration } : {}),
    },
  }
}
export interface ChatMessage {
  id: string
  sender: 'self' | 'peer'
  senderName?: string
  text: string | null
  attachment?: ChatAttachment
  createdAt: number
  status:
    | 'pending'
    | 'sent'
    | 'delivered'
    | 'read'
    | 'failed'
    | 'unverified'
    | 'disconnected'
    | 'unavailable'
  /** Resumo de entrega/leitura em grupos (ex.: "Lida por 1 de 2"). */
  receiptSummary?: string
  txnId?: string
}
export function messageStatusLabel(status: ChatMessage['status']): string {
  return {
    pending: 'Aguardando envio',
    sent: 'Enviada',
    delivered: 'Entregue',
    read: 'Lida',
    failed: 'Não enviada',
    unverified: 'Aparelho não confiável',
    disconnected: 'Aparelho desconectado',
    unavailable: 'Não foi possível abrir',
  }[status]
}
/** Texto mostrado no lugar de uma mensagem que não pôde ser aberta. */
export function messagePlaceholder(status: ChatMessage['status']): string {
  if (status === 'unverified')
    return 'Esta mensagem veio de um aparelho com segurança alterada. Confira o aviso acima para lê-la.'
  if (status === 'disconnected')
    return 'Esta mensagem veio de um aparelho que não está mais conectado e não pode ser aberta.'
  return 'Não foi possível abrir esta mensagem neste aparelho.'
}
/** Estado da conversa segura com o contato, para a interface decidir o que mostrar. */
export type ChatPeerStatus = 'none' | 'preparing' | 'blocked' | 'ready'
/** Dica do campo de mensagem, igual no web e no mobile. */
export function composerPlaceholder(state: {
  peerStatus: ChatPeerStatus
  room: { canSend: boolean } | null
}): string {
  if (state.peerStatus === 'ready')
    return state.room?.canSend
      ? 'Escreva uma mensagem…'
      : 'Esta interação está bloqueada.'
  if (state.peerStatus === 'blocked')
    return 'Confira o aviso de segurança para conversar'
  if (state.peerStatus === 'preparing') return 'Preparando a conversa segura…'
  return 'Aguardando a outra pessoa abrir as conversas'
}
export interface PendingChatMessage {
  txnId: string
  conversationId: string
  roomId: string
  revision: number
  content: Json
  createdAt: number
  failed?: boolean
}
export interface ChatState {
  ready: boolean
  connected: boolean
  messages: ChatMessage[]
  room: ChatRoom | null
  verification: ChatVerification
  error: string | null
  historyCursor: string | null
  loadingHistory: boolean
  readReceiptsEnabled: boolean
  /** O contato tem ao menos um aparelho em que confiamos para cifrar. */
  peerTrusted: boolean
  peerStatus: ChatPeerStatus
  /** Este aparelho perdeu a autorização (foi desconectado): a tela deve recomeçar com credenciais novas. */
  reactivate: boolean
  notices: ChatNotice[]
  /** Pedidos de novos aparelhos da minha conta aguardando aprovação. */
  deviceLinks: ChatDeviceLink[]
}
export interface ReceiptJob {
  conversationId: string
  eventId: string
  read: boolean
}
export interface ChatTransportState {
  cursor?: string
  pending: PendingChatMessage[]
  receipts?: ReceiptJob[]
  acknowledged?: ReceiptJob[]
  /** Confiança no primeiro contato: usuário Matrix -> aparelho -> impressão das chaves. */
  pins?: Record<string, Record<string, string>>
  notices?: ChatNotice[]
}
export interface ChatStorage {
  load(): Promise<ChatTransportState>
  save(value: ChatTransportState): Promise<void>
}
export type ChatHttp = <T = Json>(
  path: string,
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
) => Promise<T>
export type VerificationAction =
  'request' | 'accept' | 'compare' | 'confirm' | 'cancel'
export interface ChatCrypto {
  track(userId: string, roomId?: string): Promise<void>
  /**
   * Define os aparelhos em que confiamos para cifrar para `userId`. Chaves de
   * sala e eventos cifrados nunca saem para outros aparelhos desse usuário.
   */
  trust(userId: string, deviceIds: string[]): void
  receive(sync: Json): Promise<void>
  pump(http: ChatHttp): Promise<void>
  verified(userId: string, deviceId: string): Promise<boolean>
  identity(
    userId: string,
    deviceId: string,
  ): Promise<{ curve25519: string; ed25519: string }>
  share(roomId: string, userIds: string[]): Promise<void>
  /** Descarta a sessão de envio da sala; a próxima mensagem distribui uma chave nova. */
  rotate?(roomId: string): Promise<void>
  encrypt(roomId: string, payload: string | Json): Promise<Json>
  decrypt(roomId: string, event: Json): Promise<string | ChatDecryptedContent>
  encryptAttachment?(
    bytes: Uint8Array,
  ): Promise<{ ciphertext: Uint8Array; secret: string }>
  decryptAttachment?(
    ciphertext: Uint8Array,
    secret: string,
  ): Promise<Uint8Array>
  verification(peer: ChatPeer): Promise<ChatVerification>
  verify(
    peer: ChatPeer,
    action: VerificationAction,
    http: ChatHttp,
  ): Promise<void>
}

export function chatError(error: unknown): string {
  const e = error as {
    status?: number
    message?: string
    response?: { status?: number; data?: { message?: string } }
  }
  const status = e?.response?.status || e?.status
  if (status === 401) return 'Reconectando…'
  if (status === 403) return 'Esta ação não está disponível para esta conversa.'
  if (status === 404) return 'Esta conversa não está mais disponível.'
  if (status === 410) return 'O pedido expirou. Peça a conexão novamente.'
  if (status === 409)
    return (
      e?.response?.data?.message ||
      e?.message ||
      'Atualize a conversa antes de continuar.'
    )
  return 'Não foi possível conectar ao mensageiro. Tente novamente.'
}

/** Aviso para a pessoa, já em linguagem simples. As duas telas só desenham. */
export interface ChatViewNotice {
  id: string
  text: string
  detail?: string
  /** Rótulo do botão que dispensa o aviso. */
  action: string
  /** Enquanto não for resolvido, mensagens novas do contato ficam bloqueadas. */
  blocking: boolean
}
export interface ChatViewDeviceRequest {
  id: string
  title: string
  text: string
  allow: string
  deny: string
}
export interface ChatViewVerification {
  /** Há uma confirmação em andamento (o painel deve ficar aberto mesmo sem clique no banner). */
  active: boolean
  title: string
  description: string
  code: string | null
  primaryAction: { action: VerificationAction; label: string } | null
  waitingText: string | null
  canCancel: boolean
  cancelLabel: string
}
export interface ChatViewAttachment {
  kind: ChatMediaKind
  id: string
  name: string
  mimeType: string
  sizeLabel: string
  kindLabel: string
  secret: string
}
export interface ChatViewMessage {
  id: string
  own: boolean
  senderName: string | null
  body: string
  attachment: ChatViewAttachment | null
  time: string
  meta: string
  retryTxnId: string | null
  retryLabel: string
  canRetry: boolean
}
export interface ChatViewReadReceipts {
  enabled: boolean
  disabled: boolean
  label: string
  help: string
}
export interface ChatView {
  canWrite: boolean
  placeholder: string
  /** Faixa fixa no topo da conversa. */
  banner: string
  /** Ainda carregando: mostrar indicador, não formulário. */
  preparing: boolean
  /** O contato ainda não abriu as conversas no app dele. */
  waitingPeer: string | null
  notices: ChatViewNotice[]
  /** Pedidos de outros aparelhos da própria conta aguardando permissão. */
  deviceRequests: ChatViewDeviceRequest[]
  /** Indica se a confirmação opcional de identidade está disponível. */
  canVerify: boolean
  /** Estado e textos do painel opcional de confirmação de identidade. */
  verification: ChatViewVerification | null
  /** Mensagens prontas para desenhar (texto ou aviso, horário, status e reenvio). */
  messages: ChatViewMessage[]
  /** Texto exibido quando a conversa ainda está vazia e pronta para escrever. */
  emptyText: string | null
  /** Controle de confirmação de leitura. */
  readReceipts: ChatViewReadReceipts
  /** Há histórico mais antigo para carregar. */
  canLoadOlder: boolean
  olderLabel: string
}
const READ_RECEIPTS_LABEL = 'Compartilhar quando eu ler'
const READ_RECEIPTS_HELP =
  'Entregue significa que a outra pessoa recebeu. Lida só aparece se ela ligar esta opção e a mensagem estiver na tela.'
function formatMessageTime(createdAt: number | string): string {
  return new Date(createdAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
/**
 * Tudo o que a pessoa lê na conversa, num só lugar: o web e o mobile
 * não repetem texto nem regra. Sem jargão: nada de "chave", "dispositivo"
 * ou "ativar".
 */
export function chatView(
  state: ChatState | null,
  peerName: string,
  verified = state?.verification?.state === 'done',
): ChatView {
  const isGroup = state?.room?.kind === 'GROUP'
  const banner = isGroup
    ? 'As mensagens deste grupo são protegidas com criptografia de ponta a ponta.'
    : verified
      ? 'Identidade confirmada. As mensagens são protegidas com criptografia de ponta a ponta.'
      : 'As mensagens são protegidas com criptografia de ponta a ponta.'
  if (!state)
    return {
      canWrite: false,
      placeholder: 'Preparando a conversa…',
      banner,
      preparing: true,
      waitingPeer: null,
      notices: [],
      deviceRequests: [],
      canVerify: false,
      verification: null,
      messages: [],
      emptyText: null,
      readReceipts: {
        enabled: false,
        disabled: true,
        label: READ_RECEIPTS_LABEL,
        help: READ_RECEIPTS_HELP,
      },
      canLoadOlder: false,
      olderLabel: 'Mensagens anteriores',
    }
  const peers =
    state.room?.peers ?? (state.room?.peer ? [state.room.peer] : [])
  const notices: ChatViewNotice[] = []
  for (const notice of state.notices) {
    // Um aparelho novo da própria conta foi aprovado pela própria pessoa: sem aviso.
    if (notice.who === 'self') continue
    const whoName =
      (notice.userId
        ? peers.find((p) => p.matrixUserId === notice.userId)?.name
        : undefined) || peerName
    notices.push(
      notice.kind === 'key-changed'
        ? {
            id: notice.id,
            text: `O código de segurança de ${whoName} mudou.`,
            detail:
              'Pode ser só uma troca de celular. Até você continuar, as mensagens novas dele não aparecem.',
            action: 'Continuar',
            blocking: true,
          }
        : {
            id: notice.id,
            text: `${whoName} trocou de aparelho ou entrou em outro.`,
            action: 'Ok',
            blocking: false,
          },
    )
  }
  const canWrite = state.peerTrusted && !!state.room?.canSend
  const canVerify =
    !isGroup && !!state.ready && !!state.room?.peer?.deviceId && !verified
  const v = state.verification
  let verification: ChatViewVerification | null = null
  if (canVerify) {
    const idle = !v || ['none', 'cancelled'].includes(v.state)
    const primaryAction: ChatViewVerification['primaryAction'] = idle
      ? { action: 'request', label: 'Começar a confirmação' }
      : v.state === 'requested' && v.incoming
        ? { action: 'accept', label: 'Aceitar' }
        : v.state === 'comparing'
          ? { action: 'confirm', label: 'Os números são iguais' }
          : null
    const waitingText =
      v?.state === 'requested' && !v.incoming
        ? 'Esperando a outra pessoa aceitar…'
        : v?.state === 'ready'
          ? 'Preparando os números…'
          : v?.state === 'confirmed'
            ? 'Esperando a outra pessoa confirmar…'
            : null
    verification = {
      active: !!v && !['none', 'cancelled', 'done'].includes(v.state),
      title: 'Confirmar identidade (opcional)',
      description: `Comparem os três números nas duas telas com ${peerName}. Só confirme se forem iguais. Você pode conversar sem fazer isso.`,
      code: v?.decimals ? v.decimals.join(' · ') : null,
      primaryAction,
      waitingText,
      canCancel: !idle,
      cancelLabel: 'Cancelar',
    }
  }
  const messages: ChatViewMessage[] = state.messages.map((message) => {
    const own = message.sender === 'self'
    const time = formatMessageTime(message.createdAt)
    const statusText =
      message.receiptSummary ?? messageStatusLabel(message.status)
    return {
      id: message.id,
      own,
      senderName: own ? null : (message.senderName ?? null),
      body:
        message.text !== null
          ? message.text
          : message.attachment
            ? ''
            : messagePlaceholder(message.status),
      attachment: message.attachment
        ? {
            kind: message.attachment.kind,
            id: message.attachment.id,
            name: message.attachment.name,
            mimeType: message.attachment.mimeType,
            sizeLabel: formatFileSize(message.attachment.size),
            kindLabel: mediaKindLabel(message.attachment.kind),
            secret: message.attachment.secret,
          }
        : null,
      time,
      meta: own ? `${time} · ${statusText}` : time,
      retryTxnId:
        message.status === 'failed' && message.txnId ? message.txnId : null,
      retryLabel: 'Tentar enviar novamente',
      canRetry: !!state.room?.canSend,
    }
  })
  const waitingPeer = !state.ready
    ? null
    : isGroup
      ? !state.room?.canSend
        ? 'Aguardando convidados entrarem no grupo.'
        : state.peerStatus === 'none'
          ? 'Ninguém do grupo abriu as conversas no app ainda. Quando abrirem, vocês já podem conversar.'
          : null
      : state.peerStatus === 'none'
        ? `${peerName} ainda não abriu as conversas no app. Quando abrir, vocês já podem conversar.`
        : null
  return {
    canWrite,
    placeholder: composerPlaceholder(state),
    banner,
    preparing: !state.ready && !state.room,
    waitingPeer,
    notices,
    deviceRequests: state.deviceLinks.map((link) => ({
      id: link.id,
      ...deviceRequestText(link),
    })),
    canVerify,
    verification,
    messages,
    emptyText:
      !state.messages.length && state.ready && canWrite
        ? isGroup
          ? 'A conversa do grupo começa aqui.'
          : 'A conversa de vocês começa aqui.'
        : null,
    readReceipts: {
      enabled: state.readReceiptsEnabled,
      disabled: !state.ready || !state.connected,
      label: READ_RECEIPTS_LABEL,
      help: READ_RECEIPTS_HELP,
    },
    canLoadOlder: !!state.historyCursor,
    olderLabel: 'Mensagens anteriores',
  }
}
/** Pedido de outro aparelho para usar a conta, em linguagem simples. */
export function deviceRequestText(
  link: { label: string | null; platform: string; code: string },
  names: Record<string, string> = {
    android: 'Android',
    ios: 'iPhone',
    web: 'um navegador',
    test: 'um aparelho de teste',
  },
) {
  const device = link.label || names[link.platform] || 'Outro aparelho'
  return {
    title: 'Novo aparelho pedindo acesso',
    text: `${device} quer usar suas conversas. Permita só se foi você. O código no outro aparelho deve ser ${link.code}.`,
    allow: 'Permitir',
    deny: 'Negar',
  }
}
/** Tela de quem espera a permissão de outro aparelho. */
export const ENROLL_WAITING = {
  title: 'Permita no seu outro aparelho',
  text: 'Abra o Votz em outro aparelho seu e permita este acesso. Confira se o código é o mesmo:',
  note: 'O pedido vale por 10 minutos.',
  lost: 'Não tenho mais acesso aos outros aparelhos',
}
/** Aviso antes de redefinir quando não há mais nenhum aparelho antigo. */
export const RESET_WARNING = {
  title: 'Começar do zero neste aparelho?',
  text: 'Seus outros aparelhos serão desconectados e as mensagens antigas não poderão ser lidas aqui. Para continuar, confirme sua senha do Votz.',
  action: 'Redefinir',
}

export interface ChatPreview {
  /** Id do evento da última mensagem, para casar com `lastMessage.eventId` da lista. */
  eventId: string
  text: string
}
const previews = new Map<string, ChatPreview>()
const previewListeners = new Set<() => void>()
/**
 * Prévia (texto da última mensagem) para a lista de conversas.
 *
 * Só na memória do aplicativo: nunca vai ao disco nem ao servidor. Quem usa
 * chama `clear()` ao sair da conta e quando o aplicativo vai para segundo
 * plano, igual ao restante do texto aberto.
 */
export const chatPreviews = {
  get: (conversationId: string) => previews.get(conversationId),
  set(conversationId: string, preview: ChatPreview) {
    const old = previews.get(conversationId)
    if (old?.eventId === preview.eventId && old.text === preview.text) return
    previews.set(conversationId, preview)
    for (const listener of previewListeners) listener()
  },
  clear() {
    if (!previews.size) return
    previews.clear()
    for (const listener of previewListeners) listener()
  },
  subscribe(listener: () => void) {
    previewListeners.add(listener)
    return () => {
      previewListeners.delete(listener)
    }
  },
}

/** Este aparelho foi desconectado (por outro aparelho ou pela redefinição). O app deve recomeçar com credenciais novas. */
export class ChatDeviceDisconnectedError extends Error {
  constructor() {
    super('Este aparelho foi desconectado.')
    this.name = 'ChatDeviceDisconnectedError'
  }
}
export interface ChatDevices {
  devices: ChatDeviceInfo[]
  links: ChatDeviceLink[]
}
/**
 * Gerenciamento de aparelhos conectados. Não precisa do motor criptográfico:
 * só das credenciais deste aparelho, enviadas pelo `http` fornecido.
 */
export function chatDevicesApi(http: ChatHttp) {
  return {
    list: () => http<ChatDevices>('/chat/devices'),
    decide: (linkId: string, approve: boolean) =>
      http(`/chat/device-links/${encodeURIComponent(linkId)}`, 'POST', {
        approve,
      }),
    revoke: (deviceId: string) =>
      http<{ revoked: boolean; self: boolean }>(
        `/chat/devices/${encodeURIComponent(deviceId)}`,
        'DELETE',
      ),
  }
}

/**
 * Ativa este aparelho. O primeiro da conta entra direto; os demais ficam
 * aguardando a aprovação de um aparelho já ativo e mostram o código ao usuário.
 * Repetir o pedido é seguro: o servidor devolve o mesmo código até expirar.
 */
export async function enrollDevice(
  enroll: () => Promise<ChatEnrollment>,
  options: {
    onPending: (pending: { code: string; expiresAt: string }) => void
    signal?: AbortSignal
    intervalMs?: number
    sleep?: (ms: number) => Promise<void>
  },
): Promise<ChatSession> {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  for (;;) {
    if (options.signal?.aborted) throw new Error('Ativação cancelada.')
    const result = await enroll().catch((error: unknown) => {
      const e = error as { status?: number; response?: { status?: number } }
      const status = e.response?.status ?? e.status
      // Limite de requisições: é só esperar mais um pouco, o pedido continua valendo.
      if (status === 429) return null
      if (status === 423) throw new ChatDeviceDisconnectedError()
      throw error
    })
    if (!result) {
      await sleep(options.intervalMs ?? 4000)
      continue
    }
    if (result.status === 'ready') {
      const { status: _status, ...session } = result
      return session
    }
    options.onPending({ code: result.code, expiresAt: result.expiresAt })
    await sleep(options.intervalMs ?? 4000)
  }
}

export class ChatClient {
  private active = false
  private pins: Record<string, Record<string, string>> = {}
  private notices: ChatNotice[] = []
  private trusted = new Set<string>()
  private queue: Promise<unknown> = Promise.resolve()
  private listeners = new Set<(value: ChatState) => void>()
  private pending: PendingChatMessage[] = []
  private cursor: string | undefined
  private events = new Map<string, Json>()
  private messages = new Map<string, ChatMessage>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private refreshAt = 0
  private receipts: ReceiptJob[] = []
  private acknowledged: ReceiptJob[] = []
  private visible = new Set<string>()
  private received = new Map<string, 'delivered' | 'read'>()
  private snapshot: ChatState = {
    ready: false,
    connected: false,
    messages: [],
    room: null,
    verification: { state: 'none' },
    error: null,
    historyCursor: null,
    loadingHistory: false,
    readReceiptsEnabled: false,
    peerTrusted: false,
    peerStatus: 'none',
    reactivate: false,
    notices: [],
    deviceLinks: [],
  }
  constructor(
    private readonly conversationId: string,
    private readonly session: ChatSession,
    private readonly crypto: ChatCrypto,
    private readonly http: ChatHttp,
    private readonly storage: ChatStorage,
    private readonly newId: () => string,
  ) {}
  subscribe(listener: (value: ChatState) => void) {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getState() {
    return this.snapshot
  }
  private update(value: Partial<ChatState>) {
    if (!this.active) return
    this.snapshot = { ...this.snapshot, ...value }
    for (const listener of this.listeners) listener(this.snapshot)
  }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const task = this.queue.then(work)
    this.queue = task.catch(() => {})
    return task
  }
  private transport(pending = this.pending): ChatTransportState {
    return {
      cursor: this.cursor,
      pending,
      receipts: this.receipts,
      acknowledged: this.acknowledged,
      pins: this.pins,
      notices: this.notices,
    }
  }
  private roomPeers(room: ChatRoom | null): ChatPeer[] {
    if (!room) return []
    return room.peers ?? (room.peer ? [room.peer] : [])
  }
  private devicesOf(peer: ChatPeer): string[] {
    return peer.devices ?? (peer.deviceId ? [peer.deviceId] : [])
  }
  private hasAnyPeerDevice(room: ChatRoom | null): boolean {
    return this.roomPeers(room).some((peer) => this.devicesOf(peer).length > 0)
  }
  private hasTrustedPeer(room: ChatRoom | null) {
    if (!room) return false
    const peers = this.roomPeers(room)
    const hasBlockingKeyChange = this.notices.some(
      (n) => n.who === 'peer' && n.kind === 'key-changed',
    )
    if (hasBlockingKeyChange) return false
    return peers.some((peer) =>
      this.devicesOf(peer).some((id) =>
        this.trusted.has(`${peer.matrixUserId}|${id}`),
      ),
    )
  }
  private notify(
    kind: ChatNotice['kind'],
    who: ChatNotice['who'],
    deviceId: string,
    fingerprint: string,
    userId?: string,
  ) {
    const id = `${kind}:${who}:${userId ? `${userId}:` : ''}${deviceId}:${fingerprint.slice(0, 24)}`
    if (this.notices.some((notice) => notice.id === id)) return
    this.notices = [
      ...this.notices,
      {
        id,
        kind,
        who,
        ...(userId ? { userId } : {}),
        deviceId,
        fingerprint,
        at: Date.now(),
      },
    ].slice(-50)
  }
  /**
   * Confiança no primeiro contato. O primeiro conjunto de aparelhos que o Votz
   * apresenta para cada pessoa fica fixado; aparelho novo é aceito com aviso;
   * chave diferente num aparelho já conhecido NÃO é aceita até a pessoa decidir.
   */
  private async reconcileTrust(room: ChatRoom) {
    const peers = this.roomPeers(room)
    const groups: [string, string[], ChatNotice['who']][] = [
      ...peers.map(
        (peer): [string, string[], ChatNotice['who']] => [
          peer.matrixUserId,
          this.devicesOf(peer),
          'peer',
        ],
      ),
      [
        this.session.matrixUserId,
        (room.selfDevices ?? []).filter((id) => id !== this.session.deviceId),
        'self',
      ],
    ]
    const trusted = new Set<string>()
    const noticesBefore = this.snapshot.notices.length
    let changed = false
    for (const [userId, devices, who] of groups) {
      const pins = (this.pins[userId] ??= {})
      const known = new Map<string, string>()
      for (const deviceId of devices) {
        try {
          const keys = await this.crypto.identity(userId, deviceId)
          known.set(deviceId, `${keys.curve25519}:${keys.ed25519}`)
        } catch {
          /* Chaves ainda não baixadas: tente no próximo ciclo. */
        }
      }
      const first = Object.keys(pins).length === 0
      // No primeiro contato fixamos os aparelhos cujas chaves já são conhecidas.
      // Um aparelho que ainda não publicou chaves não trava o contato inteiro;
      // se aparecer depois, é anunciado como aparelho novo (o que é verdade).
      if (first && known.size === 0) {
        this.crypto.trust(userId, [])
        continue
      }
      const keep: string[] = []
      for (const [deviceId, fingerprint] of known) {
        const pinned = pins[deviceId]
        if (pinned === undefined) {
          pins[deviceId] = fingerprint
          changed = true
          if (!first)
            this.notify('device-added', who, deviceId, fingerprint, userId)
        } else if (pinned !== fingerprint) {
          this.notify('key-changed', who, deviceId, fingerprint, userId)
          continue
        }
        trusted.add(`${userId}|${deviceId}`)
        keep.push(deviceId)
      }
      for (const id of Object.keys(pins))
        if (!devices.includes(id)) {
          delete pins[id]
          changed = true
        }
      this.crypto.trust(userId, keep)
    }
    this.trusted = trusted
    const peerTrusted = this.hasTrustedPeer(room)
    this.update({
      peerTrusted,
      peerStatus: !this.hasAnyPeerDevice(room)
        ? 'none'
        : peerTrusted
          ? 'ready'
          : this.notices.some((n) => n.who === 'peer' && n.kind === 'key-changed')
            ? 'blocked'
            : 'preparing',
      notices: this.notices,
    })
    if (changed || this.notices.length !== noticesBefore) await this.save()
  }
  /** O usuário decide sobre um aviso: aceitar a chave nova ou apenas dispensar. */
  async acknowledgeNotice(id: string) {
    return this.serial(async () => {
      const notice = this.notices.find((row) => row.id === id)
      if (!notice) return
      const room = this.snapshot.room
      const userId =
        notice.who === 'peer'
          ? (notice.userId ?? room?.peer?.matrixUserId)
          : this.session.matrixUserId
      if (notice.kind === 'key-changed' && userId) {
        ;(this.pins[userId] ??= {})[notice.deviceId] = notice.fingerprint
        // Chaves de sala já distribuídas excluíram esse aparelho enquanto ele
        // não era confiável: a próxima mensagem usa uma sessão nova para ele.
        if (room) await this.crypto.rotate?.(room.roomId)
      }
      this.notices = this.notices.filter((row) => row.id !== id)
      if (room) await this.reconcileTrust(room)
      await this.save()
      await this.refreshMessages()
    })
  }
  async deviceList() {
    return chatDevicesApi(this.http).list()
  }
  async decideDeviceLink(linkId: string, approve: boolean) {
    await chatDevicesApi(this.http).decide(linkId, approve)
    await this.refreshDeviceLinks()
  }
  async revokeDevice(deviceId: string) {
    await chatDevicesApi(this.http).revoke(deviceId)
    await this.refreshDeviceLinks()
  }
  private async refreshDeviceLinks() {
    try {
      const { links } = await this.deviceList()
      this.update({ deviceLinks: links })
    } catch {
      /* Informativo: não derruba a conversa. */
    }
  }
  private save() {
    return this.storage.save(this.transport())
  }
  private render() {
    const messages = [...this.messages.values()].sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    )
    // Prévia da lista: só a última mensagem, e só se ela pôde ser aberta e já
    // tem identificador do servidor. Se a última não abriu, não mostra uma antiga.
    const last = messages[messages.length - 1]
    if (
      this.active &&
      last &&
      (last.text !== null || last.attachment) &&
      !last.id.startsWith('pending:')
    ) {
      const previewText = last.attachment
        ? `${mediaKindLabel(last.attachment.kind)}${last.text ? `: ${last.text}` : ''}`
        : last.text || ''
      chatPreviews.set(this.conversationId, {
        eventId: last.id,
        text: previewText.replace(/\s+/g, ' ').trim().slice(0, 140),
      })
    }
    this.update({ messages })
  }
  private seenAt = 0
  private seenTimer: ReturnType<typeof setTimeout> | undefined
  /** Avisa o servidor que a pessoa abriu a conversa (zera as não lidas). Com intervalo mínimo. */
  private markSeen() {
    if (this.seenTimer) return
    const wait = Math.max(0, 2000 - (Date.now() - this.seenAt))
    this.seenTimer = setTimeout(() => {
      this.seenTimer = undefined
      if (!this.active) return
      this.seenAt = Date.now()
      void this.http(`/${this.conversationId}/chat/seen`, 'POST', {}).catch(
        () => {
          /* Informativo: a próxima mensagem visível tenta de novo. */
        },
      )
    }, wait)
  }
  async start() {
    this.active = true
    try {
      const stored = await this.storage.load()
      if (!this.active) return
      this.pending = stored.pending
      this.cursor = stored.cursor
      this.receipts = stored.receipts || []
      this.acknowledged = stored.acknowledged || []
      this.pins = stored.pins || {}
      this.notices = stored.notices || []
      this.update({ notices: this.notices })
      await this.serial(async () => {
        if (!this.active) return
        const privacy = await this.http('/chat/privacy')
        this.update({
          readReceiptsEnabled: privacy.readReceiptsEnabled === true,
        })
        await this.refresh()
        if (!this.active) return
        await this.crypto.pump(this.http)
        await this.readHistory()
        // Restore only ciphertext; recover the local preview from the encrypted SDK store.
        for (const item of this.pending.filter(
          (item) => item.conversationId === this.conversationId,
        )) {
          this.events.set(`pending:${item.txnId}`, {
            event_id: `pending:${item.txnId}`,
            origin_server_ts: item.createdAt,
            sender: this.session.matrixUserId,
            type: 'm.room.encrypted',
            content: item.content,
            unsigned: { transaction_id: item.txnId },
          })
        }
        await this.refreshMessages()
      })
      this.update({ ready: true, connected: true, error: null })
      void this.poll()
    } catch (error) {
      this.update({ error: chatError(error) })
      if (this.active)
        this.timer = setTimeout(() => {
          if (this.active) void this.start()
        }, 3000)
    }
  }
  stop(): Promise<void> {
    this.active = false
    if (this.timer) clearTimeout(this.timer)
    if (this.seenTimer) clearTimeout(this.seenTimer)
    this.seenTimer = undefined
    this.listeners.clear()
    this.events.clear()
    this.messages.clear()
    this.visible.clear()
    this.received.clear()
    this.receiptSummaries.clear()
    this.trusted.clear()
    this.lastPeerUsers = null
    this.snapshot = {
      ...this.snapshot,
      ready: false,
      connected: false,
      messages: [],
      room: null,
      peerTrusted: false,
      peerStatus: 'none',
      deviceLinks: [],
    }
    return this.queue.then(() => { this.events.clear(); this.messages.clear() })
  }
  private lastPeerUsers: Set<string> | null = null
  private receiptSummaries = new Map<string, string>()
  private async refresh(links = true) {
    const room = await this.http<ChatRoom>(`/${this.conversationId}/chat`)
    if (!this.active) return
    const peers = this.roomPeers(room)
    const currentPeerUsers = new Set(peers.map((peer) => peer.matrixUserId))
    // Rotação de chave de grupo: se alguém saiu ou foi removido desde a última
    // leitura, descarta a confiança dele e gira a sessão Megolm da sala.
    if (this.lastPeerUsers) {
      let removed = false
      for (const previous of this.lastPeerUsers) {
        if (!currentPeerUsers.has(previous)) {
          this.crypto.trust(previous, [])
          removed = true
        }
      }
      if (removed) await this.crypto.rotate?.(room.roomId)
    }
    this.lastPeerUsers = currentPeerUsers
    this.update({ room })
    for (const peer of peers)
      await this.crypto.track(peer.matrixUserId, room.roomId)
    await this.crypto.track(this.session.matrixUserId, room.roomId)
    await this.crypto.pump(this.http)
    await this.reconcileTrust(room)
    if (links) await this.refreshDeviceLinks()
    this.refreshAt = Date.now()
  }
  private async poll() {
    if (!this.active) return
    try {
      const sync = await this.http(
        `/chat/sync${this.cursor ? `?since=${encodeURIComponent(this.cursor)}` : ''}`,
      )
      if (!this.active) return
      await this.serial(async () => {
        if (!this.active) return
        if (
          Date.now() - this.refreshAt > 15000 ||
          !this.hasAnyPeerDevice(this.snapshot.room)
        )
          await this.refresh()
        await this.crypto.receive(sync)
        await this.crypto.pump(this.http)
        // O servidor avisou que aparelhos de alguém mudaram: relê a lista já
        // no próximo ciclo (o servidor só informa usuários autorizados).
        if (
          sync.device_lists?.changed?.length ||
          sync.device_lists?.left?.length
        )
          this.refreshAt = 0
        const room = this.snapshot.room!
        const timeline = sync.rooms?.join?.[room.roomId]?.timeline
        for (const event of timeline?.events || [])
          if (typeof event.event_id === 'string')
            this.events.set(event.event_id, event)
        await this.refreshMessages()
        await this.flush()
        await this.syncReceipts()
        if (typeof sync.next_batch === 'string') this.cursor = sync.next_batch
        await this.save()
        this.update({ connected: true, error: null })
      })
    } catch (error) {
      const e = error as { status?: number; response?: { status?: number } }
      // 401 que sobreviveu à renovação da sessão: o aparelho foi desconectado.
      this.update({
        connected: false,
        error: chatError(error),
        ...((e.response?.status ?? e.status) === 401 ? { reactivate: true } : {}),
      })
    }
    if (this.active)
      this.timer = setTimeout(
        () => {
          void this.poll()
        },
        this.snapshot.connected ? 100 : 3000,
      )
  }
  private async refreshMessages() {
    const room = this.snapshot.room
    if (!room) return
    const peers = this.roomPeers(room)
    const peerByMatrix = new Map(peers.map((peer) => [peer.matrixUserId, peer]))
    const verification: ChatVerification =
      room.kind !== 'GROUP' && room.peer
        ? await this.crypto.verification(room.peer)
        : { state: 'none' }
    this.update({ verification })
    for (const [id, event] of this.events) {
      if (
        event.type !== 'm.room.encrypted' ||
        event.content?.algorithm !== 'm.megolm.v1.aes-sha2'
      )
        continue
      const own = event.sender === this.session.matrixUserId
      const senderPeer = own ? undefined : peerByMatrix.get(event.sender)
      if (!own && !senderPeer) continue
      // O aparelho remetente vem do envelope; a chave do remetente é conferida
      // abaixo contra a identidade que o Votz publicou para esse aparelho.
      const claimed =
        typeof event.content?.device_id === 'string'
          ? (event.content.device_id as string)
          : undefined
      const deviceId =
        claimed ?? (own ? this.session.deviceId : senderPeer?.deviceId ?? null)
      const txn = event.unsigned?.transaction_id
      if (!id.startsWith('pending:') && typeof txn === 'string') {
        this.messages.delete(`pending:${txn}`)
        this.events.delete(`pending:${txn}`)
        this.pending = this.pending.filter((item) => item.txnId !== txn)
      }
      // Aparelho que não está mais na lista ativa (desconectado): a mensagem
      // não é aberta, e o texto explica isso em vez de falar de "segurança alterada".
      const selfList = room.selfDevices
      const listed = own
        ? !selfList ||
          deviceId === this.session.deviceId ||
          (!!deviceId && selfList.includes(deviceId))
        : !!deviceId &&
          !!senderPeer &&
          this.devicesOf(senderPeer).includes(deviceId)
      const trusted =
        (own && deviceId === this.session.deviceId) ||
        (!!deviceId && this.trusted.has(`${event.sender}|${deviceId}`))
      let text: string | null = null
      let attachment: ChatAttachment | undefined
      let status: ChatMessage['status'] = !listed
        ? 'disconnected'
        : trusted
          ? 'unavailable'
          : 'unverified'
      if (trusted && deviceId) {
        try {
          const keys = await this.crypto.identity(event.sender, deviceId)
          if (event.content.sender_key !== keys.curve25519)
            throw new Error('Sender device mismatch')
          // Local queue identifiers are UI identifiers, not Matrix event IDs.
          // The SDK validates the latter even for a not-yet-sent envelope.
          const decoded = await this.crypto.decrypt(
            room.roomId,
            id.startsWith('pending:')
              ? { ...event, event_id: `$votz_pending_${txn}` }
              : event,
          )
          if (typeof decoded === 'string') {
            text = decoded
          } else {
            text = decoded.text
            attachment = decoded.attachment
          }
          status = id.startsWith('pending:')
            ? this.pending.find((item) => item.txnId === txn)?.failed
              ? 'failed'
              : 'pending'
            : this.received.get(id) || 'sent'
        } catch {
          /* Never render unauthenticated or malformed plaintext. */
        }
      }
      if (!this.active) return
      const receiptSummary = own ? this.receiptSummaries.get(id) : undefined
      this.messages.set(id, {
        id,
        sender: own ? 'self' : 'peer',
        ...(!own && room.kind === 'GROUP' && senderPeer?.name
          ? { senderName: senderPeer.name }
          : {}),
        text,
        ...(attachment ? { attachment } : {}),
        createdAt: Number.isFinite(event.origin_server_ts)
          ? event.origin_server_ts
          : 0,
        status,
        ...(receiptSummary ? { receiptSummary } : {}),
        ...(typeof txn === 'string' ? { txnId: txn } : {}),
      })
      if (
        !own &&
        (text !== null || attachment) &&
        !id.startsWith('pending:')
      )
        this.queueReceipt(
          id,
          this.snapshot.readReceiptsEnabled && this.visible.has(id),
        )
    }
    this.render()
  }
  async verification(action: VerificationAction) {
    return this.serial(async () => {
      if (
        this.snapshot.room?.kind === 'GROUP' ||
        !this.snapshot.room?.peer?.deviceId ||
        !this.snapshot.room.canSend
      )
        throw new Error('Peer not ready')
      await this.crypto.verify(this.snapshot.room.peer, action, this.http)
      await this.crypto.pump(this.http)
      await this.refreshMessages()
    })
  }
  async send(text: string) {
    if (!text.trim() || text.length > 4000)
      throw new Error('A mensagem deve ter entre 1 e 4.000 caracteres.')
    if (this.pending.length >= 100)
      throw new Error(
        'Aguarde o envio das mensagens pendentes antes de continuar.',
      )
    return this.serial(async () => {
      // A lista de aparelhos é relida a cada envio, sem cache: um aparelho
      // aprovado há instantes só recebe a chave da sala se entrar na
      // distribuição desta mensagem, e uma chave descartada não é reenviada.
      await this.refresh(false)
      const room = this.snapshot.room
      if (this.pending.length >= 100) throw new Error('Aguarde o envio das mensagens pendentes antes de continuar.')
      if (!room?.canSend)
        throw new Error(
          room?.kind === 'GROUP'
            ? 'Aguarde outra pessoa entrar no grupo para enviar mensagens.'
            : 'Esta interação está bloqueada.',
        )
      if (!this.hasAnyPeerDevice(room))
        throw new Error(
          room.kind === 'GROUP'
            ? 'Ninguém do grupo abriu as conversas no app ainda.'
            : 'A outra pessoa ainda não abriu as conversas no app.',
        )
      if (!this.hasTrustedPeer(room))
        throw new Error(
          'A segurança desta conversa mudou. Confira o aviso antes de enviar.',
        )
      const peers = this.roomPeers(room)
      // Cifra para os aparelhos de todos os participantes ativos e para os outros aparelhos desta conta.
      await this.crypto.share(room.roomId, [
        ...peers.map((peer) => peer.matrixUserId),
        this.session.matrixUserId,
      ])
      await this.crypto.pump(this.http)
      const content = await this.crypto.encrypt(room.roomId, text)
      const item: PendingChatMessage = {
        txnId: this.newId(),
        conversationId: this.conversationId,
        roomId: room.roomId,
        revision: room.revision,
        content,
        createdAt: Date.now(),
      }
      const next = [...this.pending, item]
      await this.storage.save(this.transport(next))
      this.pending = next
      this.events.set(`pending:${item.txnId}`, {
        event_id: `pending:${item.txnId}`,
        origin_server_ts: item.createdAt,
        sender: this.session.matrixUserId,
        type: 'm.room.encrypted',
        content,
        unsigned: { transaction_id: item.txnId },
      })
      this.messages.set(`pending:${item.txnId}`, {
        id: `pending:${item.txnId}`,
        txnId: item.txnId,
        text,
        sender: 'self',
        createdAt: item.createdAt,
        status: 'pending',
      })
      this.render()
      await this.flush()
    })
  }
  /**
   * Envia imagem, vídeo, áudio ou arquivo cifrado no cliente (padrão Matrix v2)
   * antes do upload. O servidor só armazena bytes opacos por 90 dias.
   */
  async sendMedia(input: {
    kind: ChatMediaKind
    name: string
    mimeType: string
    bytes: Uint8Array
    caption?: string
    width?: number
    height?: number
    durationMs?: number
    upload: (ciphertext: Uint8Array) => Promise<{ id: string }>
  }) {
    if (!input.bytes.length)
      throw new Error('O arquivo selecionado está vazio.')
    const limit = CHAT_MEDIA_LIMITS[input.kind]
    if (input.bytes.length > limit)
      throw new Error(
        `Este arquivo ultrapassa o limite de ${formatFileSize(limit)}.`,
      )
    if (!this.crypto.encryptAttachment)
      throw new Error('O envio de anexos ainda não está disponível neste aparelho.')
    if (this.pending.length >= 100)
      throw new Error(
        'Aguarde o envio das mensagens pendentes antes de continuar.',
      )
    return this.serial(async () => {
      await this.refresh(false)
      const room = this.snapshot.room
      if (!room?.canSend)
        throw new Error(
          room?.kind === 'GROUP'
            ? 'Aguarde outra pessoa entrar no grupo para enviar mensagens.'
            : 'Esta interação está bloqueada.',
        )
      if (!this.hasAnyPeerDevice(room))
        throw new Error(
          room.kind === 'GROUP'
            ? 'Ninguém do grupo abriu as conversas no app ainda.'
            : 'A outra pessoa ainda não abriu as conversas no app.',
        )
      if (!this.hasTrustedPeer(room))
        throw new Error(
          'A segurança desta conversa mudou. Confira o aviso antes de enviar.',
        )
      const sealed = await this.crypto.encryptAttachment!(input.bytes)
      const uploaded = await input.upload(sealed.ciphertext)
      const attachment: ChatAttachment = {
        kind: input.kind,
        id: uploaded.id,
        name: input.name.trim().slice(0, 200) || mediaKindLabel(input.kind),
        mimeType: input.mimeType || 'application/octet-stream',
        size: input.bytes.length,
        secret: sealed.secret,
        ...(input.width ? { width: input.width } : {}),
        ...(input.height ? { height: input.height } : {}),
        ...(input.durationMs ? { durationMs: input.durationMs } : {}),
      }
      const peers = this.roomPeers(room)
      await this.crypto.share(room.roomId, [
        ...peers.map((peer) => peer.matrixUserId),
        this.session.matrixUserId,
      ])
      await this.crypto.pump(this.http)
      const payload = buildMediaEventContent(attachment, input.caption)
      const content = await this.crypto.encrypt(room.roomId, payload)
      const item: PendingChatMessage = {
        txnId: this.newId(),
        conversationId: this.conversationId,
        roomId: room.roomId,
        revision: room.revision,
        content,
        createdAt: Date.now(),
      }
      const next = [...this.pending, item]
      await this.storage.save(this.transport(next))
      this.pending = next
      this.events.set(`pending:${item.txnId}`, {
        event_id: `pending:${item.txnId}`,
        origin_server_ts: item.createdAt,
        sender: this.session.matrixUserId,
        type: 'm.room.encrypted',
        content,
        unsigned: { transaction_id: item.txnId },
      })
      this.messages.set(`pending:${item.txnId}`, {
        id: `pending:${item.txnId}`,
        txnId: item.txnId,
        text: (input.caption || '').trim(),
        attachment,
        sender: 'self',
        createdAt: item.createdAt,
        status: 'pending',
      })
      this.render()
      await this.flush()
    })
  }
  /** Decifra bytes baixados de um anexo usando o segredo padrão Matrix v2. */
  async decryptMedia(ciphertext: Uint8Array, secret: string): Promise<Uint8Array> {
    if (!this.crypto.decryptAttachment)
      throw new Error('Não foi possível abrir o anexo neste aparelho.')
    return this.crypto.decryptAttachment(ciphertext, secret)
  }
  private async flush() {
    for (const item of [...this.pending].filter((row) => !row.failed)) {
      if (!this.active) return
      try {
        const result = await this.http(
          `/${item.conversationId}/chat/messages/${encodeURIComponent(item.txnId)}`,
          'PUT',
          { revision: item.revision, content: item.content },
        )
        const previous = this.messages.get(`pending:${item.txnId}`)
        this.pending = this.pending.filter((row) => row.txnId !== item.txnId)
        this.events.delete(`pending:${item.txnId}`)
        this.messages.delete(`pending:${item.txnId}`)
        if (previous && typeof result.event_id === 'string')
          this.messages.set(result.event_id, {
            ...previous,
            id: result.event_id,
            status: 'sent',
          })
        await this.save()
      } catch (error) {
        const status =
          (error as { status?: number; response?: { status?: number } })
            ?.response?.status || (error as { status?: number })?.status
        const message = this.messages.get(`pending:${item.txnId}`)
        if (status && status >= 400 && status < 500 && status !== 429) {
          item.failed = true
          if (message) message.status = 'failed'
          await this.save()
        }
        this.update({ error: chatError(error), connected: false })
        this.render()
        return
      }
    }
    this.render()
  }
  private async readHistory(from?: string) {
    const history = await this.http(
      `/${this.conversationId}/chat/messages${from ? `?from=${encodeURIComponent(from)}` : ''}`,
    )
    for (const event of history.chunk || [])
      if (typeof event.event_id === 'string')
        this.events.set(event.event_id, event)
    this.update({
      historyCursor:
        typeof history.end === 'string' && history.chunk?.length
          ? history.end
          : null,
    })
    await this.refreshMessages()
  }
  async older() {
    if (!this.snapshot.historyCursor || this.snapshot.loadingHistory) return
    this.update({ loadingHistory: true })
    try {
      await this.serial(() => this.readHistory(this.snapshot.historyCursor!))
    } finally {
      this.update({ loadingHistory: false })
    }
  }
  async retry(txnId: string) {
    return this.serial(async () => {
      const item = this.pending.find(
        (row) =>
          row.txnId === txnId && row.conversationId === this.conversationId,
      )
      if (!item) return
      await this.refresh()
      if (!this.snapshot.room?.canSend)
        throw new Error('Esta interação está bloqueada.')
      item.revision = this.snapshot.room.revision
      item.failed = false
      await this.save()
      await this.flush()
    })
  }
  private queueReceipt(eventId: string, read: boolean) {
    const same = (row: ReceiptJob) =>
      row.conversationId === this.conversationId && row.eventId === eventId
    if (this.acknowledged.some((row) => same(row) && (row.read || !read)))
      return
    const current = this.receipts.find(same)
    if (current) current.read ||= read
    else if (this.receipts.length < 2048)
      this.receipts.push({ conversationId: this.conversationId, eventId, read })
  }
  visibleMessages(ids: string[]) {
    if (!this.active) return
    this.visible = new Set(ids)
    // Mensagem recebida, aberta e visível: a pessoa viu a conversa.
    if (
      ids.some((id) => {
        const message = this.messages.get(id)
        return (
          message?.sender === 'peer' &&
          message.text !== null &&
          !id.startsWith('pending:')
        )
      })
    )
      this.markSeen()
    void this.serial(async () => {
      if (!this.active) return
      for (const id of this.snapshot.readReceiptsEnabled ? this.visible : []) {
        const message = this.messages.get(id)
        if (
          message?.sender === 'peer' &&
          message.text !== null &&
          !id.startsWith('pending:')
        )
          this.queueReceipt(id, true)
      }
      await this.save()
    }).catch((error) => this.update({ error: chatError(error) }))
  }
  async setReadReceipts(enabled: boolean) {
    return this.serial(async () => {
      const privacy = await this.http('/chat/privacy', 'PUT', {
        readReceiptsEnabled: enabled,
      })
      this.update({ readReceiptsEnabled: privacy.readReceiptsEnabled === true })
      if (!enabled) for (const receipt of this.receipts) receipt.read = false
      else
        for (const id of this.visible) {
          const message = this.messages.get(id)
          if (message?.sender === 'peer' && message.text !== null)
            this.queueReceipt(id, true)
        }
      await this.save()
    })
  }
  private async syncReceipts() {
    if (!this.active || !this.snapshot.room?.canSend) return
    // Only authenticated, decrypted messages qualify as delivered. Persist the
    // opaque receipt queue before acknowledgement, just like the ciphertext outbox.
    await this.save()
    for (const read of [false, true]) {
      const batch = this.receipts
        .filter(
          (row) =>
            row.conversationId === this.conversationId && row.read === read,
        )
        .slice(0, 20)
      if (!batch.length) continue
      try {
        await this.http(`/${this.conversationId}/chat/receipts`, 'POST', {
          eventIds: batch.map((row) => row.eventId),
          read,
        })
      } catch (error) {
        const status =
          (error as { response?: { status?: number }; status?: number })
            .response?.status || (error as { status?: number }).status
        if (read && status === 403) {
          const privacy = await this.http('/chat/privacy')
          if (privacy.readReceiptsEnabled === false) {
            this.update({ readReceiptsEnabled: false })
            for (const row of this.receipts) row.read = false
            await this.save()
          }
        }
        throw error
      }
      for (const row of batch) {
        this.receipts = this.receipts.filter((item) => item !== row)
        this.acknowledged = this.acknowledged.filter(
          (item) =>
            item.eventId !== row.eventId ||
            item.conversationId !== row.conversationId,
        )
        this.acknowledged.push(row)
      }
      this.acknowledged = this.acknowledged.slice(-2048)
      await this.save()
    }
    const own = [...this.messages.values()].filter(
      (row) =>
        row.sender === 'self' &&
        row.text !== null &&
        !['pending', 'failed', 'read'].includes(row.status),
    )
    // Recent messages are checked first; visible older messages get priority.
    const eventIds = [
      ...own.filter((row) => this.visible.has(row.id)),
      ...own.reverse(),
    ]
      .map((row) => row.id)
      .filter((id, index, all) => all.indexOf(id) === index)
      .slice(0, 50)
    if (!eventIds.length) return
    const result = await this.http(
      `/${this.conversationId}/chat/receipts/query`,
      'POST',
      { eventIds },
    )
    for (const receipt of result.receipts || []) {
      if (!eventIds.includes(receipt.eventId) || !receipt.deliveredAt) continue
      const total =
        typeof receipt.totalRecipients === 'number'
          ? receipt.totalRecipients
          : 0
      let status: 'delivered' | 'read'
      let summary: string | undefined
      if (total > 1) {
        const readCount = Number(receipt.readCount || 0)
        const deliveredCount = Number(receipt.deliveredCount || 0)
        if (readCount >= total) {
          status = 'read'
        } else if (readCount > 0) {
          status = 'delivered'
          summary = `Lida por ${readCount} de ${total}`
        } else if (deliveredCount >= total) {
          status = 'delivered'
        } else {
          status = 'delivered'
          summary = `Entregue a ${deliveredCount} de ${total}`
        }
      } else {
        status = receipt.readAt ? 'read' : 'delivered'
      }
      this.received.set(receipt.eventId, status)
      if (summary) this.receiptSummaries.set(receipt.eventId, summary)
      else this.receiptSummaries.delete(receipt.eventId)
      const message = this.messages.get(receipt.eventId)
      if (message) {
        message.status = status
        message.receiptSummary = summary
      }
    }
    this.render()
  }
}
