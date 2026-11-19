// Real PostgreSQL + private Synapse + official WASM SDK, using the same adapter as the web UI.
const assert = require('node:assert/strict')
const path = require('node:path')
const { randomUUID, randomBytes } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { PrismaClient } = require('@prisma/client')
const { JwtService } = require('@nestjs/jwt')
const { ChatClient } = require('@votz/chat-core')
const root = path.resolve(__dirname, '../../..')
assert.ok(
  ['localhost', '127.0.0.1'].includes(
    new URL(process.env.DATABASE_URL).hostname,
  ),
  'This QA requires a local database',
)
execFileSync(
  process.execPath,
  [
    require.resolve('typescript/bin/tsc'),
    'apps/web/src/lib/chat-crypto.ts',
    '--outDir',
    '.local/chat/adapter',
    '--target',
    'ES2022',
    '--module',
    'commonjs',
    '--skipLibCheck',
    '--esModuleInterop',
    '--types',
    'node',
  ],
  { cwd: root, stdio: 'pipe' },
)
const { WebChatCrypto } = require(
  path.join(root, '.local/chat/adapter/chat-crypto.js'),
)
const db = new PrismaClient()
const users = []
const clients = []
const engines = []
const run = randomUUID()
let conversationId
let checks = 0
async function request(
  actor,
  endpoint,
  method = 'GET',
  body,
  expected = 200,
  device = true,
) {
  const response = await fetch(
    'http://127.0.0.1:3001/api/v1/conversations' + endpoint,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${actor.token}`,
        ...(device
          ? {
              'x-votz-chat-device': actor.credentials.id,
              'x-votz-chat-secret': actor.credentials.secret,
            }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  )
  const data = await response.json()
  if (
    response.status === 400 &&
    endpoint.includes('/to-device/m.room.encrypted/')
  )
    console.error(
      'Encrypted envelope field names:',
      Object.values(body.messages).flatMap((devices) =>
        Object.values(devices).map((content) => ({
          fields: Object.keys(content),
          algorithm: content.algorithm,
          cipherFields: Object.values(content.ciphertext || {}).map(
            (value) => ({ fields: Object.keys(value), type: value.type }),
          ),
        })),
      ),
    )
  if (response.status !== expected) {
    const error = new Error(
      `${method} ${endpoint}: HTTP ${response.status}; ${data.message || data.errcode || 'unexpected response'}`,
    )
    error.status = response.status
    throw error
  }
  checks++
  return data
}
async function until(condition, label, timeout = 45000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await condition()) return
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(
    `Timed out: ${label}; ${clients
      .map((c) => {
        const s = c.getState()
        return `[${s.error || 'ok'} | trusted=${s.peerTrusted} | notices=${s.notices.map((n) => `${n.kind}:${n.who}`).join(',')} | messages=${s.messages.map((m) => `${m.sender}:${m.status}:${m.text === null ? 'null' : 'text'}`).join(',')}]`
      })
      .join(' ')}`,
  )
}
;(async () => {
  const jwt = new JwtService({ secret: process.env.JWT_SECRET })
  for (let i = 0; i < 3; i++) {
    const user = await db.user.create({
      data: {
        email: `qa-chat-text-${run}-${i}@votz.test`,
        name: `QA private ${i}`,
        emailVerified: true,
      },
    })
    users.push({
      ...user,
      token: jwt.sign(
        { sub: user.id, typ: 'access' },
        { expiresIn: '15m', algorithm: 'HS256' },
      ),
      credentials: {
        id: randomUUID(),
        secret: randomBytes(48).toString('hex'),
        platform: 'test',
      },
    })
  }
  const [a, b, outsider] = users
  const direct = await request(
    a,
    '/direct',
    'POST',
    { targetUserId: b.id },
    201,
    false,
  )
  conversationId = direct.id
  await request(
    b,
    `/${direct.id}/respond`,
    'POST',
    { accept: true },
    201,
    false,
  )
  const sessions = []
  for (const user of users)
    sessions.push(
      await request(
        user,
        '/chat/devices',
        'POST',
        user.credentials,
        201,
        false,
      ),
    )
  // Multi-dispositivo: um segundo aparelho precisa da aprovação de um ativo.
  const second = {
    ...a.credentials,
    id: randomUUID(),
    secret: randomBytes(48).toString('hex'),
    platform: 'web',
    label: 'Navegador de teste',
  }
  const secondActor = { ...a, credentials: second }
  const waiting = await request(a, '/chat/devices', 'POST', second, 201, false)
  assert.equal(waiting.status, 'pending_approval')
  assert.match(waiting.code, /^\d{6}$/)
  assert.equal(
    (await request(a, '/chat/devices', 'POST', second, 201, false)).code,
    waiting.code,
  )
  await request(secondActor, '/chat/devices', 'GET', undefined, 401)
  await request(secondActor, `/chat/device-links/${second.id}`, 'POST', { approve: true }, 401)
  await request(a, `/chat/device-links/${second.id}`, 'POST', { approve: 'true' }, 400)
  const pendingList = await request(a, '/chat/devices')
  assert.equal(pendingList.links.length, 1)
  assert.equal(pendingList.links[0].code, waiting.code)
  assert.equal(pendingList.devices.length, 1)
  assert.equal(pendingList.devices[0].current, true)
  await request(a, `/chat/device-links/${second.id}`, 'POST', { approve: true }, 201)
  await request(outsider, `/chat/device-links/${second.id}`, 'POST', { approve: false }, 404)
  const activated = await request(a, '/chat/devices', 'POST', second, 201, false)
  assert.equal(activated.status, 'ready')
  assert.equal(activated.deviceId, second.id)
  const both = await request(secondActor, '/chat/devices')
  assert.equal(both.devices.length, 2)
  assert.equal(both.devices.find((row) => row.id === second.id).current, true)
  assert.equal(both.devices.find((row) => row.id === second.id).label, 'Navegador de teste')
  // O segundo aparelho vê a sala só depois de a conversa existir; aqui validamos o ciclo de vida.
  await request(a, `/chat/devices/${second.id}`, 'DELETE', undefined, 200)
  await request(secondActor, '/chat/sync', 'GET', undefined, 401)
  assert.equal((await request(a, '/chat/devices')).devices.length, 1)
  // Aparelho de outra conta nunca é listado nem revogável.
  await request(outsider, `/chat/devices/${a.credentials.id}`, 'DELETE', undefined, 404)
  await request(
    {
      ...a,
      credentials: {
        ...a.credentials,
        secret: randomBytes(48).toString('hex'),
      },
    },
    '/chat/sync',
    'GET',
    undefined,
    401,
  )
  await request(outsider, `/${direct.id}/chat`, 'GET', undefined, 404)
  await request(
    a,
    '/chat/keys/query',
    'POST',
    { device_keys: { [sessions[2].matrixUserId]: [] } },
    403,
  )
  console.log(
    'PASS: device enrollment, approval-gated linking, listing, revocation, ownership and outsider authorization',
  )
  // Quem perdeu todos os aparelhos recomeça com a senha da conta.
  const bcrypt = require('bcrypt')
  const lostUser = await db.user.create({
    data: {
      email: `qa-chat-text-${run}-lost@votz.test`,
      name: 'QA lost devices',
      emailVerified: true,
      password: await bcrypt.hash('Qa!reset-1', 4),
    },
  })
  const lost = {
    ...lostUser,
    token: jwt.sign({ sub: lostUser.id, typ: 'access' }, { expiresIn: '15m', algorithm: 'HS256' }),
    credentials: { id: randomUUID(), secret: randomBytes(48).toString('hex'), platform: 'test' },
  }
  users.push(lost)
  await request(lost, '/chat/devices', 'POST', lost.credentials, 201, false)
  const lostSecond = { ...lost.credentials, id: randomUUID(), secret: randomBytes(48).toString('hex'), platform: 'web' }
  assert.equal((await request(lost, '/chat/devices', 'POST', lostSecond, 201, false)).status, 'pending_approval')
  await request(lost, '/chat/devices/reset', 'POST', { password: 'senha errada' }, 403, false)
  assert.equal((await request(lost, '/chat/devices')).devices.length, 1, 'A wrong password disconnects nothing')
  const reset = await request(lost, '/chat/devices/reset', 'POST', { password: 'Qa!reset-1' }, 201, false)
  assert.deepEqual(reset, { reset: true, disconnected: 1 })
  await request(lost, '/chat/devices', 'GET', undefined, 401)
  await request(lost, '/chat/devices', 'POST', lost.credentials, 423, false)
  const fresh = { ...lost, credentials: { ...lostSecond, platform: 'test' } }
  assert.equal((await request(fresh, '/chat/devices', 'POST', fresh.credentials, 201, false)).status, 'ready')
  assert.equal((await request(fresh, '/chat/devices')).devices.length, 1)
  console.log(
    'PASS: after losing every device, a wrong password changes nothing; the right one disconnects the old devices (423 for them) and the next device enters directly',
  )
  const stores = []
  const withheld = { algorithm: 'm.megolm.v1.aes-sha2', code: 'm.no_olm', reason: 'QA native bridge session discovery', from_device: a.credentials.id, sender_key: 'public-fixture-key' }
  await request(a, `/chat/to-device/m.room_key.withheld/${randomUUID()}`, 'PUT', { messages: { [sessions[1].matrixUserId]: { [b.credentials.id]: withheld } } })
  await request(a, `/chat/to-device/m.room_key.withheld/${randomUUID()}`, 'PUT', { messages: { [sessions[1].matrixUserId]: { [b.credentials.id]: { ...withheld, from_device: randomUUID() } } } }, 400)
  for (let i = 0; i < 2; i++) {
    const user = users[i]
    const engine = await WebChatCrypto.open(
      sessions[i].matrixUserId,
      sessions[i].deviceId,
    )
    engines.push(engine)
    let persisted = { pending: [] }
    const storage = {
      load: async () => structuredClone(persisted),
      save: async (value) => {
        persisted = structuredClone(value)
      },
    }
    stores.push(() => persisted)
    const http = (endpoint, method = 'GET', body) =>
      request(user, endpoint, method, body, method === 'POST' ? 201 : 200)
    const client = new ChatClient(
      direct.id,
      sessions[i],
      engine,
      http,
      storage,
      () => randomUUID(),
    )
    clients.push(client)
  }
  await Promise.all(clients.map((client) => client.start()))
  await until(async () => {
    try {
      await engines[0].identity(sessions[1].matrixUserId, sessions[1].deviceId)
      await engines[1].identity(sessions[0].matrixUserId, sessions[0].deviceId)
      return clients.every((client) => client.getState().ready)
    } catch {
      return false
    }
  }, 'both crypto devices published and discovered')
  // Confiança no primeiro contato: nenhuma comparação de código para conversar.
  await until(
    () => clients.every((client) => client.getState().peerTrusted),
    'first contact trusted without comparing codes',
  )
  assert.deepEqual(
    clients.map((client) => client.getState().notices),
    [[], []],
  )
  assert.notEqual(clients[0].getState().verification.state, 'done')
  console.log(
    'PASS: first contact is trusted without code comparison and without warnings',
  )
  const textA = `Mensagem privada A ${run} 🙂`
  const textB = `Resposta privada B ${run} çã`
  await clients[0].send(textA)
  await until(
    () =>
      clients[1].getState().messages.some((message) => message.text === textA),
    'encrypted A to B delivery',
  )
  await clients[1].send(textB)
  await until(
    () =>
      clients[0].getState().messages.some((message) => message.text === textB),
    'encrypted B to A delivery',
  )
  console.log(
    'PASS: encrypted text flowed in both directions with no identity verification step',
  )
  // Lista de conversas: horário, autoria e não lidas, sem nunca expor conteúdo.
  const listed = async (actor) =>
    (
      await request(actor, '?folder=active&limit=50', 'GET', undefined, 200, false)
    ).items.find((item) => item.id === direct.id)
  const forA = await listed(a)
  const forB = await listed(b)
  assert.equal(forA.lastMessage.fromMe, false, 'A last message was written by B')
  assert.equal(forB.lastMessage.fromMe, true)
  assert.equal(forA.unreadCount, 1, 'A has not opened B reply yet')
  assert.equal(forB.unreadCount, 1, 'B has not opened A message yet')
  assert.match(forA.lastMessage.eventId, /^\$/)
  assert.ok(Date.now() - new Date(forA.lastMessage.at).getTime() < 120000)
  assert.deepEqual(Object.keys(forA.lastMessage).sort(), ['at', 'eventId', 'fromMe'])
  assert.equal(JSON.stringify([forA, forB]).includes(textA), false)
  assert.equal(JSON.stringify([forA, forB]).includes(textB), false)
  const receivedByB = clients[1]
    .getState()
    .messages.find((message) => message.text === textA && message.sender === 'peer')
  clients[1].visibleMessages([receivedByB.id])
  await until(async () => (await listed(b)).unreadCount === 0, 'B opening the conversation clears its unread count')
  assert.equal((await listed(a)).unreadCount, 1, 'Only the person who opened it is cleared')
  console.log(
    'PASS: conversation list carries last-message time, author and unread counts without any message content; opening clears only the opener',
  )
  // Verificação por código continua disponível como reforço opcional.
  await clients[0].verification('request')
  await until(
    () => clients[1].getState().verification.state === 'requested',
    'verification invitation',
  )
  await clients[1].verification('accept')
  await until(
    () =>
      clients.every(
        (client) => client.getState().verification.state === 'comparing',
      ),
    'SAS codes available',
  )
  assert.deepEqual(
    clients[0].getState().verification.decimals,
    clients[1].getState().verification.decimals,
  )
  await clients[0].verification('confirm')
  await clients[1].verification('confirm')
  await until(
    () =>
      clients.every(
        (client) => client.getState().verification.state === 'done',
      ),
    'mutual verified device trust',
  )
  console.log(
    'PASS: optional official Matrix SAS verified both device identities with equal codes',
  )
  assert.ok(
    stores.every((store) => !JSON.stringify(store()).includes(run)),
    'Transport storage contains no plaintext messages',
  )
  const history = await request(a, `/${direct.id}/chat/messages`)
  assert.equal(
    history.chunk.filter((event) => event.type === 'm.room.encrypted').length,
    2,
  )
  assert.equal(JSON.stringify(history).includes(textA), false)
  const event = history.chunk.find(
    (event) => event.sender === sessions[0].matrixUserId,
  )
  const transport = await request(a, `/${direct.id}/chat`)
  const secrets = JSON.parse(require('node:fs').readFileSync(path.join(root, '.local/chat/secrets.json'), 'utf8'))
  const matrixUrl = new URL(process.env.DATABASE_URL)
  matrixUrl.username = 'votz_matrix'
  matrixUrl.password = secrets.database
  matrixUrl.pathname = '/votz_matrix'
  matrixUrl.search = ''
  const matrixDb = new PrismaClient({ datasources: { db: { url: matrixUrl.toString() } } })
  try {
    const storedEvents = await matrixDb.$queryRaw`SELECT json FROM event_json WHERE room_id = ${transport.roomId}`
    const serialized = JSON.stringify(storedEvents)
    assert.equal(serialized.includes(textA), false)
    assert.equal(serialized.includes(textB), false)
    assert.equal(storedEvents.filter(row => JSON.parse(row.json).type === 'm.room.encrypted').length, 2)
    console.log('PASS: actual Synapse PostgreSQL event storage contains encrypted events and no message plaintext')
  } finally { await matrixDb.$disconnect() }
  await until(
    () =>
      clients[0]
        .getState()
        .messages.some(
          (message) => message.text === textA && message.status === 'delivered',
        ),
    'real decrypted delivery receipt',
  )
  assert.equal((await request(b, '/chat/privacy')).readReceiptsEnabled, false)
  await request(
    b,
    `/${direct.id}/chat/receipts`,
    'POST',
    { eventIds: [event.event_id], read: true },
    403,
  )
  await request(
    b,
    '/chat/privacy',
    'PUT',
    { readReceiptsEnabled: 'false' },
    400,
  )
  await request(
    a,
    `/${direct.id}/chat/receipts`,
    'POST',
    { eventIds: [event.event_id], read: false },
    403,
  )
  await request(
    outsider,
    `/${direct.id}/chat/receipts/query`,
    'POST',
    { eventIds: [event.event_id] },
    404,
  )
  await clients[1].setReadReceipts(true)
  clients[1].visibleMessages([event.event_id])
  await until(
    () =>
      clients[0]
        .getState()
        .messages.some(
          (message) => message.text === textA && message.status === 'read',
        ),
    'visible opt-in read receipt',
  )
  await clients[1].setReadReceipts(false)
  await request(
    b,
    `/${direct.id}/chat/receipts`,
    'POST',
    { eventIds: [event.event_id], read: false },
    201,
  )
  const receipts = await request(
    a,
    `/${direct.id}/chat/receipts/query`,
    'POST',
    { eventIds: [event.event_id] },
    201,
  )
  assert.ok(
    receipts.receipts[0].readAt,
    'A late delivery acknowledgement never downgrades an already shared read receipt',
  )
  console.log(
    'PASS: delivery after decryption; read receipts off by default, strict opt-in, visible-message read acknowledgement and no downgrade',
  )
  // --- Um segundo aparelho da conta A lê e escreve na mesma conversa ---
  const third = {
    id: randomUUID(),
    secret: randomBytes(48).toString('hex'),
    platform: 'web',
    label: 'Segundo navegador',
  }
  const thirdActor = { ...a, credentials: third }
  assert.equal(
    (await request(a, '/chat/devices', 'POST', third, 201, false)).status,
    'pending_approval',
  )
  await request(a, `/chat/device-links/${third.id}`, 'POST', { approve: true }, 201)
  const thirdSession = await request(a, '/chat/devices', 'POST', third, 201, false)
  assert.equal(thirdSession.status, 'ready')
  const engine3 = await WebChatCrypto.open(
    thirdSession.matrixUserId,
    thirdSession.deviceId,
  )
  engines.push(engine3)
  let persisted3 = { pending: [] }
  const client3 = new ChatClient(
    direct.id,
    thirdSession,
    engine3,
    (endpoint, method = 'GET', body) =>
      request(thirdActor, endpoint, method, body, method === 'POST' ? 201 : 200),
    {
      load: async () => structuredClone(persisted3),
      save: async (value) => {
        persisted3 = structuredClone(value)
      },
    },
    () => randomUUID(),
  )
  clients.push(client3)
  await client3.start()
  await until(() => client3.getState().ready, 'second device ready')
  await until(async () => {
    try {
      await engines[1].identity(sessions[0].matrixUserId, third.id)
      await engines[0].identity(sessions[0].matrixUserId, third.id)
      return true
    } catch {
      return false
    }
  }, 'peer and sibling discover the second device')
  const textC = `Para os dois aparelhos ${run}`
  await clients[1].send(textC)
  await until(
    () =>
      [clients[0], client3].every((client) =>
        client.getState().messages.some((message) => message.text === textC),
      ),
    'peer message readable on both devices of the account',
  )
  const textD = `Enviada pelo segundo aparelho ${run}`
  await client3.send(textD)
  await until(
    () =>
      [clients[0], clients[1]].every((client) =>
        client.getState().messages.some((message) => message.text === textD),
      ),
    'second device message readable by sibling and peer',
  )
  assert.equal(
    clients[0].getState().messages.find((message) => message.text === textD)
      .sender,
    'self',
    'A message from my other device is shown as mine',
  )
  assert.ok(
    clients[1]
      .getState()
      .notices.some(
        (notice) => notice.kind === 'device-added' && notice.deviceId === third.id,
      ),
    'The peer is told that a new device appeared',
  )
  await request(a, `/chat/devices/${third.id}`, 'DELETE', undefined, 200)
  await request(thirdActor, '/chat/sync', 'GET', undefined, 401)
  await client3.stop()
  clients.pop()
  console.log(
    'PASS: a second approved device reads and writes the same encrypted conversation; revocation cuts its access',
  )
  await request(
    a,
    `/${direct.id}/chat/messages/${randomUUID()}`,
    'PUT',
    {
      revision: transport.revision,
      content: { body: 'plaintext is rejected' },
    },
    400,
  )
  await request(outsider, `/${direct.id}/chat/messages`, 'GET', undefined, 404)
  const originalTxn = clients[0]
    .getState()
    .messages.find((message) => message.text === textA).txnId
  assert.ok(originalTxn)
  const replay = await request(
    a,
    `/${direct.id}/chat/messages/${originalTxn}`,
    'PUT',
    { revision: transport.revision, content: event.content },
  )
  assert.equal(
    replay.event_id,
    event.event_id,
    'Transaction retries do not duplicate a message',
  )
  await request(b, `/blocks/${a.id}`, 'POST', {}, 201, false)
  await request(
    a,
    `/${direct.id}/chat/messages/${randomUUID()}`,
    'PUT',
    { revision: transport.revision, content: event.content },
    403,
  )
  await request(
    b,
    `/${direct.id}/chat/receipts`,
    'POST',
    { eventIds: [event.event_id], read: false },
    403,
  )
  assert.equal((await request(a, `/${direct.id}/chat`)).canSend, false)
  assert.equal(
    (await request(a, `/${direct.id}/chat/messages`)).chunk.length,
    4,
    'Blocking preserves previous encrypted history',
  )
  console.log(
    `PASS: ${checks} real HTTP operations; encrypted text in both directions, Unicode, no plaintext transport persistence, idempotency, history and blocking verified.`,
  )
})()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    for (const client of clients) await client.stop()
    for (const engine of engines) engine.close()
    if (conversationId)
      await db.conversation.deleteMany({
        where: { id: conversationId, createdById: users[0]?.id },
      })
    await db.user.deleteMany({
      where: {
        id: { in: users.map((user) => user.id) },
        email: { startsWith: `qa-chat-text-${run}-` },
      },
    })
    await db.$disconnect()
  })
