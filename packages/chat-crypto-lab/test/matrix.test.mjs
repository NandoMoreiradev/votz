// Protocol evaluation only. The in-memory key relay is not a production transport.
import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import {
  initAsync,
  OlmMachine,
  UserId,
  DeviceId,
  RoomId,
  RequestType,
  EncryptionSettings,
  EncryptionAlgorithm,
  DeviceLists,
  DecryptionSettings,
  TrustRequirement,
} from '@matrix-org/matrix-sdk-crypto-wasm'

await initAsync()

async function setup() {
  const machines = new Map()
  const devices = new Map()
  const transcript = []
  async function create(name) {
    const userId = `@${name}:votz.test`
    const machine = await OlmMachine.initialize(
      new UserId(userId),
      new DeviceId(name.toUpperCase()),
    )
    machines.set(userId, machine)
    return { userId, machine }
  }
  async function send(actor, request) {
    const body = JSON.parse(request.body)
    transcript.push(body)
    let response = {}
    if (request.type === RequestType.KeysUpload) {
      const current = devices.get(actor.userId) || { keys: {}, oneTimeKeys: {} }
      if (body.device_keys) current.keys[body.device_keys.device_id] = body.device_keys
      const device = Object.keys(current.keys)[0]
      current.oneTimeKeys[device] = { ...current.oneTimeKeys[device], ...body.one_time_keys }
      devices.set(actor.userId, current)
      response = {
        one_time_key_counts: { signed_curve25519: Object.keys(current.oneTimeKeys[device]).length },
      }
    } else if (request.type === RequestType.KeysQuery) {
      response = {
        device_keys: Object.fromEntries(
          Object.keys(body.device_keys).map((userId) => [userId, devices.get(userId)?.keys || {}]),
        ),
        failures: {},
      }
    } else if (request.type === RequestType.KeysClaim) {
      const keys = {}
      for (const [userId, requested] of Object.entries(body.one_time_keys)) {
        keys[userId] = {}
        for (const deviceId of Object.keys(requested)) {
          const available = devices.get(userId).oneTimeKeys[deviceId]
          const keyId = Object.keys(available)[0]
          assert.ok(keyId, 'The SDK needs a one-time key for this device')
          keys[userId][deviceId] = { [keyId]: available[keyId] }
          delete available[keyId]
        }
      }
      response = { one_time_keys: keys, failures: {} }
    } else if (request.type === RequestType.ToDevice) {
      for (const [userId, payloads] of Object.entries(body.messages)) {
        const target = machines.get(userId)
        assert.ok(target)
        for (const content of Object.values(payloads)) {
          await target.receiveSyncChanges(
            JSON.stringify([{ type: request.event_type, sender: actor.userId, content }]),
            new DeviceLists(),
            new Map(),
          )
        }
      }
    } else throw new Error(`Unexpected SDK request type: ${request.type}`)
    await actor.machine.markRequestAsSent(request.id, request.type, JSON.stringify(response))
  }
  async function drain(actor) {
    for (let round = 0; round < 5; round++) {
      const requests = await actor.machine.outgoingRequests()
      if (!requests.length) return
      for (const request of requests) await send(actor, request)
    }
    throw new Error('SDK queue did not settle')
  }
  return {
    create,
    send,
    drain,
    transcript,
    close: () => {
      for (const machine of machines.values()) machine.close()
    },
  }
}

test('Matrix SDK exchanges encrypted keys and rejects outsiders, wrong rooms and ciphertext tampering', async () => {
  const relay = await setup()
  try {
    const alice = await relay.create('alice')
    const bob = await relay.create('bob')
    const outsider = await relay.create('outsider')
    for (const actor of [alice, bob, outsider]) await relay.drain(actor)
    await alice.machine.updateTrackedUsers([new UserId(bob.userId)])
    await relay.drain(alice)
    const claim = await alice.machine.getMissingSessions([new UserId(bob.userId)])
    if (claim) await relay.send(alice, claim)
    const settings = new EncryptionSettings()
    settings.algorithm = EncryptionAlgorithm.MegolmV1AesSha2
    const room = '!conversation:votz.test'
    for (const request of await alice.machine.shareRoomKey(
      new RoomId(room),
      [new UserId(bob.userId)],
      settings,
    ))
      await relay.send(alice, request)
    const secret = `Texto privado ${randomUUID()}`
    const content = JSON.parse(
      await alice.machine.encryptRoomEvent(
        new RoomId(room),
        'm.room.message',
        JSON.stringify({ msgtype: 'm.text', body: secret }),
      ),
    )
    relay.transcript.push(content)
    const event = {
      event_id: `$${randomUUID()}`,
      sender: alice.userId,
      origin_server_ts: Date.now(),
      type: 'm.room.encrypted',
      content,
    }
    // This lab intentionally permits unverified devices to isolate the transport proof.
    // Production must add verification/recovery policies before using this SDK.
    const decrypt = (actor, value, roomId = room) =>
      actor.machine.decryptRoomEvent(
        JSON.stringify(value),
        new RoomId(roomId),
        new DecryptionSettings(TrustRequirement.Untrusted),
      )
    const decrypted = await decrypt(bob, event)
    assert.equal(JSON.parse(decrypted.event).content.body, secret)
    assert.equal(
      JSON.stringify(relay.transcript).includes(secret),
      false,
      'Relay only sees public keys and encrypted events',
    )
    await assert.rejects(
      decrypt(outsider, event),
      'A device outside the conversation has no session key',
    )
    await assert.rejects(
      decrypt(bob, event, '!other:votz.test'),
      'Ciphertext cannot be moved to another room',
    )
    const damaged = structuredClone(event)
    const position = Math.floor(damaged.content.ciphertext.length / 2)
    const original = damaged.content.ciphertext[position]
    damaged.content.ciphertext =
      damaged.content.ciphertext.slice(0, position) +
      (original === 'A' ? 'B' : 'A') +
      damaged.content.ciphertext.slice(position + 1)
    await assert.rejects(decrypt(bob, damaged), 'Altered ciphertext must fail authentication')
  } finally {
    relay.close()
  }
})

test('Rotating the SDK room session after removal prevents the removed device from reading future messages', async () => {
  const relay = await setup()
  try {
    const alice = await relay.create('alice')
    const bob = await relay.create('bob')
    const carol = await relay.create('carol')
    for (const actor of [alice, bob, carol]) await relay.drain(actor)
    await alice.machine.updateTrackedUsers([new UserId(bob.userId), new UserId(carol.userId)])
    await relay.drain(alice)
    const missing = await alice.machine.getMissingSessions([
      new UserId(bob.userId),
      new UserId(carol.userId),
    ])
    if (missing) await relay.send(alice, missing)
    const room = '!group:votz.test'
    const share = async (members) => {
      const settings = new EncryptionSettings()
      settings.algorithm = EncryptionAlgorithm.MegolmV1AesSha2
      for (const request of await alice.machine.shareRoomKey(
        new RoomId(room),
        members.map((actor) => new UserId(actor.userId)),
        settings,
      ))
        await relay.send(alice, request)
    }
    const encrypt = async (text) => ({
      event_id: `$${randomUUID()}`,
      sender: alice.userId,
      origin_server_ts: Date.now(),
      type: 'm.room.encrypted',
      content: JSON.parse(
        await alice.machine.encryptRoomEvent(
          new RoomId(room),
          'm.room.message',
          JSON.stringify({ msgtype: 'm.text', body: text }),
        ),
      ),
    })
    const decrypt = async (actor, event) =>
      JSON.parse(
        (
          await actor.machine.decryptRoomEvent(
            JSON.stringify(event),
            new RoomId(room),
            new DecryptionSettings(TrustRequirement.Untrusted),
          )
        ).event,
      ).content.body
    await share([bob, carol])
    const before = await encrypt('Antes da remoção')
    assert.equal(await decrypt(bob, before), 'Antes da remoção')
    assert.equal(await decrypt(carol, before), 'Antes da remoção')
    assert.equal(await alice.machine.invalidateGroupSession(new RoomId(room)), true)
    await share([carol])
    const after = await encrypt('Depois da remoção')
    assert.notEqual(after.content.session_id, before.content.session_id)
    assert.equal(await decrypt(carol, after), 'Depois da remoção')
    await assert.rejects(
      decrypt(bob, after),
      'The removed participant must not receive the new room key',
    )
    assert.equal(
      await decrypt(bob, before),
      'Antes da remoção',
      'Removal does not erase knowledge of earlier messages',
    )
  } finally {
    relay.close()
  }
})
