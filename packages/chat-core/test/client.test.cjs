// Business/lifecycle tests only. Real cryptography is covered against Synapse separately.
const test = require('node:test')
const assert = require('node:assert/strict')
const { ChatClient } = require('../src/index.js')

function fixture(options = {}) {
  const requests = []
  let persisted = { pending: [] }
  let deny = options.deny || 0
  let savesFail = false
  const crypto = {
    track: async () => {},
    pump: async () => {},
    receive: async () => {},
    verified: async () => options.verified !== false,
    identity: async (user) => ({
      curve25519: user === '@self:test' ? 'self-key' : 'peer-key',
      ed25519: 'public-signing-key',
    }),
    share: async () => {},
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
    verification: async () => ({
      state: options.verified === false ? 'none' : 'done',
    }),
    verify: async () => {},
  }
  const room = {
    roomId: '!room:test',
    revision: 2,
    canSend: true,
    peer: { userId: 'peer', matrixUserId: '@peer:test', deviceId: 'PEER' },
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
    if (path.startsWith('/chat/sync')) return new Promise(() => {})
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
  const client = new ChatClient(
    'conversation',
    { deviceId: 'SELF', matrixUserId: '@self:test', singleDevicePilot: true },
    crypto,
    http,
    storage,
    () => 'stable-transaction',
  )
  return {
    client,
    crypto,
    room,
    storage,
    requests,
    persisted: () => persisted,
    failSaves: (value) => {
      savesFail = value
    },
    deny: (value) => {
      deny = value
    },
  }
}
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
test('an unverified sender never reaches plaintext decryption or the send transport', async () => {
  let decryptions = 0
  const f = fixture({
    verified: false,
    decrypt: () => {
      decryptions++
      return 'not allowed'
    },
    history: [
      {
        event_id: '$peer',
        sender: '@peer:test',
        type: 'm.room.encrypted',
        content: { algorithm: 'm.megolm.v1.aes-sha2', sender_key: 'peer-key' },
      },
    ],
  })
  await f.client.start()
  assert.equal(f.client.getState().messages[0].status, 'unverified')
  assert.equal(f.client.getState().messages[0].text, null)
  assert.equal(decryptions, 0)
  await assert.rejects(f.client.send('not permitted'), /Verifique a identidade/)
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
    history: [
      {
        event_id: '$forged',
        sender: '@peer:test',
        type: 'm.room.encrypted',
        content: {
          algorithm: 'm.megolm.v1.aes-sha2',
          sender_key: 'another-device-key',
        },
      },
    ],
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
  const history = [
    {
      event_id: '$received',
      sender: '@peer:test',
      type: 'm.room.encrypted',
      content: { algorithm: 'm.megolm.v1.aes-sha2', sender_key: 'peer-key' },
    },
  ]
  const f = fixture({ history })
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
    verified: false,
    readReceipts: true,
    history: [
      {
        event_id: '$untrusted',
        sender: '@peer:test',
        type: 'm.room.encrypted',
        content: { algorithm: 'm.megolm.v1.aes-sha2', sender_key: 'peer-key' },
      },
    ],
  })
  await f.client.start()
  f.client.visibleMessages(['$untrusted'])
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(f.persisted().receipts, [])
  await f.client.stop()
})
