// Transport policy tests with an explicit SDK double, not cryptographic proofs.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('../../../node_modules/typescript')
global.__DEV__ = false
const filename = path.resolve(__dirname, '../src/lib/chat-crypto.ts')
const adapter = new Module(filename, module)
adapter.filename = filename
adapter.paths = Module._nodeModulePaths(path.dirname(filename))
adapter._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
const { NativeChatCrypto } = adapter.exports

const keyFor = (messages, id = 'encrypted-key') => ({
  id,
  kind: 'to_device',
  body: JSON.stringify({ event_type: 'm.room.encrypted', txn_id: `txn-${id}`, messages }),
})
const olm = { algorithm: 'm.olm.v1.curve25519-aes-sha2', ciphertext: {} }
function fixture() {
  let requests = []
  const network = [], acknowledged = [], shared = [], discarded = []
  let statuses = [], reply = {}
  const sdk = {
    asCryptoScopeId: value => value,
    shareScopeKey: async (_scope, users) => { shared.push(users); requests = [{ id: 'query', kind: 'keys_query', body: JSON.stringify({ device_keys: { '@peer:test': [] } }) }, ...requests.filter(row => row.id !== 'query')] },
    discardScopeKey: async scope => { discarded.push(scope); return true },
    receiveSyncChanges: async () => {},
    takeOutgoingRequests: async () => [...requests],
    getDeviceStatuses: async () => statuses,
    // Comportamento real da ponte: só a identidade da própria máquina.
    getDeviceIdentityKeys: async () => { throw Object.assign(new Error('identifiers do not match the active machine'), { kind: 'malformed_identifier' }) },
    markRequestSent: async id => { acknowledged.push(id); requests = requests.filter(row => row.id !== id) },
    markRequestFailed: async () => {},
  }
  const client = new NativeChatCrypto(sdk)
  const http = async (url, method, body) => { network.push({ url, method, body }); return reply }
  return { client, http, network, acknowledged, shared, discarded, add: value => { requests.push(value) }, setStatuses: value => { statuses = value }, respond: value => { reply = value } }
}

test('key discovery flows, but room keys never reach a device outside the trust policy', async () => {
  const f = fixture()
  await f.client.track('@peer:test', '!authorized:test')
  f.add(keyFor({ '@peer:test': { PEER: olm } }))
  await f.client.pump(f.http)
  assert.deepEqual(f.network.map(row => row.url), ['/chat/keys/query'])
  // Dropped locally: nothing went to the network and the SDK is not left waiting.
  assert.ok(f.acknowledged.includes('encrypted-key'))
  f.client.trust('@peer:test', ['PEER'])
  f.add(keyFor({ '@peer:test': { PEER: olm } }, 'after-trust'))
  await f.client.pump(f.http)
  assert.equal(f.network.at(-1).url, '/chat/to-device/m.room.encrypted/txn-after-trust')
})

test('a mixed batch reaches only the trusted devices, including my other devices', async () => {
  const f = fixture()
  f.client.trust('@peer:test', ['PEER'])
  f.client.trust('@self:test', ['OTHER'])
  f.add(keyFor({
    '@peer:test': { PEER: olm, NEW_UNTRUSTED: olm },
    '@self:test': { OTHER: olm, GHOST: olm },
  }))
  await f.client.pump(f.http)
  assert.deepEqual(JSON.parse(JSON.stringify(f.network[0].body.messages)), {
    '@peer:test': { PEER: olm },
    '@self:test': { OTHER: olm },
  })
})

test('verification negotiations are not gated by the trust policy', async () => {
  const f = fixture()
  f.add({ id: 'sas', kind: 'to_device', body: JSON.stringify({ eventType: 'm.key.verification.request', txnId: 'sas-request', messages: { '@peer:test': { PEER: { transaction_id: 'public-flow' } } } }) })
  await f.client.pump(f.http)
  assert.ok(f.acknowledged.includes('sas'))
  assert.equal(f.network[0].url, '/chat/to-device/m.key.verification.request/sas-request')
})

test('an unrelated or unknown recipient never reaches the network', async () => {
  const f = fixture()
  f.client.trust('@peer:test', ['PEER'])
  f.add(keyFor({ '@outsider:test': { PEER: olm } }, 'outsider-key'))
  await f.client.pump(f.http)
  assert.equal(f.network.length, 0)
  await assert.rejects(f.client.track('@peer:test'), /autorizada/)
})

test('sharing names every user of the policy and rotating discards the room session', async () => {
  const f = fixture()
  await f.client.share('!room:test', ['@peer:test', '@self:test'])
  assert.deepEqual(f.shared[0], ['@peer:test', '@self:test'])
  await f.client.rotate('!room:test')
  assert.deepEqual(f.discarded, ['!room:test'])
})

test("another person's device identity comes from the key query the engine accepted", async () => {
  const f = fixture()
  const entry = (id) => ({ keys: { [`curve25519:${id}`]: `curve-${id}`, [`ed25519:${id}`]: `ed-${id}` } })
  f.setStatuses([{ deviceId: 'PEER', trust: 'unverified' }])
  f.respond({ device_keys: { '@peer:test': { PEER: entry('PEER'), GHOST: entry('GHOST') } } })
  f.add({ id: 'q', kind: 'keys_query', body: JSON.stringify({ device_keys: { '@peer:test': [] } }) })
  await f.client.pump(f.http)
  assert.deepEqual(await f.client.identity('@peer:test', 'PEER'), { curve25519: 'curve-PEER', ed25519: 'ed-PEER' })
  // O motor não aceitou GHOST: a resposta do servidor sozinha não vale.
  await assert.rejects(f.client.identity('@peer:test', 'GHOST'))
  // Quando o motor deixa de listar o aparelho, a identidade guardada deixa de valer.
  f.setStatuses([])
  await assert.rejects(f.client.identity('@peer:test', 'PEER'))
})
