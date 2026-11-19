import type {
  ChatCrypto,
  ChatHttp,
  ChatPeer,
  ChatVerification,
  Json,
  VerificationAction,
} from '@votz/chat-core'
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm'

/** Official Matrix state machine. Networking stays behind the authenticated Votz API. */
export class WebChatCrypto implements ChatCrypto {
  private tracked = new Set<string>()
  /** Aparelhos em que confiamos para cifrar, por usuário (política do chat-core). */
  private trusted = new Map<string, Set<string>>()
  private constructor(private readonly machine: sdk.OlmMachine) {}
  trust(userId: string, deviceIds: string[]) {
    this.trusted.set(userId, new Set(deviceIds))
  }
  async rotate(roomId: string) {
    await this.machine.invalidateGroupSession(new sdk.RoomId(roomId))
  }
  /**
   * Remove de eventos entre aparelhos todos os destinatários fora da política
   * de confiança. Devolve null quando não sobra ninguém.
   */
  private gate(eventType: string, body: Json): Json | null {
    if (eventType !== 'm.room.encrypted' && eventType !== 'm.room_key.withheld')
      return body
    const messages: Json = {}
    for (const [userId, devices] of Object.entries(body.messages || {}) as [
      string,
      Json,
    ][]) {
      const allowed = Object.fromEntries(
        Object.entries(devices).filter(([deviceId]) =>
          this.trusted.get(userId)?.has(deviceId),
        ),
      )
      if (Object.keys(allowed).length) messages[userId] = allowed
    }
    return Object.keys(messages).length ? { ...body, messages } : null
  }
  static async open(
    userId: string,
    deviceId: string,
    storeName?: string,
    passphrase?: string,
  ) {
    await sdk.initAsync()
    return new WebChatCrypto(
      await sdk.OlmMachine.initialize(
        new sdk.UserId(userId),
        new sdk.DeviceId(deviceId),
        storeName,
        passphrase,
      ),
    )
  }
  close() {
    this.machine.close()
  }
  async track(userId: string) {
    this.tracked.add(userId)
    await this.machine.updateTrackedUsers([new sdk.UserId(userId)])
  }
  async receive(sync: Json) {
    await this.machine.receiveSyncChanges(
      JSON.stringify(sync.to_device?.events || []),
      new sdk.DeviceLists(
        (sync.device_lists?.changed || []).map(
          (id: string) => new sdk.UserId(id),
        ),
        (sync.device_lists?.left || []).map((id: string) => new sdk.UserId(id)),
      ),
      new Map(
        Object.entries(sync.device_one_time_keys_count || {}) as [
          string,
          number,
        ][],
      ),
      new Set(sync.device_unused_fallback_key_types || []),
    )
    // Negotiate SAS after the request was explicitly accepted. This exchanges
    // public material only; trust still requires a human-confirmed comparison.
    for (const user of this.tracked)
      for (const flow of this.machine.getVerificationRequests(
        new sdk.UserId(user),
      )) {
        if (flow.isDone() || flow.isCancelled()) continue
        const sas = flow.getVerification()
        if (sas instanceof sdk.Sas) {
          const request = sas.accept()
          if (request) this.explicit.push(request)
        } else if (flow.isReady() && flow.weStarted()) {
          const result = await flow.startSas()
          if (result) this.explicit.push(result[1])
        }
      }
  }
  private async request(
    request: sdk.OutgoingRequest | sdk.OutgoingVerificationRequest,
    http: ChatHttp,
  ) {
    const body = JSON.parse(request.body)
    let response: Json
    if (request.type === sdk.RequestType.KeysUpload)
      response = await http('/chat/keys/upload', 'POST', body)
    else if (request.type === sdk.RequestType.KeysQuery)
      response = await http('/chat/keys/query', 'POST', body)
    else if (request.type === sdk.RequestType.KeysClaim)
      response = await http('/chat/keys/claim', 'POST', body)
    else if (request instanceof sdk.ToDeviceRequest) {
      const allowed = this.gate(request.event_type, body)
      response = allowed
        ? await http(
            `/chat/to-device/${encodeURIComponent(request.event_type)}/${encodeURIComponent(request.txn_id)}`,
            'PUT',
            allowed,
          )
        : {}
    } else throw new Error(`Unsupported encrypted SDK request ${request.type}`)
    if (request.id)
      await this.machine.markRequestAsSent(
        request.id,
        request.type,
        JSON.stringify(response),
      )
  }
  async pump(http: ChatHttp) {
    await this.drainRoomKeys(http)
    for (let round = 0; round < 8; round++) {
      const requests = await this.machine.outgoingRequests()
      if (!requests.length) return
      for (const request of requests) await this.request(request, http)
    }
    throw new Error('Encrypted SDK queue did not settle')
  }
  async verified(userId: string, deviceId: string) {
    return (
      (
        await this.machine.getDevice(
          new sdk.UserId(userId),
          new sdk.DeviceId(deviceId),
        )
      )?.isVerified() === true
    )
  }
  async identity(userId: string, deviceId: string) {
    const device = await this.machine.getDevice(
      new sdk.UserId(userId),
      new sdk.DeviceId(deviceId),
    )
    if (!device?.curve25519Key || !device.ed25519Key)
      throw new Error('Unknown sender device')
    return {
      curve25519: device.curve25519Key.toBase64(),
      ed25519: device.ed25519Key.toBase64(),
    }
  }
  async share(roomId: string, userIds: string[]) {
    const claim = await this.machine.getMissingSessions(
      userIds.map((id) => new sdk.UserId(id)),
    )
    if (claim) this.explicit.push(claim)
    // The claim must be completed before sharing; send() pumps before encrypt().
    this.sharing = { roomId, userIds }
  }
  private explicit: sdk.OutgoingRequest[] = []
  private sharing: { roomId: string; userIds: string[] } | null = null
  private flow(peer: ChatPeer) {
    const flows = this.machine
      .getVerificationRequests(new sdk.UserId(peer.matrixUserId))
      .filter((request) => request.otherDeviceId?.toString() === peer.deviceId)
    return flows[flows.length - 1]
  }
  async encrypt(roomId: string, text: string) {
    if (this.sharing || this.explicit.length)
      throw new Error('Room keys must be shared before encryption')
    return JSON.parse(
      await this.machine.encryptRoomEvent(
        new sdk.RoomId(roomId),
        'm.room.message',
        JSON.stringify({ msgtype: 'm.text', body: text }),
      ),
    ) as Json
  }
  async decrypt(roomId: string, event: Json) {
    const decrypted = await this.machine.decryptRoomEvent(
      JSON.stringify(event),
      new sdk.RoomId(roomId),
      new sdk.DecryptionSettings(sdk.TrustRequirement.Untrusted),
    )
    const content = JSON.parse(decrypted.event).content
    if (
      content?.msgtype !== 'm.text' ||
      typeof content.body !== 'string' ||
      content.body.length > 4000
    )
      throw new Error('Unsupported message content')
    return content.body as string
  }
  async verification(peer: ChatPeer): Promise<ChatVerification> {
    if (
      peer.deviceId &&
      (await this.verified(peer.matrixUserId, peer.deviceId))
    )
      return { state: 'done' }
    const flow = this.flow(peer)
    if (!flow) return { state: 'none' }
    if (flow.isCancelled() || flow.timedOut()) return { state: 'cancelled' }
    if (flow.isDone()) return { state: 'done' }
    const sas = flow.getVerification()
    if (sas instanceof sdk.Sas)
      return {
        state: sas.haveWeConfirmed()
          ? 'confirmed'
          : sas.canBePresented()
            ? 'comparing'
            : 'ready',
        incoming: !flow.weStarted(),
        ...(sas.decimals() ? { decimals: [...sas.decimals()!] } : {}),
      }
    return {
      state: flow.isReady() ? 'ready' : 'requested',
      incoming: !flow.weStarted(),
    }
  }
  async verify(peer: ChatPeer, action: VerificationAction, http: ChatHttp) {
    if (!peer.deviceId) throw new Error('The other device is not ready')
    if (action === 'request') {
      const device = await this.machine.getDevice(
        new sdk.UserId(peer.matrixUserId),
        new sdk.DeviceId(peer.deviceId),
      )
      if (!device) throw new Error('Unknown verification device')
      const [, request] = device.requestVerification([
        sdk.VerificationMethod.SasV1,
      ])
      await this.request(request, http)
      return
    }
    const flow = this.flow(peer)
    if (!flow) throw new Error('Verification expired')
    const sas = flow.getVerification()
    if (action === 'accept') {
      const request = flow.acceptWithMethods([sdk.VerificationMethod.SasV1])
      if (request) await this.request(request, http)
    }
    if (action === 'compare') {
      if (sas instanceof sdk.Sas) {
        const request = sas.accept()
        if (request) await this.request(request, http)
      } else {
        const started = await flow.startSas()
        if (started) await this.request(started[1], http)
      }
    }
    if (action === 'confirm' && sas instanceof sdk.Sas)
      for (const request of await sas.confirm())
        await this.request(request, http)
    if (action === 'cancel') {
      const request = flow.cancel()
      if (request) await this.request(request, http)
    }
  }
  async drainRoomKeys(http: ChatHttp) {
    while (this.explicit.length) {
      await this.request(this.explicit[0], http)
      this.explicit.shift()
    }
    const sharing = this.sharing
    if (sharing) {
      const settings = new sdk.EncryptionSettings()
      settings.algorithm = sdk.EncryptionAlgorithm.MegolmV1AesSha2
      // A política de confiança é aplicada por aparelho em gate(); o SDK reúne
      // todos os aparelhos e o filtro descarta os que não são confiáveis.
      settings.sharingStrategy = sdk.CollectStrategy.allDevices()
      for (const request of await this.machine.shareRoomKey(
        new sdk.RoomId(sharing.roomId),
        sharing.userIds.map((id) => new sdk.UserId(id)),
        settings,
      ))
        await this.request(request, http)
      this.sharing = null
    }
  }
}
