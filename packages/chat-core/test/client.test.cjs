// Business/lifecycle tests only. Real cryptography is covered against Synapse separately.
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  ChatClient,
  enrollDevice,
  chatDevicesApi,
  composerPlaceholder,
  messagePlaceholder,
  chatPreviews,
  chatView,
  messageStatusLabel,
  deviceRequestText,
  ENROLL_WAITING,
  RESET_WARNING,
  ChatDeviceDisconnectedError,
} = require('../src/index.js')

const PEER_PRINT = 'peer-key:public-signing-key'
function fixture(options = {}) {
  const requests = []
  let persisted = { pending: [], ...(options.pins ? { pins: options.pins } : {}) }
  let deny = options.deny || 0
  let savesFail = false
  const trusted = {}
  const shared = []
  const keys = { ...(options.keys || {}) }
  const crypto = {
    track: async () => {},
    trust: (user, devices) => {
      trusted[user] = devices
    },
    pump: async () => {},
    receive: async () => {},
    verified: async () => false,
    identity: async (user, device) => {
      if (keys[`${user}|${device}`] === null) throw new Error('Unknown device')
      return {
        curve25519:
          keys[`${user}|${device}`] ||
          (user === '@self:test' ? 'self-key' : 'peer-key'),
        ed25519: 'public-signing-key',
      }
    },
    share: async (room, users) => {
      shared.push(users)
    },
    encrypt: async () => ({
      algorithm: 'm.megolm.v1.aes-sha2',
      ciphertext: 'opaque-sdk-test-fixture',
      sender_key: 'self-key',
      session_id: 'session',
    }),
    decrypt: async () => {
      if (options.decrypt) return options.decrypt()
      return 'plaintext from the SDK test double'
    },
    verification: async () => ({ state: 'none' }),
    verify: async () => {},
  }
  const room = {
    roomId: '!room:test',
    revision: 2,
    canSend: true,
    selfDevices: ['SELF'],
    peer: {
      userId: 'peer',
      matrixUserId: '@peer:test',
      deviceId: 'PEER',
      devices: ['PEER'],
    },
  }
  const http = async (path, method, body) => {
    requests.push({ path, method, body })
    if (path === '/chat/privacy')
      return {
        readReceiptsEnabled:
          method === 'PUT'
            ? body.readReceiptsEnabled
            : options.readReceipts === true,
      }
    if (path === '/conversation/chat') return room
    if (path === '/conversation/chat/messages')
      return { chunk: options.history || [] }
    if (path.startsWith('/chat/sync'))
      return options.syncStatus
        ? Promise.reject(Object.assign(new Error('Unauthorized'), { status: options.syncStatus }))
        : new Promise(() => {})
    if (path.endsWith('/chat/seen')) return { unreadCount: 0 }
    if (path === '/chat/devices' && !method)
      return { devices: [], links: options.links || [] }
    if (method === 'PUT') {
      if (deny) {
        const error = new Error('Transport failure')
        error.status = deny
        throw error
      }
      return { event_id: '$event' }
    }
    throw new Error(`Unexpected request ${path}`)
  }
  const storage = {
    load: async () => structuredClone(persisted),
    save: async (value) => {
      if (savesFail) throw new Error('Storage quota exceeded')
      persisted = structuredClone(value)
    },
  }
  const make = () =>
    new ChatClient(
      'conversation',
      { deviceId: 'SELF', matrixUserId: '@self:test', singleDevicePilot: false },
      crypto,
      http,
      storage,
      () => 'stable-transaction',
    )
  const f = {
    client: make(),
    crypto,
    room,
    storage,
    requests,
    trusted,
    shared,
    keys,
    persisted: () => persisted,
    restart: async () => {
      await f.client.stop()
      f.client = make()
      await f.client.start()
    },
    failSaves: (value) => {
      savesFail = value
    },
    deny: (value) => {
      deny = value
    },
  }
  return f
}
const changedKey = { '@peer:test': { PEER: 'old-key:public-signing-key' } }
const peerEvent = (id = '$peer', extra = {}) => ({
  event_id: id,
  sender: '@peer:test',
  type: 'm.room.encrypted',
  content: { algorithm: 'm.megolm.v1.aes-sha2', sender_key: 'peer-key', ...extra },
})

test('a failed durable write never schedules an unacknowledged send', async () => {
  const f = fixture()
  await f.client.start()
  f.failSaves(true)
  await assert.rejects(
    f.client.send('A draft that must remain unsent'),
    /Storage quota/,
  )
  assert.equal(
    f.requests.filter((request) => request.method === 'PUT').length,
    0,
  )
  assert.equal(f.client.getState().messages.length, 0)
  f.failSaves(false)
  await f.client.send('An explicitly retried draft')
  assert.equal(
    f.requests.filter((request) => request.method === 'PUT').length,
    1,
  )
  await f.client.stop()
})
test('permanent failures remain in the encrypted outbox and retry uses the original transaction', async () => {
  const f = fixture({ deny: 403 })
  await f.client.start()
  await f.client.send('Private fixture')
  assert.equal(f.persisted().pending[0].failed, true)
  assert.equal(JSON.stringify(f.persisted()).includes('Private fixture'), false)
  assert.equal(f.client.getState().messages[0].status, 'failed')
  f.deny(0)
  await f.client.retry('stable-transaction')
  const sends = f.requests.filter((request) => request.method === 'PUT')
  assert.equal(sends.length, 2)
  assert.equal(sends[0].path, sends[1].path)
  assert.deepEqual(sends[0].body.content, sends[1].body.content)
  assert.equal(f.persisted().pending.length, 0)
  await f.client.stop()
})
test('a sender whose key changed never reaches plaintext decryption or the send transport', async () => {
  let decryptions = 0
  const f = fixture({
    pins: changedKey,
    decrypt: () => {
      decryptions++
      return 'not allowed'
    },
    history: [peerEvent()],
  })
  await f.client.start()
  assert.equal(f.client.getState().messages[0].status, 'unverified')
  assert.equal(f.client.getState().messages[0].text, null)
  assert.equal(decryptions, 0)
  assert.equal(f.client.getState().notices[0].kind, 'key-changed')
  assert.equal(f.client.getState().peerTrusted, false)
  await assert.rejects(f.client.send('not permitted'), /segurança desta conversa mudou/)
  assert.equal(
    f.requests.filter((request) => request.method === 'PUT').length,
    0,
  )
  await f.client.stop()
})
test('a claimed sender with a different device key is not displayed as authenticated', async () => {
  let decryptions = 0
  const f = fixture({
    decrypt: () => {
      decryptions++
      return 'forged attribution'
    },
    history: [peerEvent('$forged', { sender_key: 'another-device-key' })],
  })
  await f.client.start()
  assert.equal(f.client.getState().messages[0].text, null)
  assert.equal(f.client.getState().messages[0].status, 'unavailable')
  assert.equal(decryptions, 0)
  await f.client.stop()
})
test('stop clears plaintext snapshots and cancels a delayed startup before any crypto work', async () => {
  const f = fixture()
  await f.client.start()
  await f.client.send('Visible only in memory')
  assert.equal(f.client.getState().messages.length, 1)
  await f.client.stop()
  assert.equal(f.client.getState().messages.length, 0)
  let release
  f.storage.load = () =>
    new Promise((resolve) => {
      release = resolve
    })
  const before = f.requests.length
  const starting = f.client.start()
  await f.client.stop()
  release({ pending: [] })
  await starting
  assert.equal(f.requests.length, before)
})
test('offline queues have a finite bound', async () => {
  const f = fixture({ deny: 503 })
  await f.client.start()
  for (let i = 0; i < 100; i++) await f.client.send(`Fixture ${i}`)
  assert.equal(f.persisted().pending.length, 100)
  await assert.rejects(
    f.client.send('Would exceed the limit'),
    /Aguarde o envio/,
  )
  await f.client.stop()
})

test('read receipts require opt-in and a visible authenticated plaintext message', async () => {
  const f = fixture({ history: [peerEvent('$received')] })
  await f.client.start()
  assert.equal(f.client.getState().readReceiptsEnabled, false)
  f.client.visibleMessages(['$received'])
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(f.persisted().receipts[0].read, false)
  await f.client.setReadReceipts(true)
  assert.equal(f.persisted().receipts[0].read, true)
  assert.equal(JSON.stringify(f.persisted()).includes('plaintext from'), false)
  await f.client.setReadReceipts(false)
  assert.equal(f.persisted().receipts[0].read, false)
  await f.client.stop()
})

test('untrusted messages never enter either delivery or read acknowledgement queues', async () => {
  const f = fixture({
    pins: changedKey,
    readReceipts: true,
    history: [peerEvent('$untrusted')],
  })
  await f.client.start()
  f.client.visibleMessages(['$untrusted'])
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(f.persisted().receipts, [])
  await f.client.stop()
})

// --- Confiança no primeiro contato e vários aparelhos ---

test('first contact is trusted without comparing codes and without a warning', async () => {
  const f = fixture({ history: [peerEvent()] })
  await f.client.start()
  const state = f.client.getState()
  assert.equal(state.peerTrusted, true)
  assert.deepEqual(state.notices, [])
  assert.deepEqual(f.persisted().pins['@peer:test'], { PEER: PEER_PRINT })
  assert.equal(state.messages[0].text, 'plaintext from the SDK test double')
  await f.client.send('Sem verificar nada antes')
  // Cifra para o contato e para os outros aparelhos da própria conta.
  assert.deepEqual(f.shared.at(-1), ['@peer:test', '@self:test'])
  assert.deepEqual(f.trusted['@peer:test'], ['PEER'])
  await f.client.stop()
})

test('a device that has not published keys yet neither blocks the contact nor raises a false alarm', async () => {
  const f = fixture()
  f.room.peer.devices = ['PEER', 'PEER2']
  f.keys['@peer:test|PEER2'] = null
  await f.client.start()
  // O aparelho conhecido já basta para conversar; o outro ainda não é confiável.
  assert.equal(f.client.getState().peerTrusted, true)
  assert.deepEqual(f.trusted['@peer:test'], ['PEER'])
  assert.deepEqual(f.client.getState().notices, [])
  // Quando ele publica as chaves, é anunciado como aparelho novo.
  delete f.keys['@peer:test|PEER2']
  await f.restart()
  assert.deepEqual(f.trusted['@peer:test'].sort(), ['PEER', 'PEER2'])
  assert.deepEqual(
    f.client.getState().notices.map((n) => [n.kind, n.deviceId]),
    [['device-added', 'PEER2']],
  )
  await f.client.stop()
})

test('a contact whose devices are all still loading cannot be trusted yet', async () => {
  const f = fixture()
  f.keys['@peer:test|PEER'] = null
  await f.client.start()
  assert.equal(f.client.getState().peerTrusted, false)
  assert.equal(f.persisted().pins?.['@peer:test'], undefined)
  await assert.rejects(f.client.send('too early'), /segurança desta conversa mudou/)
  await f.client.stop()
})

test('the device list is re-read on every send, with no cache, so a device approved an instant ago gets the key', async () => {
  const f = fixture()
  await f.client.start()
  const count = () =>
    f.requests.filter((row) => row.path === '/conversation/chat').length
  const before = count()
  // Aparelho aprovado logo depois da última atualização: precisa entrar na distribuição.
  f.room.peer.devices = ['PEER', 'PEER2']
  await f.client.send('first')
  assert.equal(count(), before + 1)
  assert.deepEqual(f.trusted['@peer:test'].sort(), ['PEER', 'PEER2'])
  await f.client.send('second, immediately after')
  assert.equal(count(), before + 2)
  await f.client.stop()
})

test('a new device of a known contact is trusted with a visible security notice', async () => {
  const f = fixture({ pins: { '@peer:test': { PEER: PEER_PRINT } } })
  f.room.peer.devices = ['PEER', 'PEER2']
  await f.client.start()
  const state = f.client.getState()
  assert.equal(state.peerTrusted, true)
  assert.equal(state.notices.length, 1)
  assert.deepEqual(
    [state.notices[0].kind, state.notices[0].who, state.notices[0].deviceId],
    ['device-added', 'peer', 'PEER2'],
  )
  assert.deepEqual(f.trusted['@peer:test'].sort(), ['PEER', 'PEER2'])
  await f.client.send('Continua funcionando, com aviso')
  await f.client.stop()
})

test('a changed key on a known device blocks sending until the person decides', async () => {
  const f = fixture({ pins: changedKey })
  await f.client.start()
  assert.equal(f.client.getState().peerTrusted, false)
  assert.deepEqual(f.trusted['@peer:test'], [])
  await assert.rejects(f.client.send('blocked'), /segurança desta conversa mudou/)
  const [notice] = f.client.getState().notices
  assert.equal(notice.kind, 'key-changed')
  await f.client.acknowledgeNotice(notice.id)
  assert.equal(f.client.getState().peerTrusted, true)
  assert.deepEqual(f.client.getState().notices, [])
  assert.equal(f.persisted().pins['@peer:test'].PEER, PEER_PRINT)
  await f.client.send('now allowed')
  await f.client.stop()
})

test('the same warning is never duplicated across refreshes and restarts', async () => {
  const f = fixture({ pins: changedKey })
  await f.client.start()
  await f.restart()
  await f.restart()
  assert.equal(f.client.getState().notices.length, 1)
  await f.client.stop()
})

test('devices removed by the server lose their pin and trust', async () => {
  const f = fixture({
    pins: { '@peer:test': { PEER: PEER_PRINT, OLD: 'old:public-signing-key' } },
  })
  await f.client.start()
  assert.deepEqual(Object.keys(f.persisted().pins['@peer:test']), ['PEER'])
  await f.client.stop()
})

test('messages from my other devices are shown only when that device is pinned', async () => {
  const own = (device) => ({
    event_id: `$own-${device}`,
    sender: '@self:test',
    type: 'm.room.encrypted',
    origin_server_ts: 1,
    content: {
      algorithm: 'm.megolm.v1.aes-sha2',
      sender_key: 'self-key',
      device_id: device,
    },
  })
  const f = fixture({ history: [own('OTHER'), own('GHOST')] })
  f.room.selfDevices = ['SELF', 'OTHER']
  await f.client.start()
  const byId = Object.fromEntries(
    f.client.getState().messages.map((m) => [m.id, m]),
  )
  assert.equal(byId['$own-OTHER'].status, 'sent')
  assert.equal(byId['$own-OTHER'].text, 'plaintext from the SDK test double')
  assert.equal(byId['$own-GHOST'].text, null)
  // GHOST não está na lista de aparelhos ativos da conta: foi desconectado.
  assert.equal(byId['$own-GHOST'].status, 'disconnected')
  assert.deepEqual(f.trusted['@self:test'], ['OTHER'])
  await f.client.stop()
})

test('pending requests for new devices of my account are exposed for approval', async () => {
  const link = {
    id: 'new-device',
    platform: 'web',
    label: 'Navegador',
    code: '123456',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  }
  const f = fixture({ links: [link] })
  await f.client.start()
  assert.deepEqual(f.client.getState().deviceLinks, [link])
  await f.client.stop()
})

test('enrolling a new device shows the code until an active device approves it', async () => {
  const seen = []
  const answers = [
    { status: 'pending_approval', code: '482913', expiresAt: 'later' },
    { status: 'pending_approval', code: '482913', expiresAt: 'later' },
    {
      status: 'ready',
      deviceId: 'NEW',
      matrixUserId: '@self:test',
      singleDevicePilot: false,
    },
  ]
  const session = await enrollDevice(async () => answers.shift(), {
    onPending: (pending) => seen.push(pending.code),
    sleep: async () => {},
  })
  assert.deepEqual(seen, ['482913', '482913'])
  assert.equal(session.deviceId, 'NEW')
  assert.equal('status' in session, false)
})

test('enrolling stops when the request is refused or cancelled', async () => {
  await assert.rejects(
    enrollDevice(
      async () => {
        const error = new Error('A conexão deste aparelho foi recusada.')
        error.status = 403
        throw error
      },
      { onPending: () => {}, sleep: async () => {} },
    ),
    /recusada/,
  )
  const abort = new AbortController()
  abort.abort()
  await assert.rejects(
    enrollDevice(async () => ({ status: 'pending_approval', code: '1', expiresAt: 'x' }), {
      onPending: () => {},
      signal: abort.signal,
      sleep: async () => {},
    }),
    /cancelada/,
  )
})

// --- Estados da conversa segura e textos compartilhados pelas duas telas ---

test('the peer status tells the screens whether to wait, warn or write', async () => {
  const none = fixture()
  none.room.peer.devices = []
  none.room.peer.deviceId = null
  await none.client.start()
  assert.equal(none.client.getState().peerStatus, 'none')
  assert.equal(
    composerPlaceholder(none.client.getState()),
    'Aguardando a outra pessoa abrir as conversas',
  )
  await none.client.stop()

  const loading = fixture()
  loading.keys['@peer:test|PEER'] = null
  await loading.client.start()
  assert.equal(loading.client.getState().peerStatus, 'preparing')
  assert.equal(
    composerPlaceholder(loading.client.getState()),
    'Preparando a conversa segura…',
  )
  await loading.client.stop()

  const blocked = fixture({ pins: changedKey })
  await blocked.client.start()
  assert.equal(blocked.client.getState().peerStatus, 'blocked')
  assert.match(composerPlaceholder(blocked.client.getState()), /aviso de segurança/)
  await blocked.client.stop()

  const ready = fixture()
  await ready.client.start()
  assert.equal(ready.client.getState().peerStatus, 'ready')
  assert.equal(composerPlaceholder(ready.client.getState()), 'Escreva uma mensagem…')
  ready.room.canSend = false
  assert.equal(composerPlaceholder({ ...ready.client.getState(), room: { canSend: false } }), 'Esta interação está bloqueada.')
  await ready.client.stop()
})

test('a message from a disconnected device is explained as such and never decrypted', async () => {
  let decryptions = 0
  const f = fixture({
    decrypt: () => {
      decryptions++
      return 'must not open'
    },
    history: [peerEvent('$old', { device_id: 'OLD', sender_key: 'old-key' })],
  })
  await f.client.start()
  const [message] = f.client.getState().messages
  assert.equal(message.status, 'disconnected')
  assert.equal(message.text, null)
  assert.equal(decryptions, 0)
  assert.match(messagePlaceholder(message.status), /não está mais conectado/)
  assert.doesNotMatch(messagePlaceholder(message.status), /segurança alterada/)
  assert.match(messagePlaceholder('unverified'), /segurança alterada/)
  await f.client.stop()
})

test('device management needs only the device credentials, not the crypto engine', async () => {
  const calls = []
  const api = chatDevicesApi(async (path, method, body) => {
    calls.push([path, method ?? 'GET', body])
    return { devices: [], links: [] }
  })
  await api.list()
  await api.decide('link/1', true)
  await api.revoke('dev 2')
  assert.deepEqual(calls, [
    ['/chat/devices', 'GET', undefined],
    ['/chat/device-links/link%2F1', 'POST', { approve: true }],
    ['/chat/devices/dev%202', 'DELETE', undefined],
  ])
})

test('a rate limit while waiting for approval is waited out, not treated as a refusal', async () => {
  const seen = []
  const answers = [
    { status: 'pending_approval', code: '111111', expiresAt: 'later' },
    'limit',
    'limit',
    { status: 'ready', deviceId: 'NEW', matrixUserId: '@self:test', singleDevicePilot: false },
  ]
  const session = await enrollDevice(
    async () => {
      const next = answers.shift()
      if (next === 'limit') {
        const error = new Error('ThrottlerException: Too Many Requests')
        error.status = 429
        throw error
      }
      return next
    },
    { onPending: (pending) => seen.push(pending.code), sleep: async () => {} },
  )
  assert.equal(session.deviceId, 'NEW')
  assert.deepEqual(seen, ['111111'])
})

// --- Prévia e "visto" para a lista de conversas ---

test('the list preview is the last opened message and lives only in memory', async () => {
  chatPreviews.clear()
  const heard = []
  const stopListening = chatPreviews.subscribe(() => heard.push(1))
  const f = fixture({ history: [peerEvent('$m1'), peerEvent('$m2')] })
  await f.client.start()
  assert.deepEqual(chatPreviews.get('conversation'), {
    eventId: '$m2',
    text: 'plaintext from the SDK test double',
  })
  assert.ok(heard.length >= 1)
  assert.equal(JSON.stringify(f.persisted()).includes('plaintext from'), false)
  // Sair da conversa não apaga a prévia da sessão; limpar (logout/segundo plano) apaga.
  await f.client.stop()
  assert.equal(chatPreviews.get('conversation')?.eventId, '$m2')
  chatPreviews.clear()
  assert.equal(chatPreviews.get('conversation'), undefined)
  stopListening()
})

test('an unreadable last message never shows an older text as the preview', async () => {
  chatPreviews.clear()
  const f = fixture({ pins: changedKey, history: [peerEvent('$blocked')] })
  await f.client.start()
  assert.equal(chatPreviews.get('conversation'), undefined)
  await f.client.stop()
})

test('a message I just sent is previewed only once the server gave it an id', async () => {
  chatPreviews.clear()
  const f = fixture()
  await f.client.start()
  f.failSaves(false)
  await f.client.send('Olá, tudo bem?')
  assert.deepEqual(chatPreviews.get('conversation'), {
    eventId: '$event',
    text: 'Olá, tudo bem?',
  })
  await f.client.stop()
  chatPreviews.clear()
})

test('viewing received messages tells the server the conversation was opened, but not for my own', async () => {
  chatPreviews.clear()
  const f = fixture({ history: [peerEvent('$seen')] })
  await f.client.start()
  const seen = () => f.requests.filter((row) => row.path === '/conversation/chat/seen')
  f.client.visibleMessages([])
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(seen().length, 0)
  f.client.visibleMessages(['$seen'])
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(seen().length, 1)
  assert.equal(seen()[0].method, 'POST')
  await f.client.send('minha mensagem')
  const own = f.client.getState().messages.find((m) => m.sender === 'self').id
  f.client.visibleMessages([own])
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(seen().length, 1)
  await f.client.stop()
  chatPreviews.clear()
})

// --- Textos em linguagem simples, um só lugar para web e mobile ---

test('the chat view speaks plain language and drives what the screens show', async () => {
  const loading = chatView(null, 'Bruno')
  assert.equal(loading.preparing, true)
  assert.equal(loading.canWrite, false)

  const waiting = fixture()
  waiting.room.peer.devices = []
  waiting.room.peer.deviceId = null
  await waiting.client.start()
  const view = chatView(waiting.client.getState(), 'Bruno')
  assert.match(view.waitingPeer, /^Bruno ainda não abriu as conversas no app/)
  assert.equal(view.canWrite, false)
  await waiting.client.stop()

  const ready = fixture()
  await ready.client.start()
  const ok = chatView(ready.client.getState(), 'Bruno')
  assert.equal(ok.canWrite, true)
  assert.equal(ok.placeholder, 'Escreva uma mensagem…')
  assert.equal(ok.waitingPeer, null)
  assert.deepEqual(ok.notices, [])
  assert.equal(ok.emptyText, 'A conversa de vocês começa aqui.')
  assert.equal(ok.canVerify, true)
  assert.equal(ok.verification.active, false)
  assert.deepEqual(ok.verification.primaryAction, { action: 'request', label: 'Começar a confirmação' })
  assert.equal(ok.verification.canCancel, false)
  assert.equal(ok.readReceipts.label, 'Compartilhar quando eu ler')
  assert.equal(ok.readReceipts.disabled, false)
  assert.match(ok.banner, /criptografia de ponta a ponta/)
  const verifiedView = chatView(ready.client.getState(), 'Bruno', true)
  assert.match(verifiedView.banner, /Identidade confirmada/)
  assert.equal(verifiedView.canVerify, false)
  assert.equal(verifiedView.verification, null)

  // Estados do painel de confirmação opcional e mensagens prontas para desenhar.
  const baseState = ready.client.getState()
  const incoming = chatView({ ...baseState, verification: { state: 'requested', incoming: true } }, 'Bruno')
  assert.equal(incoming.verification.active, true)
  assert.deepEqual(incoming.verification.primaryAction, { action: 'accept', label: 'Aceitar' })
  assert.equal(incoming.verification.canCancel, true)

  const outgoing = chatView({ ...baseState, verification: { state: 'requested', incoming: false } }, 'Bruno')
  assert.equal(outgoing.verification.primaryAction, null)
  assert.equal(outgoing.verification.waitingText, 'Esperando a outra pessoa aceitar…')

  const comparing = chatView({ ...baseState, verification: { state: 'comparing', incoming: false, decimals: [1234, 5678, 9012] } }, 'Bruno')
  assert.equal(comparing.verification.code, '1234 · 5678 · 9012')
  assert.deepEqual(comparing.verification.primaryAction, { action: 'confirm', label: 'Os números são iguais' })

  const withFailed = chatView({
    ...baseState,
    messages: [{ id: 'local:1', txnId: 't1', sender: 'self', text: 'Oi', status: 'failed', createdAt: '2026-11-19T12:00:00.000Z' }],
  }, 'Bruno')
  assert.equal(withFailed.emptyText, null)
  assert.equal(withFailed.messages.length, 1)
  assert.equal(withFailed.messages[0].own, true)
  assert.equal(withFailed.messages[0].body, 'Oi')
  assert.equal(withFailed.messages[0].retryTxnId, 't1')
  assert.equal(withFailed.messages[0].canRetry, true)
  assert.match(withFailed.messages[0].meta, /Não enviada/)
  await ready.client.stop()
})

test('security notices are short, blocking only when a known contact key really changed, and my own new device is silent', async () => {
  const changed = fixture({ pins: changedKey })
  await changed.client.start()
  const [blocking] = chatView(changed.client.getState(), 'Bruno').notices
  assert.equal(blocking.blocking, true)
  assert.equal(blocking.text, 'O código de segurança de Bruno mudou.')
  assert.equal(blocking.action, 'Continuar')
  await changed.client.stop()

  const added = fixture({ pins: { '@peer:test': { PEER: PEER_PRINT } } })
  added.room.peer.devices = ['PEER', 'PEER2']
  added.room.selfDevices = ['SELF', 'OWN2']
  await added.client.start()
  const notices = chatView(added.client.getState(), 'Bruno').notices
  assert.equal(notices.length, 1)
  assert.equal(notices[0].blocking, false)
  assert.equal(notices[0].text, 'Bruno trocou de aparelho ou entrou em outro.')
  await added.client.stop()
})

test('nothing the person reads uses technical words', async () => {
  const strings = []
  const collect = (view) =>
    strings.push(
      view.placeholder,
      view.banner,
      view.waitingPeer ?? '',
      view.emptyText ?? '',
      view.olderLabel,
      view.readReceipts.label,
      view.readReceipts.help,
      ...(view.verification
        ? [
            view.verification.title,
            view.verification.description,
            view.verification.primaryAction?.label ?? '',
            view.verification.waitingText ?? '',
            view.verification.cancelLabel,
          ]
        : []),
      ...view.deviceRequests.flatMap((d) => [d.title, d.text, d.allow, d.deny]),
      ...view.notices.flatMap((n) => [n.text, n.detail ?? '', n.action]),
    )
  collect(chatView(null, 'Ana'))
  for (const options of [{}, { pins: changedKey }]) {
    const f = fixture(options)
    await f.client.start()
    collect(chatView(f.client.getState(), 'Ana'))
    await f.client.stop()
  }
  const request = deviceRequestText({ label: null, platform: 'web', code: '123456' })
  strings.push(request.title, request.text, request.allow, request.deny)
  strings.push(...Object.values(ENROLL_WAITING), ...Object.values(RESET_WARNING))
  strings.push(composerPlaceholder({ peerStatus: 'none', room: null }), composerPlaceholder({ peerStatus: 'preparing', room: null }))
  for (const status of ['unverified', 'disconnected', 'unavailable']) strings.push(messagePlaceholder(status))
  strings.push(messageStatusLabel('unavailable'), messageStatusLabel('unverified'), messageStatusLabel('disconnected'))
  // Prova de que o teste examinou textos de verdade e não passou no vazio.
  assert.ok(strings.filter(Boolean).length >= 25, `only ${strings.filter(Boolean).length} texts checked`)
  const letters = 'a-zà-ú'
  const technical = new RegExp('(^|[^' + letters + '])(chaves?|dispositivos?|ativar|ativacao|ativação|megolm|olm|matrix|sas)([^' + letters + ']|$)', 'i')
  for (const text of strings) assert.doesNotMatch(text, technical, `technical wording: ${text}`)
})

// --- Aparelho desconectado: o app se recupera sozinho ---

test('enrolling a device that was disconnected raises a dedicated error so the app can start fresh', async () => {
  await assert.rejects(
    enrollDevice(
      async () => {
        const error = new Error('Este aparelho foi desconectado.')
        error.status = 423
        throw error
      },
      { onPending: () => {}, sleep: async () => {} },
    ),
    (error) => error instanceof ChatDeviceDisconnectedError,
  )
})

test('losing authorization while a conversation is open asks the screen to reconnect, once the server says 401', async () => {
  const lost = fixture({ syncStatus: 401 })
  await lost.client.start()
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(lost.client.getState().reactivate, true)
  assert.equal(lost.client.getState().error, 'Reconectando…')
  await lost.client.stop()
  const outage = fixture({ syncStatus: 503 })
  await outage.client.start()
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(outage.client.getState().reactivate, false, 'A plain outage must not wipe the device')
  await outage.client.stop()
})

// --- Etapa 1: texto em grupo ---

test('group chat encrypts for all active members, rotates keys when a member leaves, shows sender names and group receipts', async () => {
  const f = fixture({ keys: { '@carol:test|CAROL': 'carol-curve' } })
  f.room.kind = 'GROUP'
  f.room.peer = null
  f.room.peers = [
    { userId: 'u2', name: 'Bruno', matrixUserId: '@peer:test', deviceId: 'PEER', devices: ['PEER'] },
    { userId: 'u3', name: 'Carol', matrixUserId: '@carol:test', deviceId: 'CAROL', devices: ['CAROL'] },
  ]
  const sharedTo = []
  let rotated = 0
  const origShare = f.crypto.share
  f.crypto.share = async (roomId, userIds) => {
    sharedTo.push([...userIds])
    return origShare(roomId, userIds)
  }
  f.crypto.rotate = async () => {
    rotated += 1
  }
  await f.client.start()
  const view0 = chatView(f.client.getState(), 'Grupo do Bairro')
  assert.equal(view0.canWrite, true)
  assert.equal(view0.canVerify, false, '1-to-1 SAS verification is hidden in groups')
  assert.match(view0.banner, /deste grupo/)
  assert.equal(view0.emptyText, 'A conversa do grupo começa aqui.')

  // Envia no grupo: compartilha chave com Bruno, Carol e a própria conta.
  await f.client.send('Olá grupo')
  assert.deepEqual(sharedTo[sharedTo.length - 1], ['@peer:test', '@carol:test', '@self:test'])

  // Remove Carol do grupo: o próximo envio gira a chave Megolm e exclui Carol.
  f.room.peers = [f.room.peers[0]]
  f.room.revision += 1
  await f.client.send('Depois da saída')
  assert.equal(rotated, 1, 'Removing a member rotates the outbound Megolm session')
  assert.deepEqual(sharedTo[sharedTo.length - 1], ['@peer:test', '@self:test'])

  // Mensagem recebida em grupo traz o nome de quem enviou e recibos agregados aparecem na view.
  const state = f.client.getState()
  const v = chatView(
    {
      ...state,
      messages: [
        { id: '$m1', sender: 'peer', senderName: 'Bruno', text: 'Oi!', createdAt: Date.now(), status: 'sent' },
        { id: '$m2', sender: 'self', text: 'Tudo bem?', createdAt: Date.now(), status: 'delivered', receiptSummary: 'Lida por 1 de 2' },
      ],
    },
    'Grupo do Bairro',
  )
  assert.equal(v.messages[0].senderName, 'Bruno')
  assert.equal(v.messages[1].senderName, null)
  assert.match(v.messages[1].meta, /Lida por 1 de 2/)
  await f.client.stop()
})

// --- Etapa 2: mídia cifrada (formato padrão Matrix v2) ---

test('sendMedia encrypts before upload, sends standard Matrix v2 metadata inside Megolm, and enforces size limits', async () => {
  const {
    buildMediaEventContent,
    parseDecryptedMessage,
    formatFileSize,
    mediaKindFromMime,
    CHAT_MEDIA_LIMITS,
  } = require('../src/index.js')
  assert.equal(mediaKindFromMime('image/jpeg'), 'image')
  assert.equal(mediaKindFromMime('video/mp4'), 'video')
  assert.equal(mediaKindFromMime('audio/webm'), 'audio')
  assert.equal(mediaKindFromMime('application/pdf'), 'file')
  assert.equal(formatFileSize(512), '512 B')
  assert.equal(formatFileSize(2048), '2 KB')
  assert.equal(formatFileSize(1.5 * 1024 * 1024), '1,5 MB')

  const secret = JSON.stringify({
    v: 'v2',
    key: { kty: 'oct', key_ops: ['encrypt', 'decrypt'], alg: 'A256CTR', k: 'abc', ext: true },
    iv: 'iv123',
    hashes: { sha256: 'hash123' },
  })
  const attId = '11111111-1111-4111-8111-111111111111'
  const built = buildMediaEventContent(
    { kind: 'image', id: attId, name: 'foto.jpg', mimeType: 'image/jpeg', size: 1234, secret },
    'Olha essa foto',
  )
  assert.equal(built.msgtype, 'm.image')
  assert.equal(built.file.v, 'v2')
  assert.equal(built.file.url, `votz-media://${attId}`)
  const parsed = parseDecryptedMessage(built)
  assert.equal(parsed.text, 'Olha essa foto')
  assert.equal(parsed.attachment.id, attId)
  assert.equal(parsed.attachment.kind, 'image')
  assert.equal(parsed.attachment.name, 'foto.jpg')

  // Anexo com url inválida ou versão fora do padrão v2 é recusado.
  assert.throws(() => parseDecryptedMessage({ ...built, file: { ...built.file, v: 'v1' } }))
  assert.throws(() => parseDecryptedMessage({ ...built, file: { ...built.file, url: 'https://evil.test/x' } }))

  const f = fixture()
  let uploadedBytes = null
  let encryptedPayload = null
  f.crypto.encryptAttachment = async (bytes) => ({
    ciphertext: new Uint8Array(bytes.map((b) => b ^ 0xff)),
    secret,
  })
  f.crypto.encrypt = async (_room, payload) => {
    encryptedPayload = payload
    return {
      algorithm: 'm.megolm.v1.aes-sha2',
      ciphertext: 'cipher',
      device_id: 'SELF',
      sender_key: 'self-key',
      session_id: 's1',
    }
  }
  await f.client.start()
  const raw = new Uint8Array([10, 20, 30, 40])
  await f.client.sendMedia({
    kind: 'image',
    name: 'foto.jpg',
    mimeType: 'image/jpeg',
    bytes: raw,
    caption: 'No bairro',
    upload: async (ciphertext) => {
      uploadedBytes = ciphertext
      return { id: attId }
    },
  })
  assert.deepEqual([...uploadedBytes], [245, 235, 225, 215], 'Server only ever receives encrypted bytes')
  assert.equal(encryptedPayload.msgtype, 'm.image')
  assert.equal(chatPreviews.get('conversation').text, 'Foto: No bairro')

  // Limite de tamanho por tipo é aplicado antes de cifrar/enviar.
  await assert.rejects(
    f.client.sendMedia({
      kind: 'image',
      name: 'gigante.jpg',
      mimeType: 'image/jpeg',
      bytes: new Uint8Array(CHAT_MEDIA_LIMITS.image + 1),
      upload: async () => ({ id: attId }),
    }),
    /ultrapassa o limite/,
  )
  await f.client.stop()
  chatPreviews.clear()
})
