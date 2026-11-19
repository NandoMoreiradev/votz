"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatClient = exports.ChatDeviceDisconnectedError = exports.chatPreviews = exports.RESET_WARNING = exports.ENROLL_WAITING = void 0;
exports.messageStatusLabel = messageStatusLabel;
exports.messagePlaceholder = messagePlaceholder;
exports.composerPlaceholder = composerPlaceholder;
exports.chatError = chatError;
exports.chatView = chatView;
exports.deviceRequestText = deviceRequestText;
exports.chatDevicesApi = chatDevicesApi;
exports.enrollDevice = enrollDevice;
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
            ? 'Escreva uma mensagem…'
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
/**
 * Tudo o que a pessoa lê na conversa, num só lugar: o web e o mobile
 * não repetem texto nem regra. Sem jargão: nada de "chave", "dispositivo"
 * ou "ativar".
 */
function chatView(state, peerName, verified = false) {
    const banner = verified
        ? 'Identidade confirmada. As mensagens são protegidas com criptografia de ponta a ponta.'
        : 'As mensagens são protegidas com criptografia de ponta a ponta.';
    if (!state)
        return {
            canWrite: false,
            placeholder: 'Preparando a conversa…',
            banner,
            preparing: true,
            waitingPeer: null,
            notices: [],
        };
    const notices = [];
    for (const notice of state.notices) {
        // Um aparelho novo da própria conta foi aprovado pela própria pessoa: sem aviso.
        if (notice.who === 'self')
            continue;
        notices.push(notice.kind === 'key-changed'
            ? {
                id: notice.id,
                text: `O código de segurança de ${peerName} mudou.`,
                detail: 'Pode ser só uma troca de celular. Até você continuar, as mensagens novas dele não aparecem.',
                action: 'Continuar',
                blocking: true,
            }
            : {
                id: notice.id,
                text: `${peerName} trocou de aparelho ou entrou em outro.`,
                action: 'Ok',
                blocking: false,
            });
    }
    return {
        canWrite: state.peerTrusted && !!state.room?.canSend,
        placeholder: composerPlaceholder(state),
        banner,
        preparing: !state.ready && !state.room,
        waitingPeer: state.ready && state.peerStatus === 'none'
            ? `${peerName} ainda não abriu as conversas no app. Quando abrir, vocês já podem conversar.`
            : null,
        notices,
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
/** Tela de quem espera a permissão de outro aparelho. */
exports.ENROLL_WAITING = {
    title: 'Permita no seu outro aparelho',
    text: 'Abra o Votz em outro aparelho seu e permita este acesso. Confira se o código é o mesmo:',
    note: 'O pedido vale por 10 minutos.',
    lost: 'Não tenho mais acesso aos outros aparelhos',
};
/** Aviso antes de redefinir quando não há mais nenhum aparelho antigo. */
exports.RESET_WARNING = {
    title: 'Começar do zero neste aparelho?',
    text: 'Seus outros aparelhos serão desconectados e as mensagens antigas não poderão ser lidas aqui. Para continuar, confirme sua senha do Votz.',
    action: 'Redefinir',
};
const previews = new Map();
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
        decide: (linkId, approve) => http(`/chat/device-links/${encodeURIComponent(linkId)}`, 'POST', {
            approve,
        }),
        revoke: (deviceId) => http(`/chat/devices/${encodeURIComponent(deviceId)}`, 'DELETE'),
    };
}
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
        options.onPending({ code: result.code, expiresAt: result.expiresAt });
        await sleep(options.intervalMs ?? 4000);
    }
}
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
    timer;
    refreshAt = 0;
    receipts = [];
    acknowledged = [];
    visible = new Set();
    received = new Map();
    snapshot = {
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
    constructor(conversationId, session, crypto, http, storage, newId) {
        this.conversationId = conversationId;
        this.session = session;
        this.crypto = crypto;
        this.http = http;
        this.storage = storage;
        this.newId = newId;
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
    peerDevices(room) {
        if (!room)
            return [];
        return room.peer.devices ?? (room.peer.deviceId ? [room.peer.deviceId] : []);
    }
    hasTrustedPeer(room) {
        return (!!room &&
            this.peerDevices(room).some((id) => this.trusted.has(`${room.peer.matrixUserId}|${id}`)));
    }
    notify(kind, who, deviceId, fingerprint) {
        const id = `${kind}:${who}:${deviceId}:${fingerprint.slice(0, 24)}`;
        if (this.notices.some((notice) => notice.id === id))
            return;
        this.notices = [
            ...this.notices,
            { id, kind, who, deviceId, fingerprint, at: Date.now() },
        ].slice(-50);
    }
    /**
     * Confiança no primeiro contato. O primeiro conjunto de aparelhos que o Votz
     * apresenta para uma pessoa fica fixado; aparelho novo é aceito com aviso;
     * chave diferente num aparelho já conhecido NÃO é aceita até a pessoa decidir.
     */
    async reconcileTrust(room) {
        const groups = [
            [room.peer.matrixUserId, this.peerDevices(room), 'peer'],
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
                        this.notify('device-added', who, deviceId, fingerprint);
                }
                else if (pinned !== fingerprint) {
                    this.notify('key-changed', who, deviceId, fingerprint);
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
            peerStatus: !this.peerDevices(room).length
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
                ? room?.peer.matrixUserId
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
            last.text !== null &&
            !last.id.startsWith('pending:'))
            exports.chatPreviews.set(this.conversationId, {
                eventId: last.id,
                text: last.text.replace(/\s+/g, ' ').trim().slice(0, 140),
            });
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
                const privacy = await this.http('/chat/privacy');
                this.update({
                    readReceiptsEnabled: privacy.readReceiptsEnabled === true,
                });
                await this.refresh();
                if (!this.active)
                    return;
                await this.crypto.pump(this.http);
                await this.readHistory();
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
        this.visible.clear();
        this.received.clear();
        this.trusted.clear();
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
    async refresh(links = true) {
        const room = await this.http(`/${this.conversationId}/chat`);
        if (!this.active)
            return;
        this.update({ room });
        await this.crypto.track(room.peer.matrixUserId, room.roomId);
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
                    !this.snapshot.room?.peer.deviceId)
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
    async refreshMessages() {
        const room = this.snapshot.room;
        if (!room)
            return;
        const verification = await this.crypto.verification(room.peer);
        this.update({ verification });
        for (const [id, event] of this.events) {
            if (event.type !== 'm.room.encrypted' ||
                event.content?.algorithm !== 'm.megolm.v1.aes-sha2')
                continue;
            const own = event.sender === this.session.matrixUserId;
            if (!own && event.sender !== room.peer.matrixUserId)
                continue;
            // O aparelho remetente vem do envelope; a chave do remetente é conferida
            // abaixo contra a identidade que o Votz publicou para esse aparelho.
            const claimed = typeof event.content?.device_id === 'string'
                ? event.content.device_id
                : undefined;
            const deviceId = claimed ?? (own ? this.session.deviceId : room.peer.deviceId);
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
                : !!deviceId && this.peerDevices(room).includes(deviceId);
            const trusted = (own && deviceId === this.session.deviceId) ||
                (!!deviceId && this.trusted.has(`${event.sender}|${deviceId}`));
            let text = null;
            let status = !listed
                ? 'disconnected'
                : trusted
                    ? 'unavailable'
                    : 'unverified';
            if (trusted && deviceId) {
                try {
                    const keys = await this.crypto.identity(event.sender, deviceId);
                    if (event.content.sender_key !== keys.curve25519)
                        throw new Error('Sender device mismatch');
                    // Local queue identifiers are UI identifiers, not Matrix event IDs.
                    // The SDK validates the latter even for a not-yet-sent envelope.
                    text = await this.crypto.decrypt(room.roomId, id.startsWith('pending:') ? { ...event, event_id: `$votz_pending_${txn}` } : event);
                    status = id.startsWith('pending:')
                        ? this.pending.find((item) => item.txnId === txn)?.failed
                            ? 'failed'
                            : 'pending'
                        : this.received.get(id) || 'sent';
                }
                catch {
                    /* Never render unauthenticated or malformed plaintext. */
                }
            }
            if (!this.active)
                return;
            this.messages.set(id, {
                id,
                sender: own ? 'self' : 'peer',
                text,
                createdAt: Number.isFinite(event.origin_server_ts)
                    ? event.origin_server_ts
                    : 0,
                status,
                ...(typeof txn === 'string' ? { txnId: txn } : {}),
            });
            if (!own && text !== null && !id.startsWith('pending:'))
                this.queueReceipt(id, this.snapshot.readReceiptsEnabled && this.visible.has(id));
        }
        this.render();
    }
    async verification(action) {
        return this.serial(async () => {
            if (!this.snapshot.room?.peer.deviceId || !this.snapshot.room.canSend)
                throw new Error('Peer not ready');
            await this.crypto.verify(this.snapshot.room.peer, action, this.http);
            await this.crypto.pump(this.http);
            await this.refreshMessages();
        });
    }
    async send(text) {
        if (!text.trim() || text.length > 4000)
            throw new Error('A mensagem deve ter entre 1 e 4.000 caracteres.');
        if (this.pending.length >= 100)
            throw new Error('Aguarde o envio das mensagens pendentes antes de continuar.');
        return this.serial(async () => {
            // A lista de aparelhos é relida a cada envio, sem cache: um aparelho
            // aprovado há instantes só recebe a chave da sala se entrar na
            // distribuição desta mensagem, e uma chave descartada não é reenviada.
            await this.refresh(false);
            const room = this.snapshot.room;
            if (this.pending.length >= 100)
                throw new Error('Aguarde o envio das mensagens pendentes antes de continuar.');
            if (!room?.canSend)
                throw new Error('Esta interação está bloqueada.');
            if (!this.peerDevices(room).length)
                throw new Error('A outra pessoa ainda não ativou as conversas protegidas.');
            if (!this.hasTrustedPeer(room))
                throw new Error('A segurança desta conversa mudou. Confira o aviso antes de enviar.');
            // Cifra para os aparelhos do contato e para os outros aparelhos desta conta.
            await this.crypto.share(room.roomId, [
                room.peer.matrixUserId,
                this.session.matrixUserId,
            ]);
            await this.crypto.pump(this.http);
            const content = await this.crypto.encrypt(room.roomId, text);
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
                text,
                sender: 'self',
                createdAt: item.createdAt,
                status: 'pending',
            });
            this.render();
            await this.flush();
        });
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
    async readHistory(from) {
        const history = await this.http(`/${this.conversationId}/chat/messages${from ? `?from=${encodeURIComponent(from)}` : ''}`);
        for (const event of history.chunk || [])
            if (typeof event.event_id === 'string')
                this.events.set(event.event_id, event);
        this.update({
            historyCursor: typeof history.end === 'string' && history.chunk?.length
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
            const status = receipt.readAt ? 'read' : 'delivered';
            this.received.set(receipt.eventId, status);
            const message = this.messages.get(receipt.eventId);
            if (message)
                message.status = status;
        }
        this.render();
    }
}
exports.ChatClient = ChatClient;
//# sourceMappingURL=index.js.map