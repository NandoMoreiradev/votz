"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatClient = exports.STORAGE_KIND_LABEL = exports.CHAT_BACKUP_TEXT = exports.CHAT_BACKUP_MIN_PASSWORD = exports.ChatDeviceDisconnectedError = exports.chatPreviews = exports.chatTranscripts = exports.RESET_WARNING = exports.ENROLL_WAITING = exports.QUICK_REACTIONS = exports.CHAT_MEDIA_LIMITS = void 0;
exports.extractVotzCard = extractVotzCard;
exports.mediaKindFromMime = mediaKindFromMime;
exports.mediaKindLabel = mediaKindLabel;
exports.formatFileSize = formatFileSize;
exports.buildMediaEventContent = buildMediaEventContent;
exports.parseDecryptedMessage = parseDecryptedMessage;
exports.messageStatusLabel = messageStatusLabel;
exports.messagePlaceholder = messagePlaceholder;
exports.composerPlaceholder = composerPlaceholder;
exports.chatError = chatError;
exports.chatView = chatView;
exports.deviceRequestText = deviceRequestText;
exports.formatLinkCode = formatLinkCode;
exports.formatDeviceLinkQr = formatDeviceLinkQr;
exports.parseDeviceLinkQr = parseDeviceLinkQr;
exports.chatDevicesApi = chatDevicesApi;
exports.formatTransferCode = formatTransferCode;
exports.chatBackupApi = chatBackupApi;
exports.chatStorageApi = chatStorageApi;
exports.formatStorageSize = formatStorageSize;
exports.chatStorageView = chatStorageView;
exports.chatStorageDeleteConfirm = chatStorageDeleteConfirm;
exports.enrollDevice = enrollDevice;
exports.chatSeedState = chatSeedState;
exports.CHAT_MEDIA_LIMITS = {
    image: 10 * 1024 * 1024,
    audio: 25 * 1024 * 1024,
    file: 25 * 1024 * 1024,
    video: 50 * 1024 * 1024,
};
exports.QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏'];
/** Detecta link interno de publicação ou relato do Votz para exibir cartão na bolha. */
function extractVotzCard(text) {
    const match = text.match(/(?:https?:\/\/[^\s/]+)?\/(publicacoes|relatos)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (!match)
        return undefined;
    const kind = match[1].toLowerCase() === 'publicacoes' ? 'post' : 'report';
    const id = match[2].toLowerCase();
    return {
        kind,
        id,
        url: `/${match[1].toLowerCase()}/${id}`,
    };
}
const MEDIA_MSGTYPE = {
    image: 'm.image',
    video: 'm.video',
    audio: 'm.audio',
    file: 'm.file',
};
const MSGTYPE_TO_KIND = {
    'm.image': 'image',
    'm.video': 'video',
    'm.audio': 'audio',
    'm.file': 'file',
};
function mediaKindFromMime(mimeType) {
    const mime = (mimeType || '').toLowerCase();
    if (mime.startsWith('image/'))
        return 'image';
    if (mime.startsWith('video/'))
        return 'video';
    if (mime.startsWith('audio/'))
        return 'audio';
    return 'file';
}
function mediaKindLabel(kind) {
    return { image: 'Foto', video: 'Vídeo', audio: 'Áudio', file: 'Arquivo' }[kind];
}
function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 1024)
        return `${Math.max(0, Math.round(bytes || 0))} B`;
    if (bytes < 1024 * 1024)
        return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
function buildMediaEventContent(attachment, caption) {
    const parsed = JSON.parse(attachment.secret);
    const trimmed = (caption || '').trim().slice(0, 1000);
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
    };
}
function parseReply(content) {
    const raw = content['br.votz.reply'];
    const relId = content['m.relates_to']?.['m.in_reply_to']
        ?.event_id;
    const eventId = typeof raw?.eventId === 'string'
        ? raw.eventId
        : typeof relId === 'string'
            ? relId
            : null;
    if (!eventId || eventId.length > 200)
        return undefined;
    return {
        eventId,
        ...(typeof raw?.senderName === 'string' && raw.senderName.trim()
            ? { senderName: raw.senderName.trim().slice(0, 80) }
            : {}),
        excerpt: typeof raw?.excerpt === 'string'
            ? raw.excerpt.trim().slice(0, 140)
            : 'Mensagem',
    };
}
function parseCard(content, text) {
    const raw = content['br.votz.card'];
    if (raw &&
        (raw.kind === 'post' || raw.kind === 'report') &&
        typeof raw.id === 'string' &&
        /^[0-9a-f-]{36}$/i.test(raw.id)) {
        return {
            kind: raw.kind,
            id: raw.id,
            ...(typeof raw.title === 'string' && raw.title.trim()
                ? { title: raw.title.trim().slice(0, 140) }
                : {}),
            url: typeof raw.url === 'string' && raw.url.startsWith('/')
                ? raw.url
                : `/${raw.kind === 'post' ? 'publicacoes' : 'relatos'}/${raw.id}`,
        };
    }
    return text ? extractVotzCard(text) : undefined;
}
function parseDecryptedMessage(content) {
    if (!content || typeof content !== 'object')
        throw new Error('Conteúdo de mensagem inválido.');
    if (content.msgtype === 'br.votz.reaction') {
        if (typeof content.targetEventId !== 'string' ||
            content.targetEventId.length > 200 ||
            typeof content.emoji !== 'string' ||
            !content.emoji.trim() ||
            content.emoji.length > 16)
            throw new Error('Reação inválida.');
        return {
            text: null,
            reaction: {
                targetEventId: content.targetEventId,
                emoji: content.emoji.trim(),
                remove: content.remove === true,
            },
        };
    }
    const replyTo = parseReply(content);
    const forwarded = content['br.votz.forwarded'] === true ? true : undefined;
    if (content.msgtype === 'm.text') {
        if (typeof content.body !== 'string' || content.body.length > 4000)
            throw new Error('Conteúdo de mensagem não suportado.');
        const card = parseCard(content, content.body);
        return {
            text: content.body,
            ...(replyTo ? { replyTo } : {}),
            ...(forwarded ? { forwarded } : {}),
            ...(card ? { card } : {}),
        };
    }
    const kind = MSGTYPE_TO_KIND[String(content.msgtype || '')];
    if (!kind)
        throw new Error('Conteúdo de mensagem não suportado.');
    const file = content.file;
    if (!file ||
        typeof file !== 'object' ||
        file.v !== 'v2' ||
        typeof file.url !== 'string' ||
        !/^votz-media:\/\/[0-9a-f-]{36}$/i.test(file.url) ||
        typeof file.iv !== 'string' ||
        !file.key ||
        !file.hashes?.sha256)
        throw new Error('Anexo cifrado inválido.');
    const id = file.url.slice('votz-media://'.length);
    const { url: _unused, ...secretObj } = file;
    const info = (content.info && typeof content.info === 'object' ? content.info : {});
    const name = typeof content.filename === 'string' && content.filename.trim()
        ? content.filename.trim().slice(0, 200)
        : typeof content.body === 'string' && content.body.trim()
            ? content.body.trim().slice(0, 200)
            : mediaKindLabel(kind);
    const body = typeof content.body === 'string' ? content.body.trim().slice(0, 1000) : '';
    const caption = body && body !== name ? body : '';
    return {
        text: caption,
        ...(replyTo ? { replyTo } : {}),
        ...(forwarded ? { forwarded } : {}),
        attachment: {
            kind,
            id,
            name,
            mimeType: typeof info.mimetype === 'string'
                ? info.mimetype
                : 'application/octet-stream',
            size: typeof info.size === 'number' && info.size > 0 ? info.size : 0,
            secret: JSON.stringify(secretObj),
            ...(typeof info.w === 'number' ? { width: info.w } : {}),
            ...(typeof info.h === 'number' ? { height: info.h } : {}),
            ...(typeof info.duration === 'number' ? { durationMs: info.duration } : {}),
        },
    };
}
function messageStatusLabel(status) {
    return {
        pending: 'Aguardando envio',
        sent: 'Enviada',
        delivered: 'Entregue',
        read: 'Lida',
        failed: 'Não enviada',
        unverified: 'Aparelho não confiável',
        disconnected: 'Aparelho desconectado',
        unavailable: 'Não foi possível abrir',
    }[status];
}
/** Texto mostrado no lugar de uma mensagem que não pôde ser aberta. */
function messagePlaceholder(status) {
    if (status === 'unverified')
        return 'Esta mensagem veio de um aparelho com segurança alterada. Confira o aviso acima para lê-la.';
    if (status === 'disconnected')
        return 'Esta mensagem veio de um aparelho que não está mais conectado e não pode ser aberta.';
    return 'Não foi possível abrir esta mensagem neste aparelho.';
}
/** Dica do campo de mensagem, igual no web e no mobile. */
function composerPlaceholder(state) {
    if (state.peerStatus === 'ready')
        return state.room?.canSend
            ? 'Mensagem'
            : 'Esta interação está bloqueada.';
    if (state.peerStatus === 'blocked')
        return 'Confira o aviso de segurança para conversar';
    if (state.peerStatus === 'preparing')
        return 'Preparando a conversa segura…';
    return 'Aguardando a outra pessoa abrir as conversas';
}
function chatError(error) {
    const e = error;
    const status = e?.response?.status || e?.status;
    if (status === 401)
        return 'Reconectando…';
    if (status === 403)
        return 'Esta ação não está disponível para esta conversa.';
    if (status === 404)
        return 'Esta conversa não está mais disponível.';
    if (status === 410)
        return 'O pedido expirou. Peça a conexão novamente.';
    if (status === 409)
        return (e?.response?.data?.message ||
            e?.message ||
            'Atualize a conversa antes de continuar.');
    return 'Não foi possível conectar ao mensageiro. Tente novamente.';
}
const READ_RECEIPTS_LABEL = 'Compartilhar quando eu ler';
const READ_RECEIPTS_HELP = 'Entregue significa que a outra pessoa recebeu. Lida só aparece se ela ligar esta opção e a mensagem estiver na tela.';
function formatMessageTime(createdAt) {
    return new Date(createdAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
    });
}
function normalizeSearch(value) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}
/**
 * Tudo o que a pessoa lê na conversa, num só lugar: o web e o mobile
 * não repetem texto nem regra. Sem jargão: nada de "chave", "dispositivo"
 * ou "ativar".
 */
function chatView(state, peerName, verified = state?.verification?.state === 'done', searchQuery = '') {
    const isGroup = state?.room?.kind === 'GROUP';
    const banner = isGroup
        ? 'As mensagens deste grupo são protegidas com criptografia de ponta a ponta.'
        : verified
            ? 'Identidade confirmada. As mensagens são protegidas com criptografia de ponta a ponta.'
            : 'As mensagens são protegidas com criptografia de ponta a ponta.';
    if (!state)
        return {
            canWrite: false,
            canType: true,
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
        };
    const peers = state.room?.peers ?? (state.room?.peer ? [state.room.peer] : []);
    const notices = [];
    for (const notice of state.notices) {
        // Um aparelho novo da própria conta foi aprovado pela própria pessoa: sem aviso.
        if (notice.who === 'self')
            continue;
        const whoName = (notice.userId
            ? peers.find((p) => p.matrixUserId === notice.userId)?.name
            : undefined) || peerName;
        notices.push(notice.kind === 'key-changed'
            ? {
                id: notice.id,
                text: `O código de segurança de ${whoName} mudou.`,
                detail: 'Pode ser só uma troca de celular. Até você continuar, as mensagens novas dele não aparecem.',
                action: 'Continuar',
                blocking: true,
            }
            : {
                id: notice.id,
                text: `${whoName} trocou de aparelho ou entrou em outro.`,
                action: 'Ok',
                blocking: false,
            });
    }
    const canWrite = state.peerTrusted && !!state.room?.canSend;
    const canVerify = !isGroup && !!state.ready && !!state.room?.peer?.deviceId && !verified;
    const v = state.verification;
    let verification = null;
    if (canVerify) {
        const idle = !v || ['none', 'cancelled'].includes(v.state);
        const primaryAction = idle
            ? { action: 'request', label: 'Começar a confirmação' }
            : v.state === 'requested' && v.incoming
                ? { action: 'accept', label: 'Aceitar' }
                : v.state === 'comparing'
                    ? { action: 'confirm', label: 'Os números são iguais' }
                    : null;
        const waitingText = v?.state === 'requested' && !v.incoming
            ? 'Esperando a outra pessoa aceitar…'
            : v?.state === 'ready'
                ? 'Preparando os números…'
                : v?.state === 'confirmed'
                    ? 'Esperando a outra pessoa confirmar…'
                    : null;
        verification = {
            active: !!v && !['none', 'cancelled', 'done'].includes(v.state),
            title: 'Confirmar identidade (opcional)',
            description: `Comparem os três números nas duas telas com ${peerName}. Só confirme se forem iguais. Você pode conversar sem fazer isso.`,
            code: v?.decimals ? v.decimals.join(' · ') : null,
            primaryAction,
            waitingText,
            canCancel: !idle,
            cancelLabel: 'Cancelar',
        };
    }
    const query = normalizeSearch(searchQuery);
    const now = new Date();
    const dayStamp = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const todayStamp = dayStamp(now);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStamp = dayStamp(yesterday);
    const formatDayDivider = (ts) => {
        const d = new Date(ts);
        if (Number.isNaN(d.getTime()))
            return 'Hoje';
        const key = dayStamp(d);
        if (key === todayStamp)
            return 'Hoje';
        if (key === yesterdayStamp)
            return 'Ontem';
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    };
    const deliveryIconFor = (own, status, summary) => {
        if (!own)
            return null;
        if (status === 'failed')
            return 'alert';
        if (status === 'pending')
            return 'clock';
        if (status === 'read' || (summary && summary.startsWith('Lida')))
            return 'checks-read';
        if (status === 'delivered' || (summary && summary.startsWith('Entregue')))
            return 'checks';
        return 'check';
    };
    let prevDayKey = '';
    let prevAuthor = '';
    const allMessages = state.messages.map((message) => {
        const own = message.sender === 'self';
        const time = formatMessageTime(message.createdAt);
        const statusText = message.receiptSummary ?? messageStatusLabel(message.status);
        const d = new Date(message.createdAt);
        const dayKey = Number.isNaN(d.getTime()) ? todayStamp : dayStamp(d);
        const dayDivider = dayKey !== prevDayKey ? formatDayDivider(message.createdAt) : null;
        const authorKey = own ? 'self' : (message.senderName ?? 'peer');
        const isFirstInGroup = dayKey !== prevDayKey || authorKey !== prevAuthor;
        prevDayKey = dayKey;
        prevAuthor = authorKey;
        return {
            id: message.id,
            own,
            senderName: own ? null : (message.senderName ?? null),
            body: message.text !== null
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
            replyTo: message.replyTo ?? null,
            forwarded: message.forwarded === true,
            card: message.card
                ? {
                    ...message.card,
                    label: message.card.kind === 'post'
                        ? 'Publicação no Votz'
                        : 'Relato no Votz',
                }
                : null,
            reactions: message.reactions ?? [],
            canReact: !message.id.startsWith('pending:') &&
                (message.text !== null || !!message.attachment) &&
                canWrite,
            time,
            meta: own ? `${time} · ${statusText}` : time,
            statusLabel: own ? statusText : null,
            unreadable: message.text === null && !message.attachment,
            dayKey,
            dayDivider,
            isFirstInGroup,
            deliveryIcon: deliveryIconFor(own, message.status, message.receiptSummary),
            retryTxnId: message.status === 'failed' && message.txnId ? message.txnId : null,
            retryLabel: 'Tentar enviar novamente',
            canRetry: !!state.room?.canSend,
        };
    });
    const messages = query
        ? allMessages.filter((message) => normalizeSearch(`${message.body} ${message.attachment?.name ?? ''} ${message.senderName ?? ''}`).includes(query))
        : allMessages;
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
                : null;
    return {
        canWrite,
        canType: canWrite || !state.ready,
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
        emptyText: !messages.length
            ? query
                ? 'Nenhuma mensagem encontrada.'
                : state.ready && canWrite
                    ? isGroup
                        ? 'A conversa do grupo começa aqui.'
                        : 'A conversa de vocês começa aqui.'
                    : null
            : null,
        readReceipts: {
            enabled: state.readReceiptsEnabled,
            disabled: !state.ready || !state.connected,
            label: READ_RECEIPTS_LABEL,
            help: READ_RECEIPTS_HELP,
        },
        canLoadOlder: !!state.historyCursor,
        olderLabel: 'Mensagens anteriores',
    };
}
/** Pedido de outro aparelho para usar a conta, em linguagem simples. */
function deviceRequestText(link, names = {
    android: 'Android',
    ios: 'iPhone',
    web: 'um navegador',
    test: 'um aparelho de teste',
}) {
    const device = link.label || names[link.platform] || 'Outro aparelho';
    return {
        title: 'Novo aparelho pedindo acesso',
        text: `${device} quer usar suas conversas. Permita só se foi você. O código no outro aparelho deve ser ${link.code}.`,
        allow: 'Permitir',
        deny: 'Negar',
    };
}
/** Formata o código de 6 dígitos para leitura fácil (ex.: "482 910"). */
function formatLinkCode(code) {
    const digits = code.replace(/\D/g, '');
    return digits.length === 6 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : code;
}
/** Monta o conteúdo do código QR de conexão entre aparelhos. */
function formatDeviceLinkQr(pending) {
    const digits = pending.code.replace(/\D/g, '');
    const query = pending.id
        ? `code=${encodeURIComponent(digits)}&id=${encodeURIComponent(pending.id)}`
        : `code=${encodeURIComponent(digits)}`;
    return `votz://chat-link?${query}`;
}
/** Lê um código QR de conexão ou um código numérico de 6 dígitos digitado pela pessoa. */
function parseDeviceLinkQr(raw) {
    const trimmed = (raw || '').trim();
    if (!trimmed)
        return null;
    if (trimmed.toLowerCase().startsWith('votz://chat-link')) {
        const queryIndex = trimmed.indexOf('?');
        if (queryIndex < 0)
            return null;
        const params = new URLSearchParams(trimmed.slice(queryIndex + 1));
        const code = (params.get('code') || '').replace(/\D/g, '');
        if (!/^\d{6}$/.test(code))
            return null;
        const id = params.get('id')?.trim();
        return id && /^[0-9a-f-]{36}$/i.test(id) ? { code, linkId: id } : { code };
    }
    const digits = trimmed.replace(/\D/g, '');
    if (/^\d{6}$/.test(digits))
        return { code: digits };
    return null;
}
/** Tela de quem espera a permissão de outro aparelho. */
exports.ENROLL_WAITING = {
    title: 'Permita no seu outro aparelho',
    text: 'Abra o Votz em outro aparelho seu e permita este acesso. Confira se o código é o mesmo:',
    qrHint: 'Ou aponte a câmera do celular em Aparelhos conectados para ler o código QR.',
    historyNote: 'Suas novas mensagens vão aparecer nos dois aparelhos. Conversas anteriores continuam salvas no outro aparelho.',
    note: 'O pedido vale por 10 minutos.',
    lost: 'Não tenho mais acesso aos outros aparelhos',
    bannerTitle: 'Conecte este aparelho às suas conversas',
    bannerText: 'Você já usa mensagens em outro aparelho. Libere este acesso para enviar e receber por aqui.',
    bannerAction: 'Conectar agora',
    bannerDismiss: 'Agora não',
    enterCodeTitle: 'Conectar outro aparelho',
    enterCodeHint: 'Digite os 6 dígitos mostrados na tela do novo aparelho ou leia o código QR.',
    enterCodeAction: 'Permitir aparelho',
    scanQrAction: 'Ler código QR',
};
/** Aviso antes de redefinir quando não há mais nenhum aparelho antigo. */
exports.RESET_WARNING = {
    title: 'Começar do zero neste aparelho?',
    text: 'Seus outros aparelhos serão desconectados e as mensagens antigas não poderão ser lidas aqui. Para continuar, confirme sua senha do Votz.',
    action: 'Redefinir',
};
const previews = new Map();
const transcripts = new Map();
const TRANSCRIPT_CONVERSATIONS = 8;
const TRANSCRIPT_MESSAGES = 80;
/**
 * Últimas mensagens abertas de cada conversa recente, para a conversa aparecer
 * na hora ao voltar a ela, enquanto a sincronização termina por trás.
 *
 * Só na memória do aplicativo, como a prévia: nunca vai ao disco nem ao
 * servidor, e some junto com ela (`chatPreviews.clear()`: segundo plano, sair da
 * conta ou trocar de usuário).
 */
exports.chatTranscripts = {
    get: (conversationId) => transcripts.get(conversationId),
    set(conversationId, messages) {
        const merged = new Map((transcripts.get(conversationId) ?? []).map((m) => [m.id, m]));
        for (const m of messages)
            if (!m.id.startsWith('pending:'))
                merged.set(m.id, m);
        if (!merged.size)
            return;
        const kept = [...merged.values()]
            .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
            .slice(-TRANSCRIPT_MESSAGES);
        transcripts.delete(conversationId); // mais recente por último
        transcripts.set(conversationId, kept);
        while (transcripts.size > TRANSCRIPT_CONVERSATIONS)
            transcripts.delete(transcripts.keys().next().value);
    },
    clear() {
        transcripts.clear();
    },
};
const previewListeners = new Set();
/**
 * Prévia (texto da última mensagem) para a lista de conversas.
 *
 * Só na memória do aplicativo: nunca vai ao disco nem ao servidor. Quem usa
 * chama `clear()` ao sair da conta e quando o aplicativo vai para segundo
 * plano, igual ao restante do texto aberto.
 */
exports.chatPreviews = {
    get: (conversationId) => previews.get(conversationId),
    set(conversationId, preview) {
        const old = previews.get(conversationId);
        if (old?.eventId === preview.eventId && old.text === preview.text)
            return;
        previews.set(conversationId, preview);
        for (const listener of previewListeners)
            listener();
    },
    clear() {
        transcripts.clear();
        if (!previews.size)
            return;
        previews.clear();
        for (const listener of previewListeners)
            listener();
    },
    subscribe(listener) {
        previewListeners.add(listener);
        return () => {
            previewListeners.delete(listener);
        };
    },
};
/** Este aparelho foi desconectado (por outro aparelho ou pela redefinição). O app deve recomeçar com credenciais novas. */
class ChatDeviceDisconnectedError extends Error {
    constructor() {
        super('Este aparelho foi desconectado.');
        this.name = 'ChatDeviceDisconnectedError';
    }
}
exports.ChatDeviceDisconnectedError = ChatDeviceDisconnectedError;
/**
 * Gerenciamento de aparelhos conectados. Não precisa do motor criptográfico:
 * só das credenciais deste aparelho, enviadas pelo `http` fornecido.
 */
function chatDevicesApi(http) {
    return {
        list: () => http('/chat/devices'),
        status: () => http('/chat/devices/status'),
        decide: (linkId, approve) => http(`/chat/device-links/${encodeURIComponent(linkId)}`, 'POST', {
            approve,
        }),
        approveByCode: (code, linkId) => http('/chat/device-links/approve-code', 'POST', {
            code,
            ...(linkId ? { linkId } : {}),
        }),
        revoke: (deviceId) => http(`/chat/devices/${encodeURIComponent(deviceId)}`, 'DELETE'),
    };
}
exports.CHAT_BACKUP_MIN_PASSWORD = 8;
/** Formata código temporário de transferência (8 dígitos) em dois blocos de 4. */
function formatTransferCode(code) {
    const digits = code.replace(/\D/g, '');
    return digits.length === 8 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : code;
}
/** Textos de backup e transferência de histórico, sem jargão técnico. */
exports.CHAT_BACKUP_TEXT = {
    title: 'Backup protegido na nuvem',
    subtitle: 'Guarde uma cópia protegida do seu histórico para recuperar conversas ao entrar no computador ou trocar de celular.',
    passwordHint: 'Escolha uma senha de pelo menos 8 caracteres. O Votz não guarda essa senha e não consegue recuperá-la se você esquecer.',
    saveAction: 'Salvar backup agora',
    updateAction: 'Atualizar backup',
    restoreTitle: 'Restaurar histórico neste aparelho',
    restoreAction: 'Restaurar histórico',
    deleteAction: 'Apagar backup da nuvem',
    transferTitle: 'Transferir histórico para outro aparelho',
    transferSubtitle: 'Envie seu histórico direto para outro aparelho conectado usando um código temporário que vale por 15 minutos e é apagado assim que recebido.',
    sendTransferAction: 'Gerar código de transferência',
    receiveTransferTitle: 'Receber histórico de outro aparelho',
    receiveTransferAction: 'Receber histórico',
};
/** API de backup protegido na nuvem e transferência temporária de histórico. */
function chatBackupApi(http) {
    return {
        meta: () => http('/chat/backup/meta'),
        download: () => http('/chat/backup'),
        upload: (vault) => http('/chat/backup', 'PUT', { vault }),
        remove: () => http('/chat/backup', 'DELETE'),
        transferMeta: () => http('/chat/history-transfer'),
        createTransfer: (vault) => http('/chat/history-transfer', 'POST', { vault }),
        consumeTransfer: (id) => http(`/chat/history-transfer/${encodeURIComponent(id)}/consume`, 'POST'),
    };
}
/**
 * "Gerenciar armazenamento": lista e apaga os arquivos que a própria pessoa enviou. Como a lista de
 * aparelhos, não precisa do motor criptográfico, só das credenciais deste aparelho no `http`.
 */
function chatStorageApi(http) {
    return {
        list: (options = {}) => {
            const query = [
                options.sort ? `sort=${options.sort}` : '',
                options.skip ? `skip=${Math.trunc(options.skip)}` : '',
                options.take ? `take=${Math.trunc(options.take)}` : '',
            ].filter(Boolean);
            return http(`/chat/storage${query.length ? `?${query.join('&')}` : ''}`);
        },
        remove: (ids) => http('/chat/storage', 'DELETE', { ids }),
    };
}
/** Tamanho em linguagem de gente: KB, MB ou GB, com vírgula. */
function formatStorageSize(bytes) {
    const value = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
    if (value < 1024 * 1024 * 1024)
        return formatFileSize(value);
    return `${(value / (1024 * 1024 * 1024)).toFixed(1).replace('.', ',')} GB`;
}
/** Textos da tela "Gerenciar armazenamento", em português simples. */
function chatStorageView(usage) {
    const limit = Math.max(usage.limitBytes, 1);
    const full = usage.usedBytes >= limit;
    const level = full
        ? 'full'
        : usage.nearLimit
            ? 'near'
            : 'ok';
    return {
        level,
        percent: Math.min(100, Math.round((usage.usedBytes / limit) * 100)),
        summary: `Você usou ${formatStorageSize(usage.usedBytes)} de ${formatStorageSize(limit)}.`,
        hint: {
            ok: '',
            near: 'Seu espaço está quase cheio. Apague o que você não usa mais para continuar enviando.',
            full: 'Seu espaço acabou. Apague arquivos para voltar a enviar fotos, vídeos e documentos.',
        }[level],
        help: 'Aqui aparecem os arquivos que você enviou nas conversas. Os que outras pessoas enviaram ficam no espaço delas.',
        empty: 'Você ainda não enviou nenhum arquivo.',
        upgrade: { label: 'Aumentar espaço', soon: 'Em breve' },
    };
}
/** Pergunta antes de apagar: avisa que o arquivo some para todos da conversa. */
function chatStorageDeleteConfirm(count) {
    const what = count === 1 ? 'Apagar este arquivo?' : `Apagar estes ${count} arquivos?`;
    return `${what} Ele some para todos da conversa. A mensagem continua lá, mas o arquivo não abre mais. Isso não pode ser desfeito.`;
}
exports.STORAGE_KIND_LABEL = {
    IMAGE: 'Foto',
    VIDEO: 'Vídeo',
    AUDIO: 'Áudio',
    FILE: 'Arquivo',
};
/**
 * Ativa este aparelho. O primeiro da conta entra direto; os demais ficam
 * aguardando a aprovação de um aparelho já ativo e mostram o código ao usuário.
 * Repetir o pedido é seguro: o servidor devolve o mesmo código até expirar.
 */
async function enrollDevice(enroll, options) {
    const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    for (;;) {
        if (options.signal?.aborted)
            throw new Error('Ativação cancelada.');
        const result = await enroll().catch((error) => {
            const e = error;
            const status = e.response?.status ?? e.status;
            // Limite de requisições: é só esperar mais um pouco, o pedido continua valendo.
            if (status === 429)
                return null;
            if (status === 423)
                throw new ChatDeviceDisconnectedError();
            throw error;
        });
        if (!result) {
            await sleep(options.intervalMs ?? 4000);
            continue;
        }
        if (result.status === 'ready') {
            const { status: _status, ...session } = result;
            return session;
        }
        options.onPending({
            ...(result.id ? { id: result.id } : {}),
            code: result.code,
            expiresAt: result.expiresAt,
        });
        await sleep(options.intervalMs ?? 4000);
    }
}
/** Executa o trabalho em paralelo, no máximo `limit` por vez. */
async function runLimited(items, limit, work) {
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length)
            await work(items[next++]);
    });
    await Promise.all(workers);
}
function emptyChatState() {
    return {
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
    };
}
/**
 * Estado para desenhar a conversa antes mesmo de o cliente existir: só as
 * últimas mensagens abertas (se houver), sem poder escrever ainda.
 */
function chatSeedState(conversationId) {
    const seed = exports.chatTranscripts.get(conversationId);
    return seed?.length ? { ...emptyChatState(), messages: seed } : null;
}
/** Tamanho da página do histórico no servidor (`limit` de `GET /:id/chat/messages`). */
const HISTORY_PAGE_SIZE = 30;
class ChatClient {
    conversationId;
    session;
    crypto;
    http;
    storage;
    newId;
    active = false;
    pins = {};
    notices = [];
    trusted = new Set();
    queue = Promise.resolve();
    listeners = new Set();
    pending = [];
    cursor;
    events = new Map();
    messages = new Map();
    /** Mensagens já abertas (só memória): evita decifrar tudo de novo a cada ciclo. */
    decoded = new Map();
    timer;
    refreshAt = 0;
    receipts = [];
    acknowledged = [];
    visible = new Set();
    received = new Map();
    snapshot = emptyChatState();
    constructor(conversationId, session, crypto, http, storage, newId) {
        this.conversationId = conversationId;
        this.session = session;
        this.crypto = crypto;
        this.http = http;
        this.storage = storage;
        this.newId = newId;
        // Volta a uma conversa recente: já nasce com as últimas mensagens abertas.
        const seed = exports.chatTranscripts.get(conversationId);
        if (seed?.length) {
            for (const message of seed)
                this.messages.set(message.id, message);
            this.snapshot = { ...this.snapshot, messages: seed };
        }
    }
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.snapshot);
        return () => {
            this.listeners.delete(listener);
        };
    }
    getState() {
        return this.snapshot;
    }
    update(value) {
        if (!this.active)
            return;
        this.snapshot = { ...this.snapshot, ...value };
        for (const listener of this.listeners)
            listener(this.snapshot);
    }
    serial(work) {
        const task = this.queue.then(work);
        this.queue = task.catch(() => { });
        return task;
    }
    transport(pending = this.pending) {
        return {
            cursor: this.cursor,
            pending,
            receipts: this.receipts,
            acknowledged: this.acknowledged,
            pins: this.pins,
            notices: this.notices,
        };
    }
    roomPeers(room) {
        if (!room)
            return [];
        return room.peers ?? (room.peer ? [room.peer] : []);
    }
    devicesOf(peer) {
        return peer.devices ?? (peer.deviceId ? [peer.deviceId] : []);
    }
    hasAnyPeerDevice(room) {
        return this.roomPeers(room).some((peer) => this.devicesOf(peer).length > 0);
    }
    hasTrustedPeer(room) {
        if (!room)
            return false;
        const peers = this.roomPeers(room);
        const hasBlockingKeyChange = this.notices.some((n) => n.who === 'peer' && n.kind === 'key-changed');
        if (hasBlockingKeyChange)
            return false;
        return peers.some((peer) => this.devicesOf(peer).some((id) => this.trusted.has(`${peer.matrixUserId}|${id}`)));
    }
    notify(kind, who, deviceId, fingerprint, userId) {
        const id = `${kind}:${who}:${userId ? `${userId}:` : ''}${deviceId}:${fingerprint.slice(0, 24)}`;
        if (this.notices.some((notice) => notice.id === id))
            return;
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
        ].slice(-50);
    }
    /**
     * Confiança no primeiro contato. O primeiro conjunto de aparelhos que o Votz
     * apresenta para cada pessoa fica fixado; aparelho novo é aceito com aviso;
     * chave diferente num aparelho já conhecido NÃO é aceita até a pessoa decidir.
     */
    async reconcileTrust(room) {
        const peers = this.roomPeers(room);
        const groups = [
            ...peers.map((peer) => [
                peer.matrixUserId,
                this.devicesOf(peer),
                'peer',
            ]),
            [
                this.session.matrixUserId,
                (room.selfDevices ?? []).filter((id) => id !== this.session.deviceId),
                'self',
            ],
        ];
        const trusted = new Set();
        const noticesBefore = this.snapshot.notices.length;
        let changed = false;
        for (const [userId, devices, who] of groups) {
            const pins = (this.pins[userId] ??= {});
            const known = new Map();
            for (const deviceId of devices) {
                try {
                    const keys = await this.crypto.identity(userId, deviceId);
                    known.set(deviceId, `${keys.curve25519}:${keys.ed25519}`);
                }
                catch {
                    /* Chaves ainda não baixadas: tente no próximo ciclo. */
                }
            }
            const first = Object.keys(pins).length === 0;
            // No primeiro contato fixamos os aparelhos cujas chaves já são conhecidas.
            // Um aparelho que ainda não publicou chaves não trava o contato inteiro;
            // se aparecer depois, é anunciado como aparelho novo (o que é verdade).
            if (first && known.size === 0) {
                this.crypto.trust(userId, []);
                continue;
            }
            const keep = [];
            for (const [deviceId, fingerprint] of known) {
                const pinned = pins[deviceId];
                if (pinned === undefined) {
                    pins[deviceId] = fingerprint;
                    changed = true;
                    if (!first)
                        this.notify('device-added', who, deviceId, fingerprint, userId);
                }
                else if (pinned !== fingerprint) {
                    this.notify('key-changed', who, deviceId, fingerprint, userId);
                    continue;
                }
                trusted.add(`${userId}|${deviceId}`);
                keep.push(deviceId);
            }
            for (const id of Object.keys(pins))
                if (!devices.includes(id)) {
                    delete pins[id];
                    changed = true;
                }
            this.crypto.trust(userId, keep);
        }
        this.trusted = trusted;
        const peerTrusted = this.hasTrustedPeer(room);
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
        });
        if (changed || this.notices.length !== noticesBefore)
            await this.save();
    }
    /** O usuário decide sobre um aviso: aceitar a chave nova ou apenas dispensar. */
    async acknowledgeNotice(id) {
        return this.serial(async () => {
            const notice = this.notices.find((row) => row.id === id);
            if (!notice)
                return;
            const room = this.snapshot.room;
            const userId = notice.who === 'peer'
                ? (notice.userId ?? room?.peer?.matrixUserId)
                : this.session.matrixUserId;
            if (notice.kind === 'key-changed' && userId) {
                ;
                (this.pins[userId] ??= {})[notice.deviceId] = notice.fingerprint;
                // Chaves de sala já distribuídas excluíram esse aparelho enquanto ele
                // não era confiável: a próxima mensagem usa uma sessão nova para ele.
                if (room)
                    await this.crypto.rotate?.(room.roomId);
            }
            this.notices = this.notices.filter((row) => row.id !== id);
            if (room)
                await this.reconcileTrust(room);
            await this.save();
            await this.refreshMessages();
        });
    }
    async deviceList() {
        return chatDevicesApi(this.http).list();
    }
    async decideDeviceLink(linkId, approve) {
        await chatDevicesApi(this.http).decide(linkId, approve);
        await this.refreshDeviceLinks();
    }
    async revokeDevice(deviceId) {
        await chatDevicesApi(this.http).revoke(deviceId);
        await this.refreshDeviceLinks();
    }
    async refreshDeviceLinks() {
        try {
            const { links } = await this.deviceList();
            this.update({ deviceLinks: links });
        }
        catch {
            /* Informativo: não derruba a conversa. */
        }
    }
    save() {
        return this.storage.save(this.transport());
    }
    render() {
        const messages = [...this.messages.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
        // Prévia da lista: só a última mensagem, e só se ela pôde ser aberta e já
        // tem identificador do servidor. Se a última não abriu, não mostra uma antiga.
        const last = messages[messages.length - 1];
        if (this.active &&
            last &&
            (last.text !== null || last.attachment) &&
            !last.id.startsWith('pending:')) {
            const previewText = last.attachment
                ? `${mediaKindLabel(last.attachment.kind)}${last.text ? `: ${last.text}` : ''}`
                : last.text || '';
            exports.chatPreviews.set(this.conversationId, {
                eventId: last.id,
                text: previewText.replace(/\s+/g, ' ').trim().slice(0, 140),
            });
        }
        if (this.active)
            exports.chatTranscripts.set(this.conversationId, messages);
        this.update({ messages });
    }
    seenAt = 0;
    seenTimer;
    /** Avisa o servidor que a pessoa abriu a conversa (zera as não lidas). Com intervalo mínimo. */
    markSeen() {
        if (this.seenTimer)
            return;
        const wait = Math.max(0, 2000 - (Date.now() - this.seenAt));
        this.seenTimer = setTimeout(() => {
            this.seenTimer = undefined;
            if (!this.active)
                return;
            this.seenAt = Date.now();
            void this.http(`/${this.conversationId}/chat/seen`, 'POST', {}).catch(() => {
                /* Informativo: a próxima mensagem visível tenta de novo. */
            });
        }, wait);
    }
    async start() {
        this.active = true;
        try {
            const stored = await this.storage.load();
            if (!this.active)
                return;
            this.pending = stored.pending;
            this.cursor = stored.cursor;
            this.receipts = stored.receipts || [];
            this.acknowledged = stored.acknowledged || [];
            this.pins = stored.pins || {};
            this.notices = stored.notices || [];
            this.update({ notices: this.notices });
            await this.serial(async () => {
                if (!this.active)
                    return;
                // Em paralelo: o histórico (se a sala ainda não existe o servidor devolve
                // vazio e a leitura é refeita abaixo), a preferência de leitura e a sala.
                const early = this.http(`/${this.conversationId}/chat/messages`).catch(() => null);
                const [privacy] = await Promise.all([
                    this.http('/chat/privacy'),
                    this.refresh(false),
                ]);
                this.update({
                    readReceiptsEnabled: privacy.readReceiptsEnabled === true,
                });
                void this.refreshDeviceLinks(); // informativo: não segura a abertura
                if (!this.active)
                    return;
                await this.crypto.pump(this.http);
                await this.readHistory(undefined, await early);
                // Restore only ciphertext; recover the local preview from the encrypted SDK store.
                for (const item of this.pending.filter((item) => item.conversationId === this.conversationId)) {
                    this.events.set(`pending:${item.txnId}`, {
                        event_id: `pending:${item.txnId}`,
                        origin_server_ts: item.createdAt,
                        sender: this.session.matrixUserId,
                        type: 'm.room.encrypted',
                        content: item.content,
                        unsigned: { transaction_id: item.txnId },
                    });
                }
                await this.refreshMessages();
            });
            this.update({ ready: true, connected: true, error: null });
            void this.poll();
        }
        catch (error) {
            this.update({ error: chatError(error) });
            if (this.active)
                this.timer = setTimeout(() => {
                    if (this.active)
                        void this.start();
                }, 3000);
        }
    }
    stop() {
        this.active = false;
        if (this.timer)
            clearTimeout(this.timer);
        if (this.seenTimer)
            clearTimeout(this.seenTimer);
        this.seenTimer = undefined;
        this.listeners.clear();
        this.events.clear();
        this.messages.clear();
        this.decoded.clear();
        this.visible.clear();
        this.received.clear();
        this.receiptSummaries.clear();
        this.trusted.clear();
        this.lastPeerUsers = null;
        this.snapshot = {
            ...this.snapshot,
            ready: false,
            connected: false,
            messages: [],
            room: null,
            peerTrusted: false,
            peerStatus: 'none',
            deviceLinks: [],
        };
        return this.queue.then(() => { this.events.clear(); this.messages.clear(); });
    }
    lastPeerUsers = null;
    receiptSummaries = new Map();
    async refresh(links = true) {
        const room = await this.http(`/${this.conversationId}/chat`);
        if (!this.active)
            return;
        const peers = this.roomPeers(room);
        const currentPeerUsers = new Set(peers.map((peer) => peer.matrixUserId));
        // Rotação de chave de grupo: se alguém saiu ou foi removido desde a última
        // leitura, descarta a confiança dele e gira a sessão Megolm da sala.
        if (this.lastPeerUsers) {
            let removed = false;
            for (const previous of this.lastPeerUsers) {
                if (!currentPeerUsers.has(previous)) {
                    this.crypto.trust(previous, []);
                    removed = true;
                }
            }
            if (removed)
                await this.crypto.rotate?.(room.roomId);
        }
        this.lastPeerUsers = currentPeerUsers;
        this.update({ room });
        for (const peer of peers)
            await this.crypto.track(peer.matrixUserId, room.roomId);
        await this.crypto.track(this.session.matrixUserId, room.roomId);
        await this.crypto.pump(this.http);
        await this.reconcileTrust(room);
        if (links)
            await this.refreshDeviceLinks();
        this.refreshAt = Date.now();
    }
    async poll() {
        if (!this.active)
            return;
        try {
            const sync = await this.http(`/chat/sync${this.cursor ? `?since=${encodeURIComponent(this.cursor)}` : ''}`);
            if (!this.active)
                return;
            await this.serial(async () => {
                if (!this.active)
                    return;
                if (Date.now() - this.refreshAt > 15000 ||
                    !this.hasAnyPeerDevice(this.snapshot.room))
                    await this.refresh();
                await this.crypto.receive(sync);
                await this.crypto.pump(this.http);
                // O servidor avisou que aparelhos de alguém mudaram: relê a lista já
                // no próximo ciclo (o servidor só informa usuários autorizados).
                if (sync.device_lists?.changed?.length ||
                    sync.device_lists?.left?.length)
                    this.refreshAt = 0;
                const room = this.snapshot.room;
                const timeline = sync.rooms?.join?.[room.roomId]?.timeline;
                for (const event of timeline?.events || [])
                    if (typeof event.event_id === 'string')
                        this.events.set(event.event_id, event);
                await this.refreshMessages();
                await this.flush();
                await this.syncReceipts();
                if (typeof sync.next_batch === 'string')
                    this.cursor = sync.next_batch;
                await this.save();
                this.update({ connected: true, error: null });
            });
        }
        catch (error) {
            const e = error;
            // 401 que sobreviveu à renovação da sessão: o aparelho foi desconectado.
            this.update({
                connected: false,
                error: chatError(error),
                ...((e.response?.status ?? e.status) === 401 ? { reactivate: true } : {}),
            });
        }
        if (this.active)
            this.timer = setTimeout(() => {
                void this.poll();
            }, this.snapshot.connected ? 100 : 3000);
    }
    /** Confere o aparelho remetente e abre uma mensagem cifrada. */
    async decodeEvent(room, job) {
        const keys = await this.crypto.identity(job.event.sender, job.deviceId);
        if (job.event.content.sender_key !== keys.curve25519)
            throw new Error('Sender device mismatch');
        // Local queue identifiers are UI identifiers, not Matrix event IDs.
        // The SDK validates the latter even for a not-yet-sent envelope.
        const decoded = await this.crypto.decrypt(room.roomId, job.id.startsWith('pending:')
            ? { ...job.event, event_id: `$votz_pending_${job.txn}` }
            : job.event);
        if (typeof decoded === 'string')
            return { text: decoded, card: extractVotzCard(decoded) };
        return {
            text: decoded.text,
            attachment: decoded.attachment,
            replyTo: decoded.replyTo,
            forwarded: decoded.forwarded,
            card: decoded.card,
            reaction: decoded.reaction,
        };
    }
    async refreshMessages() {
        const room = this.snapshot.room;
        if (!room)
            return;
        const peers = this.roomPeers(room);
        const peerByMatrix = new Map(peers.map((peer) => [peer.matrixUserId, peer]));
        const verification = room.kind !== 'GROUP' && room.peer
            ? await this.crypto.verification(room.peer)
            : { state: 'none' };
        this.update({ verification });
        const reactionEvents = [];
        const jobs = [];
        for (const [id, event] of this.events) {
            if (event.type !== 'm.room.encrypted' ||
                event.content?.algorithm !== 'm.megolm.v1.aes-sha2')
                continue;
            const own = event.sender === this.session.matrixUserId;
            const senderPeer = own ? undefined : peerByMatrix.get(event.sender);
            if (!own && !senderPeer)
                continue;
            // O aparelho remetente vem do envelope; a chave do remetente é conferida
            // abaixo contra a identidade que o Votz publicou para esse aparelho.
            const claimed = typeof event.content?.device_id === 'string'
                ? event.content.device_id
                : undefined;
            const deviceId = claimed ?? (own ? this.session.deviceId : senderPeer?.deviceId ?? null);
            const txn = event.unsigned?.transaction_id;
            if (!id.startsWith('pending:') && typeof txn === 'string') {
                this.messages.delete(`pending:${txn}`);
                this.events.delete(`pending:${txn}`);
                this.pending = this.pending.filter((item) => item.txnId !== txn);
            }
            // Aparelho que não está mais na lista ativa (desconectado): a mensagem
            // não é aberta, e o texto explica isso em vez de falar de "segurança alterada".
            const selfList = room.selfDevices;
            const listed = own
                ? !selfList ||
                    deviceId === this.session.deviceId ||
                    (!!deviceId && selfList.includes(deviceId))
                : !!deviceId &&
                    !!senderPeer &&
                    this.devicesOf(senderPeer).includes(deviceId);
            const trusted = (own && deviceId === this.session.deviceId) ||
                (!!deviceId && this.trusted.has(`${event.sender}|${deviceId}`));
            jobs.push({ id, event, own, senderPeer, deviceId, txn, listed, trusted });
        }
        // Fase 2: abre em paralelo (até 6 por vez) só o que ainda não foi aberto.
        const opened = new Map();
        await runLimited(jobs.filter((job) => job.trusted && job.deviceId && !this.decoded.has(job.id)), 6, async (job) => {
            try {
                const value = await this.decodeEvent(room, job);
                opened.set(job.id, value);
                // Mensagens de verdade ficam no cache; as locais ainda sem id do servidor, não.
                if (!job.id.startsWith('pending:'))
                    this.decoded.set(job.id, value);
            }
            catch {
                /* Never render unauthenticated or malformed plaintext. */
            }
        });
        if (!this.active)
            return;
        // Fase 3: monta as mensagens, em ordem.
        for (const job of jobs) {
            const { id, event, own, senderPeer, deviceId, txn, listed, trusted } = job;
            // A mensagem local já foi confirmada pelo servidor nesta mesma passada.
            if (id.startsWith('pending:') && !this.events.has(id))
                continue;
            let text = null;
            let attachment;
            let replyTo;
            let forwarded;
            let card;
            let reaction;
            let status = !listed
                ? 'disconnected'
                : trusted
                    ? 'unavailable'
                    : 'unverified';
            const decoded = trusted && deviceId ? (this.decoded.get(id) ?? opened.get(id)) : undefined;
            if (decoded) {
                text = decoded.text;
                attachment = decoded.attachment;
                replyTo = decoded.replyTo;
                forwarded = decoded.forwarded;
                card = decoded.card;
                reaction = decoded.reaction;
                status = id.startsWith('pending:')
                    ? this.pending.find((item) => item.txnId === txn)?.failed
                        ? 'failed'
                        : 'pending'
                    : this.received.get(id) || 'sent';
            }
            if (!this.active)
                return;
            if (reaction) {
                this.messages.delete(id);
                reactionEvents.push({
                    ts: Number.isFinite(event.origin_server_ts)
                        ? event.origin_server_ts
                        : 0,
                    id,
                    sender: event.sender,
                    reaction,
                });
                continue;
            }
            const receiptSummary = own ? this.receiptSummaries.get(id) : undefined;
            this.messages.set(id, {
                id,
                sender: own ? 'self' : 'peer',
                ...(!own && room.kind === 'GROUP' && senderPeer?.name
                    ? { senderName: senderPeer.name }
                    : {}),
                text,
                ...(attachment ? { attachment } : {}),
                ...(replyTo ? { replyTo } : {}),
                ...(forwarded ? { forwarded } : {}),
                ...(card ? { card } : {}),
                createdAt: Number.isFinite(event.origin_server_ts)
                    ? event.origin_server_ts
                    : 0,
                status,
                ...(receiptSummary ? { receiptSummary } : {}),
                ...(typeof txn === 'string' ? { txnId: txn } : {}),
            });
            if (!own &&
                (text !== null || attachment) &&
                !id.startsWith('pending:'))
                this.queueReceipt(id, this.snapshot.readReceiptsEnabled && this.visible.has(id));
        }
        // Agrega reações cifradas em ordem cronológica por (mensagem, emoji, remetente).
        reactionEvents.sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
        const byTarget = new Map();
        for (const item of reactionEvents) {
            let emojis = byTarget.get(item.reaction.targetEventId);
            if (!emojis) {
                emojis = new Map();
                byTarget.set(item.reaction.targetEventId, emojis);
            }
            let senders = emojis.get(item.reaction.emoji);
            if (!senders) {
                senders = new Set();
                emojis.set(item.reaction.emoji, senders);
            }
            if (item.reaction.remove)
                senders.delete(item.sender);
            else
                senders.add(item.sender);
        }
        for (const [id, message] of this.messages) {
            const emojis = byTarget.get(id);
            if (!emojis) {
                delete message.reactions;
                continue;
            }
            const list = [];
            for (const [emoji, senders] of emojis) {
                if (!senders.size)
                    continue;
                list.push({
                    emoji,
                    count: senders.size,
                    mine: senders.has(this.session.matrixUserId),
                });
            }
            if (list.length)
                message.reactions = list;
            else
                delete message.reactions;
        }
        this.render();
    }
    async verification(action) {
        return this.serial(async () => {
            if (this.snapshot.room?.kind === 'GROUP' ||
                !this.snapshot.room?.peer?.deviceId ||
                !this.snapshot.room.canSend)
                throw new Error('Peer not ready');
            await this.crypto.verify(this.snapshot.room.peer, action, this.http);
            await this.crypto.pump(this.http);
            await this.refreshMessages();
        });
    }
    async send(text, options = {}) {
        if (!text.trim() || text.length > 4000)
            throw new Error('A mensagem deve ter entre 1 e 4.000 caracteres.');
        if (this.pending.length >= 100)
            throw new Error('Aguarde o envio das mensagens pendentes antes de continuar.');
        const txnId = this.newId();
        const createdAt = Date.now();
        const localId = `pending:${txnId}`;
        const card = options.card ?? extractVotzCard(text);
        // Aparece na hora, antes de qualquer rede ou criptografia: o relógio da
        // bolha cobre o resto. Se o envio for recusado, a bolha some e o texto volta.
        this.messages.set(localId, {
            id: localId,
            txnId,
            text,
            ...(options.replyTo ? { replyTo: options.replyTo } : {}),
            ...(options.forwarded ? { forwarded: true } : {}),
            ...(card ? { card } : {}),
            sender: 'self',
            createdAt,
            status: 'pending',
        });
        this.render();
        try {
            return await this.sendNow(text, options, txnId, createdAt, card);
        }
        catch (error) {
            if (!this.pending.some((item) => item.txnId === txnId)) {
                this.messages.delete(localId);
                this.render();
            }
            throw error;
        }
    }
    sendNow(text, options, txnId, createdAt, card) {
        return this.serial(async () => {
            // A lista de aparelhos é relida a cada envio, sem cache: um aparelho
            // aprovado há instantes só recebe a chave da sala se entrar na
            // distribuição desta mensagem, e uma chave descartada não é reenviada.
            await this.refresh(false);
            const room = this.snapshot.room;
            if (this.pending.length >= 100)
                throw new Error('Aguarde o envio das mensagens pendentes antes de continuar.');
            if (!room?.canSend)
                throw new Error(room?.kind === 'GROUP'
                    ? 'Aguarde outra pessoa entrar no grupo para enviar mensagens.'
                    : 'Esta interação está bloqueada.');
            if (!this.hasAnyPeerDevice(room))
                throw new Error(room.kind === 'GROUP'
                    ? 'Ninguém do grupo abriu as conversas no app ainda.'
                    : 'A outra pessoa ainda não abriu as conversas no app.');
            if (!this.hasTrustedPeer(room))
                throw new Error('A segurança desta conversa mudou. Confira o aviso antes de enviar.');
            const peers = this.roomPeers(room);
            // Cifra para os aparelhos de todos os participantes ativos e para os outros aparelhos desta conta.
            await this.crypto.share(room.roomId, [
                ...peers.map((peer) => peer.matrixUserId),
                this.session.matrixUserId,
            ]);
            await this.crypto.pump(this.http);
            const payload = options.replyTo || options.forwarded || card
                ? {
                    msgtype: 'm.text',
                    body: text,
                    ...(options.replyTo ? { 'br.votz.reply': options.replyTo } : {}),
                    ...(options.forwarded ? { 'br.votz.forwarded': true } : {}),
                    ...(card ? { 'br.votz.card': card } : {}),
                }
                : text;
            const content = await this.crypto.encrypt(room.roomId, payload);
            const item = {
                txnId,
                conversationId: this.conversationId,
                roomId: room.roomId,
                revision: room.revision,
                content,
                createdAt,
            };
            const next = [...this.pending, item];
            await this.storage.save(this.transport(next));
            this.pending = next;
            this.events.set(`pending:${item.txnId}`, {
                event_id: `pending:${item.txnId}`,
                origin_server_ts: item.createdAt,
                sender: this.session.matrixUserId,
                type: 'm.room.encrypted',
                content,
                unsigned: { transaction_id: item.txnId },
            });
            this.messages.set(`pending:${item.txnId}`, {
                id: `pending:${item.txnId}`,
                txnId: item.txnId,
                text,
                ...(options.replyTo ? { replyTo: options.replyTo } : {}),
                ...(options.forwarded ? { forwarded: true } : {}),
                ...(card ? { card } : {}),
                sender: 'self',
                createdAt: item.createdAt,
                status: 'pending',
            });
            this.render();
            await this.flush();
        });
    }
    /** Alterna uma reação de emoji cifrada de ponta a ponta em uma mensagem. */
    async react(targetEventId, emoji) {
        const clean = emoji.trim();
        if (!targetEventId || targetEventId.startsWith('pending:') || !clean)
            return;
        return this.serial(async () => {
            await this.refresh(false);
            const room = this.snapshot.room;
            if (!room?.canSend || !this.hasAnyPeerDevice(room) || !this.hasTrustedPeer(room))
                return;
            const target = this.messages.get(targetEventId);
            const already = !!target?.reactions?.some((r) => r.emoji === clean && r.mine);
            const peers = this.roomPeers(room);
            await this.crypto.share(room.roomId, [
                ...peers.map((peer) => peer.matrixUserId),
                this.session.matrixUserId,
            ]);
            await this.crypto.pump(this.http);
            const content = await this.crypto.encrypt(room.roomId, {
                msgtype: 'br.votz.reaction',
                body: clean,
                targetEventId,
                emoji: clean,
                remove: already,
            });
            const txnId = this.newId();
            const result = await this.http(`/${this.conversationId}/chat/messages/${encodeURIComponent(txnId)}`, 'PUT', { revision: room.revision, content });
            const eventId = typeof result.event_id === 'string' ? result.event_id : `local:${txnId}`;
            this.events.set(eventId, {
                event_id: eventId,
                origin_server_ts: Date.now(),
                sender: this.session.matrixUserId,
                type: 'm.room.encrypted',
                content,
            });
            await this.refreshMessages();
        });
    }
    /**
     * Envia imagem, vídeo, áudio ou arquivo cifrado no cliente (padrão Matrix v2)
     * antes do upload. O servidor só armazena bytes opacos, dentro da cota de quem envia.
     */
    async sendMedia(input) {
        if (!input.bytes.length)
            throw new Error('O arquivo selecionado está vazio.');
        const limit = exports.CHAT_MEDIA_LIMITS[input.kind];
        if (input.bytes.length > limit)
            throw new Error(`Este arquivo ultrapassa o limite de ${formatFileSize(limit)}.`);
        if (!this.crypto.encryptAttachment)
            throw new Error('O envio de anexos ainda não está disponível neste aparelho.');
        if (this.pending.length >= 100)
            throw new Error('Aguarde o envio das mensagens pendentes antes de continuar.');
        return this.serial(async () => {
            await this.refresh(false);
            const room = this.snapshot.room;
            if (!room?.canSend)
                throw new Error(room?.kind === 'GROUP'
                    ? 'Aguarde outra pessoa entrar no grupo para enviar mensagens.'
                    : 'Esta interação está bloqueada.');
            if (!this.hasAnyPeerDevice(room))
                throw new Error(room.kind === 'GROUP'
                    ? 'Ninguém do grupo abriu as conversas no app ainda.'
                    : 'A outra pessoa ainda não abriu as conversas no app.');
            if (!this.hasTrustedPeer(room))
                throw new Error('A segurança desta conversa mudou. Confira o aviso antes de enviar.');
            const sealed = await this.crypto.encryptAttachment(input.bytes);
            const uploaded = await input.upload(sealed.ciphertext, {
                kind: input.kind,
            });
            const attachment = {
                kind: input.kind,
                id: uploaded.id,
                name: input.name.trim().slice(0, 200) || mediaKindLabel(input.kind),
                mimeType: input.mimeType || 'application/octet-stream',
                size: input.bytes.length,
                secret: sealed.secret,
                ...(input.width ? { width: input.width } : {}),
                ...(input.height ? { height: input.height } : {}),
                ...(input.durationMs ? { durationMs: input.durationMs } : {}),
            };
            const peers = this.roomPeers(room);
            await this.crypto.share(room.roomId, [
                ...peers.map((peer) => peer.matrixUserId),
                this.session.matrixUserId,
            ]);
            await this.crypto.pump(this.http);
            const payload = buildMediaEventContent(attachment, input.caption);
            const content = await this.crypto.encrypt(room.roomId, payload);
            const item = {
                txnId: this.newId(),
                conversationId: this.conversationId,
                roomId: room.roomId,
                revision: room.revision,
                content,
                createdAt: Date.now(),
            };
            const next = [...this.pending, item];
            await this.storage.save(this.transport(next));
            this.pending = next;
            this.events.set(`pending:${item.txnId}`, {
                event_id: `pending:${item.txnId}`,
                origin_server_ts: item.createdAt,
                sender: this.session.matrixUserId,
                type: 'm.room.encrypted',
                content,
                unsigned: { transaction_id: item.txnId },
            });
            this.messages.set(`pending:${item.txnId}`, {
                id: `pending:${item.txnId}`,
                txnId: item.txnId,
                text: (input.caption || '').trim(),
                attachment,
                sender: 'self',
                createdAt: item.createdAt,
                status: 'pending',
            });
            this.render();
            await this.flush();
        });
    }
    /** Decifra bytes baixados de um anexo usando o segredo padrão Matrix v2. */
    async decryptMedia(ciphertext, secret) {
        if (!this.crypto.decryptAttachment)
            throw new Error('Não foi possível abrir o anexo neste aparelho.');
        return this.crypto.decryptAttachment(ciphertext, secret);
    }
    async flush() {
        for (const item of [...this.pending].filter((row) => !row.failed)) {
            if (!this.active)
                return;
            try {
                const result = await this.http(`/${item.conversationId}/chat/messages/${encodeURIComponent(item.txnId)}`, 'PUT', { revision: item.revision, content: item.content });
                const previous = this.messages.get(`pending:${item.txnId}`);
                this.pending = this.pending.filter((row) => row.txnId !== item.txnId);
                this.events.delete(`pending:${item.txnId}`);
                this.messages.delete(`pending:${item.txnId}`);
                if (previous && typeof result.event_id === 'string')
                    this.messages.set(result.event_id, {
                        ...previous,
                        id: result.event_id,
                        status: 'sent',
                    });
                await this.save();
            }
            catch (error) {
                const status = error
                    ?.response?.status || error?.status;
                const message = this.messages.get(`pending:${item.txnId}`);
                if (status && status >= 400 && status < 500 && status !== 429) {
                    item.failed = true;
                    if (message)
                        message.status = 'failed';
                    await this.save();
                }
                this.update({ error: chatError(error), connected: false });
                this.render();
                return;
            }
        }
        this.render();
    }
    async readHistory(from, prefetched) {
        const history = prefetched ??
            (await this.http(`/${this.conversationId}/chat/messages${from ? `?from=${encodeURIComponent(from)}` : ''}`));
        for (const event of history.chunk || [])
            if (typeof event.event_id === 'string')
                this.events.set(event.event_id, event);
        this.update({
            // Só oferece "mensagens anteriores" quando a página veio cheia: o servidor devolve o
            // marcador da próxima página mesmo no começo da conversa.
            historyCursor: typeof history.end === 'string' && (history.chunk?.length ?? 0) >= HISTORY_PAGE_SIZE
                ? history.end
                : null,
        });
        await this.refreshMessages();
    }
    async older() {
        if (!this.snapshot.historyCursor || this.snapshot.loadingHistory)
            return;
        this.update({ loadingHistory: true });
        try {
            await this.serial(() => this.readHistory(this.snapshot.historyCursor));
        }
        finally {
            this.update({ loadingHistory: false });
        }
    }
    async retry(txnId) {
        return this.serial(async () => {
            const item = this.pending.find((row) => row.txnId === txnId && row.conversationId === this.conversationId);
            if (!item)
                return;
            await this.refresh();
            if (!this.snapshot.room?.canSend)
                throw new Error('Esta interação está bloqueada.');
            item.revision = this.snapshot.room.revision;
            item.failed = false;
            await this.save();
            await this.flush();
        });
    }
    queueReceipt(eventId, read) {
        const same = (row) => row.conversationId === this.conversationId && row.eventId === eventId;
        if (this.acknowledged.some((row) => same(row) && (row.read || !read)))
            return;
        const current = this.receipts.find(same);
        if (current)
            current.read ||= read;
        else if (this.receipts.length < 2048)
            this.receipts.push({ conversationId: this.conversationId, eventId, read });
    }
    visibleMessages(ids) {
        if (!this.active)
            return;
        this.visible = new Set(ids);
        // Mensagem recebida, aberta e visível: a pessoa viu a conversa.
        if (ids.some((id) => {
            const message = this.messages.get(id);
            return (message?.sender === 'peer' &&
                message.text !== null &&
                !id.startsWith('pending:'));
        }))
            this.markSeen();
        void this.serial(async () => {
            if (!this.active)
                return;
            for (const id of this.snapshot.readReceiptsEnabled ? this.visible : []) {
                const message = this.messages.get(id);
                if (message?.sender === 'peer' &&
                    message.text !== null &&
                    !id.startsWith('pending:'))
                    this.queueReceipt(id, true);
            }
            await this.save();
        }).catch((error) => this.update({ error: chatError(error) }));
    }
    async setReadReceipts(enabled) {
        return this.serial(async () => {
            const privacy = await this.http('/chat/privacy', 'PUT', {
                readReceiptsEnabled: enabled,
            });
            this.update({ readReceiptsEnabled: privacy.readReceiptsEnabled === true });
            if (!enabled)
                for (const receipt of this.receipts)
                    receipt.read = false;
            else
                for (const id of this.visible) {
                    const message = this.messages.get(id);
                    if (message?.sender === 'peer' && message.text !== null)
                        this.queueReceipt(id, true);
                }
            await this.save();
        });
    }
    async syncReceipts() {
        if (!this.active || !this.snapshot.room?.canSend)
            return;
        // Only authenticated, decrypted messages qualify as delivered. Persist the
        // opaque receipt queue before acknowledgement, just like the ciphertext outbox.
        await this.save();
        for (const read of [false, true]) {
            const batch = this.receipts
                .filter((row) => row.conversationId === this.conversationId && row.read === read)
                .slice(0, 20);
            if (!batch.length)
                continue;
            try {
                await this.http(`/${this.conversationId}/chat/receipts`, 'POST', {
                    eventIds: batch.map((row) => row.eventId),
                    read,
                });
            }
            catch (error) {
                const status = error
                    .response?.status || error.status;
                if (read && status === 403) {
                    const privacy = await this.http('/chat/privacy');
                    if (privacy.readReceiptsEnabled === false) {
                        this.update({ readReceiptsEnabled: false });
                        for (const row of this.receipts)
                            row.read = false;
                        await this.save();
                    }
                }
                throw error;
            }
            for (const row of batch) {
                this.receipts = this.receipts.filter((item) => item !== row);
                this.acknowledged = this.acknowledged.filter((item) => item.eventId !== row.eventId ||
                    item.conversationId !== row.conversationId);
                this.acknowledged.push(row);
            }
            this.acknowledged = this.acknowledged.slice(-2048);
            await this.save();
        }
        const own = [...this.messages.values()].filter((row) => row.sender === 'self' &&
            row.text !== null &&
            !['pending', 'failed', 'read'].includes(row.status));
        // Recent messages are checked first; visible older messages get priority.
        const eventIds = [
            ...own.filter((row) => this.visible.has(row.id)),
            ...own.reverse(),
        ]
            .map((row) => row.id)
            .filter((id, index, all) => all.indexOf(id) === index)
            .slice(0, 50);
        if (!eventIds.length)
            return;
        const result = await this.http(`/${this.conversationId}/chat/receipts/query`, 'POST', { eventIds });
        for (const receipt of result.receipts || []) {
            if (!eventIds.includes(receipt.eventId) || !receipt.deliveredAt)
                continue;
            const total = typeof receipt.totalRecipients === 'number'
                ? receipt.totalRecipients
                : 0;
            let status;
            let summary;
            if (total > 1) {
                const readCount = Number(receipt.readCount || 0);
                const deliveredCount = Number(receipt.deliveredCount || 0);
                if (readCount >= total) {
                    status = 'read';
                }
                else if (readCount > 0) {
                    status = 'delivered';
                    summary = `Lida por ${readCount} de ${total}`;
                }
                else if (deliveredCount >= total) {
                    status = 'delivered';
                }
                else {
                    status = 'delivered';
                    summary = `Entregue a ${deliveredCount} de ${total}`;
                }
            }
            else {
                status = receipt.readAt ? 'read' : 'delivered';
            }
            this.received.set(receipt.eventId, status);
            if (summary)
                this.receiptSummaries.set(receipt.eventId, summary);
            else
                this.receiptSummaries.delete(receipt.eventId);
            const message = this.messages.get(receipt.eventId);
            if (message) {
                message.status = status;
                message.receiptSummary = summary;
            }
        }
        this.render();
    }
}
exports.ChatClient = ChatClient;
//# sourceMappingURL=index.js.map