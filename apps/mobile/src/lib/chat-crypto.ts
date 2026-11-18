import type {
  ChatCrypto,
  ChatHttp,
  ChatPeer,
  ChatVerification,
  Json,
  VerificationAction,
} from '@votz/chat-core'
import type * as Native from 'react-native-matrix-crypto'

type CryptoModule = typeof Native
/** Load only when the messenger is opened; old development APKs fail with a useful message. */
export class NativeChatCrypto implements ChatCrypto {
  private flows = new Map<
    string,
    { id: string; incoming: boolean; material?: Native.SasMaterial }
  >()
  private unsubscribe: (() => void) | null = null
  private sharing: { roomId: string; userId: string } | null = null
  private tracked = new Set<string>()
  private constructor(private readonly module: CryptoModule) {}
  private async trace(value: Record<string, unknown>) {
    if (!__DEV__) return
    try {
      const { File, Paths } = await import('expo-file-system')
      new File(Paths.cache, 'votz-chat-diagnostic.json').write(JSON.stringify(value))
    } catch {}
  }
  static async open(config: Native.CryptoMachineConfig, existing = false) {
    let module: CryptoModule
    try {
      module = await import('react-native-matrix-crypto')
    } catch {
      throw new Error(
        'Instale a nova build do Votz para ativar as conversas protegidas.',
      )
    }
    const adapter = new NativeChatCrypto(module)
    if (existing) await module.openCryptoStore(config)
    else await module.createCryptoMachine(config)
    adapter.unsubscribe = module.onCryptoSignal((signal) => {
      if (signal.kind === 'verification_requested')
        adapter.flows.set(`${signal.user}:${signal.device}`, {
          id: signal.verificationId,
          incoming: true,
        })
    })
    return adapter
  }
  close() {
    this.unsubscribe?.()
    this.flows.clear()
  }
  async track(userId: string, roomId?: string) {
    if (!roomId) throw new Error('A conversa precisa estar autorizada antes de descobrir dispositivos.')
    if (!this.tracked.has(userId)) {
      // This bridge exposes tracking only through shareScopeKey. On a restored
      // store it may also queue room keys: pump MUST retain those locally until
      // every recipient device is explicitly verified. Never acknowledge a
      // deferred request as sent, and never use a fabricated discovery room.
      await this.module.shareScopeKey(this.module.asCryptoScopeId(roomId), [userId])
      this.tracked.add(userId)
    }
    await this.module.receiveSyncChanges({
      changed_devices: { changed: [userId], left: [] },
    })
  }
  async receive(sync: Json) {
    await this.module.receiveSyncChanges(this.module.encryptionSlice(sync))
    for (const flow of this.flows.values()) {
      const stage = await this.module
        .getVerificationStage(flow.id)
        .catch(() => null)
      if (stage === 'ready' && !flow.incoming)
        await this.module.startVerificationComparison(flow.id)
      else if (stage === 'started' && flow.incoming)
        await this.module.acceptVerification(flow.id)
    }
  }
  async pump(http: ChatHttp) {
    for (let round = 0; round < 8; round++) {
      const requests = await this.module.takeOutgoingRequests()
      if (!requests.length) {
        if (this.sharing) {
          const { roomId, userId } = this.sharing
          await this.module.shareScopeKey(this.module.asCryptoScopeId(roomId), [
            userId,
          ])
          this.sharing = null
          continue
        }
        return
      }
      let progressed = false
      for (const request of requests) {
        const body = JSON.parse(request.body)
        await this.trace({ stage: 'outgoing', kind: request.kind, fields: Object.keys(body) })
        if (__DEV__) console.debug('[chat.crypto] outgoing', request.kind, Object.keys(body))
        let response: Json
        try {
          if (request.kind === 'keys_upload')
            response = await http('/chat/keys/upload', 'POST', body)
          else if (request.kind === 'keys_query')
            response = await http('/chat/keys/query', 'POST', body)
          else if (request.kind === 'keys_claim')
            response = await http('/chat/keys/claim', 'POST', body)
          else if (request.kind === 'to_device') {
            const eventType = body.event_type ?? body.eventType
            const txn = body.txn_id ?? body.txnId
            if (
              typeof eventType !== 'string' ||
              typeof txn !== 'string' ||
              !body.messages
            )
              throw new Error('Envelope inválido do motor de criptografia.')
            if (eventType === 'm.room.encrypted' || eventType === 'm.room_key.withheld') {
              let trusted = true
              for (const [userId, devices] of Object.entries(body.messages) as [string, Json][]) {
                for (const deviceId of Object.keys(devices)) {
                  if (!this.tracked.has(userId) || !await this.verified(userId, deviceId)) trusted = false
                }
              }
              if (!trusted) continue
            }
            response = await http(
              `/chat/to-device/${encodeURIComponent(eventType)}/${encodeURIComponent(txn)}`,
              'PUT',
              { messages: body.messages },
            )
          } else
            throw new Error(
              `Operação de criptografia ainda não suportada: ${request.kind}`,
            )
          await this.module.markRequestSent(
            request.id,
            JSON.stringify(response),
          )
          progressed = true
        } catch (error) {
          await this.trace({ stage: 'outgoing-failed', kind: request.kind, eventType: body.event_type ?? body.eventType, fields: Object.keys(body), payloads: Object.values(body.messages || {}).flatMap(value => Object.values(value as Json).map(content => ({ fields: Object.keys(content as Json), algorithm: (content as Json).algorithm, code: (content as Json).code }))), errorKind: (error as { kind?: string }).kind, name: (error as Error).name })
          if (__DEV__) console.warn('[chat.crypto] outgoing failure', request.kind, (error as { kind?: string }).kind || (error as Error).name)
          const status = (error as { status?: number })?.status || 0
          await this.module
            .markRequestFailed(request.id, status)
            .catch(() => {})
          throw error
        }
      }
      if (!progressed) return
    }
    throw new Error('Não foi possível concluir a troca de chaves.')
  }
  async verified(userId: string, deviceId: string) {
    return (await this.module.getDeviceStatuses(userId)).some(
      (device) => device.deviceId === deviceId && device.trust === 'verified',
    )
  }
  identity(userId: string, deviceId: string) {
    return this.module.getDeviceIdentityKeys(userId, deviceId)
  }
  async share(roomId: string, userId: string) {
    await this.module.shareScopeKey(this.module.asCryptoScopeId(roomId), [
      userId,
    ])
    // A new peer needs claim -> second share -> encrypted key delivery.
    // The native bridge explicitly requires both calls, separated by the pump.
    this.sharing = { roomId, userId }
  }
  async encrypt(roomId: string, text: string) {
    const event = await this.module.encryptEvent(
      this.module.asCryptoScopeId(roomId),
      'm.room.message',
      { msgtype: 'm.text', body: text },
    )
    return JSON.parse(new TextDecoder().decode(event.ciphertext)) as Json
  }
  async decrypt(roomId: string, event: Json) {
    let decrypted: Native.EventEnvelope
    try { decrypted = await this.module.decryptEvent(
      this.module.asCryptoScopeId(roomId),
      event,
    ) } catch (error) { await this.trace({ stage: 'decrypt-failed', kind: (error as { kind?: string }).kind, name: (error as Error).name }); throw error }
    const verification = decrypted.senderVerification
    if (
      !verification ||
      (verification.state === 'unverified' &&
        ['mismatched_sender', 'no_device', 'verification_violation'].includes(
          verification.reason,
        ))
    )
      { await this.trace({ stage: 'sender-rejected', state: verification?.state, reason: verification?.state === 'unverified' ? verification.reason : undefined }); throw new Error('Não foi possível autenticar o remetente.') }
    const value = JSON.parse(new TextDecoder().decode(decrypted.ciphertext))
    const content = value.content ?? value
    if (
      content?.msgtype !== 'm.text' ||
      typeof content.body !== 'string' ||
      content.body.length > 4000
    )
      throw new Error('Conteúdo de mensagem não suportado.')
    return content.body as string
  }
  private flow(peer: ChatPeer) {
    return this.flows.get(`${peer.matrixUserId}:${peer.deviceId}`)
  }
  async verification(peer: ChatPeer): Promise<ChatVerification> {
    if (
      peer.deviceId &&
      (await this.verified(peer.matrixUserId, peer.deviceId))
    )
      return { state: 'done' }
    const flow = this.flow(peer)
    if (!flow) return { state: 'none' }
    let stage: Native.VerificationStage
    try {
      stage = await this.module.getVerificationStage(flow.id)
    } catch (error) {
      if ((error as { kind?: string })?.kind === 'unknown_flow') {
        this.flows.delete(`${peer.matrixUserId}:${peer.deviceId}`)
        return { state: 'none' }
      }
      throw error
    }
    const state =
      stage === 'keys-exchanged' || stage === 'code-scanned'
        ? 'comparing'
        : stage === 'started'
          ? 'ready'
          : stage
    const result: ChatVerification = { state, incoming: flow.incoming }
    if (stage === 'keys-exchanged') {
      flow.material = await this.module.getVerificationMaterial(flow.id)
      result.decimals = flow.material.decimals
    }
    return result
  }
  async verify(peer: ChatPeer, action: VerificationAction) {
    if (!peer.deviceId)
      throw new Error('A outra pessoa ainda não ativou as conversas.')
    if (action === 'request') {
      await this.trace({ stage: 'verification-request-start' })
      let id: string
      try { id = await this.module.requestVerification(
        peer.matrixUserId,
        peer.deviceId,
      ) } catch (error) { await this.trace({ stage: 'verification-request-failed', errorKind: (error as { kind?: string }).kind, name: (error as Error).name }); throw error }
      await this.trace({ stage: 'verification-request-created' })
      this.flows.set(`${peer.matrixUserId}:${peer.deviceId}`, {
        id,
        incoming: false,
      })
      return
    }
    const flow = this.flow(peer)
    if (!flow) throw new Error('A verificação expirou. Inicie novamente.')
    if (action === 'accept') await this.module.acceptVerification(flow.id)
    if (action === 'compare')
      await this.module.startVerificationComparison(flow.id)
    if (action === 'confirm') {
      if (!flow.material)
        throw new Error('Compare os códigos antes de confirmar.')
      await this.module.confirmVerification(flow.id, flow.material)
    }
    if (action === 'cancel') await this.module.cancelVerification(flow.id)
  }
}
