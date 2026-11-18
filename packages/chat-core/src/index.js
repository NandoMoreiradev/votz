"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatClient = void 0;
exports.messageStatusLabel = messageStatusLabel;
exports.chatError = chatError;
function messageStatusLabel(status) {
    return {
        pending: 'Aguardando envio',
        sent: 'Enviada',
        delivered: 'Entregue',
        read: 'Lida',
        failed: 'Não enviada',
        unverified: 'Identidade não verificada',
        unavailable: 'Chaves indisponíveis',
    }[status];
}
function chatError(error) {
    const e = error;
    const status = e?.response?.status || e?.status;
    if (status === 401)
        return 'Desbloqueie suas conversas ou entre novamente.';
    if (status === 403)
        return 'Esta ação não está disponível para esta conversa.';
    if (status === 404)
        return 'Esta conversa não está mais disponível.';
    if (status === 409)
        return (e?.response?.data?.message ||
            e?.message ||
            'Atualize a conversa antes de continuar.');
    return 'Não foi possível conectar ao mensageiro. Tente novamente.';
}
class ChatClient {
    conversationId;
    session;
    crypto;
    http;
    storage;
    newId;
    active = false;
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
        };
    }
    save() {
        return this.storage.save(this.transport());
    }
    render() {
        this.update({
            messages: [...this.messages.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
        });
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
        this.listeners.clear();
        this.events.clear();
        this.messages.clear();
        this.visible.clear();
        this.received.clear();
        this.snapshot = {
            ...this.snapshot,
            ready: false,
            connected: false,
            messages: [],
            room: null,
        };
        return this.queue.then(() => { this.events.clear(); this.messages.clear(); });
    }
    async refresh() {
        const room = await this.http(`/${this.conversationId}/chat`);
        if (!this.active)
            return;
        this.update({ room });
        await this.crypto.track(room.peer.matrixUserId, room.roomId);
        await this.crypto.pump(this.http);
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
            this.update({ connected: false, error: chatError(error) });
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
            const deviceId = own ? this.session.deviceId : room.peer.deviceId;
            const txn = event.unsigned?.transaction_id;
            if (!id.startsWith('pending:') && typeof txn === 'string') {
                this.messages.delete(`pending:${txn}`);
                this.events.delete(`pending:${txn}`);
                this.pending = this.pending.filter((item) => item.txnId !== txn);
            }
            const trusted = own ||
                (!!deviceId && (await this.crypto.verified(event.sender, deviceId)));
            let text = null;
            let status = trusted ? 'unavailable' : 'unverified';
            if (trusted && deviceId) {
                try {
                    const keys = await this.crypto.identity(event.sender, deviceId);
                    if (event.content.sender_key !== keys.curve25519 ||
                        (event.content.device_id && event.content.device_id !== deviceId))
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
            const room = this.snapshot.room;
            if (this.pending.length >= 100)
                throw new Error('Aguarde o envio das mensagens pendentes antes de continuar.');
            if (!room?.canSend ||
                !room.peer.deviceId ||
                !(await this.crypto.verified(room.peer.matrixUserId, room.peer.deviceId)))
                throw new Error('Verifique a identidade da outra pessoa antes de enviar.');
            await this.crypto.share(room.roomId, room.peer.matrixUserId);
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