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

function fixture() {
  let trusted = false
  let requests = []
  const network = [], acknowledged = []
  const key = { id: 'encrypted-key', kind: 'to_device', body: JSON.stringify({ event_type: 'm.room.encrypted', txn_id: 'stable-key-transaction', messages: { '@peer:test': { PEER: { algorithm: 'm.olm.v1.curve25519-aes-sha2', ciphertext: {} } } } }) }
  const sdk = {
    asCryptoScopeId: value => value,
    shareScopeKey: async () => { requests = [{ id: 'query', kind: 'keys_query', body: JSON.stringify({ device_keys: { '@peer:test': [] } }) }, key] },
    receiveSyncChanges: async () => {},
    takeOutgoingRequests: async () => [...requests],
    getDeviceStatuses: async () => [{ deviceId: 'PEER', trust: trusted ? 'verified' : 'unverified' }],
    markRequestSent: async id => { acknowledged.push(id); requests = requests.filter(row => row.id !== id) },
    markRequestFailed: async () => {},
  }
  const client = new NativeChatCrypto(sdk)
  const http = async (url, method, body) => { network.push({ url, method, body }); return {} }
  return { client, http, network, acknowledged, trust: () => { trusted = true }, add: value => { requests.push(value) } }
}
test('native discovery may query keys but cannot distribute room keys before SAS trust', async () => {
  const f = fixture()
  await f.client.track('@peer:test', '!authorized:test')
  await f.client.pump(f.http)
  assert.deepEqual(f.acknowledged, ['query'])
  assert.deepEqual(f.network.map(row => row.url), ['/chat/keys/query'])
  // Deferred SDK requests remain outstanding and are not reported sent/failed.
  await f.client.pump(f.http)
  assert.equal(f.network.length, 1)
  f.trust()
  await f.client.pump(f.http)
  assert.deepEqual(f.acknowledged, ['query', 'encrypted-key'])
  assert.equal(f.network[1].url, '/chat/to-device/m.room.encrypted/stable-key-transaction')
})
test('verification negotiations remain available while encrypted key delivery is deferred', async () => {
  const f = fixture()
  await f.client.track('@peer:test', '!authorized:test')
  f.add({ id: 'sas', kind: 'to_device', body: JSON.stringify({ eventType: 'm.key.verification.request', txnId: 'sas-request', messages: { '@peer:test': { PEER: { transaction_id: 'public-flow' } } } }) })
  await f.client.pump(f.http)
  assert.ok(f.acknowledged.includes('sas'))
  assert.equal(f.acknowledged.includes('encrypted-key'), false)
})
test('a verified but unrelated recipient does not receive a deferred key', async () => {
  const f = fixture()
  f.trust()
  f.add({ id: 'outsider-key', kind: 'to_device', body: JSON.stringify({ event_type: 'm.room.encrypted', txn_id: 'unrelated', messages: { '@outsider:test': { PEER: {} } } }) })
  await f.client.pump(f.http)
  assert.equal(f.network.length, 0)
  assert.equal(f.acknowledged.length, 0)
  await assert.rejects(f.client.track('@peer:test'), /autorizada/)
})
