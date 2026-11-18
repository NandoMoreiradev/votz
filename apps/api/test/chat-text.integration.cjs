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
    `Timed out: ${label}; ${clients.map((c) => c.getState().error || c.getState().verification.state).join(' | ')}`,
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
  await request(
    a,
    '/chat/devices',
    'POST',
    { ...a.credentials, id: randomUUID() },
    409,
    false,
  )
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
    'PASS: device enrollment, ownership, replacement refusal and outsider authorization',
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
  await assert.rejects(
    clients[0].send('Cannot send before identity verification'),
  )
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
    'PASS: official Matrix SAS verified both device identities with equal codes',
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
    2,
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
