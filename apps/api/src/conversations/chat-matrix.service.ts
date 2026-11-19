import {
  BadRequestException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac, randomBytes } from 'node:crypto'
import { JwtService } from '@nestjs/jwt'

type Json = Record<string, any>
@Injectable()
export class ChatMatrixService {
  private adminToken: string | null = null
  private starting: Promise<string> | null = null
  private readonly provisioned = new Set<string>()
  private readonly joined = new Set<string>()
  constructor(private readonly config: ConfigService) {}

  enabled() {
    return (
      this.config.get('CHAT_TEXT_ENABLED') === 'true' &&
      this.config.get('CONVERSATIONS_ENABLED') === 'true'
    )
  }
  serverName() {
    return this.config.getOrThrow<string>('CHAT_MATRIX_SERVER_NAME')
  }
  userId(userId: string) {
    return `@votz_${userId.replace(/-/g, '')}:${this.serverName()}`
  }
  async request(
    path: string,
    method = 'GET',
    body?: unknown,
    token?: string,
    timeout = 10000,
  ): Promise<Json> {
    const base = this.config
      .getOrThrow<string>('CHAT_MATRIX_URL')
      .replace(/\/$/, '')
    if (
      !base.startsWith('https://') &&
      !(
        this.config.get('NODE_ENV') !== 'production' &&
        /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)
      )
    )
      throw new ServiceUnavailableException(
        'Configure HTTPS para o mensageiro.',
      )
    try {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
        redirect: 'error',
      })
      const data = (await response.json()) as Json
      if (!response.ok)
        throw new HttpException(
          {
            message: 'O mensageiro não conseguiu concluir a operação.',
            errcode:
              typeof data.errcode === 'string' ? data.errcode : 'M_UNKNOWN',
            ...(response.status === 429 && Number.isFinite(data.retry_after_ms)
              ? { retryAfterMs: data.retry_after_ms }
              : {}),
          },
          response.status,
        )
      return data
    } catch (error) {
      if (error instanceof HttpException) throw error
      throw new ServiceUnavailableException(
        'O mensageiro está temporariamente indisponível.',
      )
    }
  }
  async login(localpart: string, deviceId: string) {
    const jwt = new JwtService({
      secret: this.config.getOrThrow<string>('CHAT_MATRIX_JWT_SECRET'),
    })
    const token = jwt.sign(
      { sub: localpart },
      {
        algorithm: 'HS256',
        expiresIn: '30s',
        issuer: 'votz-chat',
        audience: 'votz-matrix',
      },
    )
    return this.request('/_matrix/client/v3/login', 'POST', {
      type: 'org.matrix.login.jwt',
      token,
      device_id: deviceId,
      initial_device_display_name: 'Votz',
    })
  }
  async admin(): Promise<string> {
    if (this.adminToken) return this.adminToken
    if (!this.starting)
      this.starting = (async () => {
        const username = 'votz_service'
        const { nonce } = await this.request('/_synapse/admin/v1/register')
        const password = randomBytes(48).toString('hex')
        const mac = createHmac(
          'sha1',
          this.config.getOrThrow<string>('CHAT_MATRIX_REGISTRATION_SECRET'),
        )
          .update([nonce, username, password, 'admin'].join('\0'))
          .digest('hex')
        try {
          await this.request('/_synapse/admin/v1/register', 'POST', {
            nonce,
            username,
            password,
            admin: true,
            mac,
            inhibit_login: true,
          })
        } catch (error) {
          if (
            !(error instanceof HttpException) ||
            (error.getResponse() as Json).errcode !== 'M_USER_IN_USE'
          )
            throw error
        }
        const session = await this.login(username, 'VOTZ-SERVICE')
        if (typeof session.access_token !== 'string')
          throw new ServiceUnavailableException()
        this.adminToken = session.access_token
        return this.adminToken
      })().finally(() => {
        this.starting = null
      })
    return this.starting
  }
  async provision(userId: string) {
    if (this.provisioned.has(userId)) return
    const token = await this.admin()
    await this.request(
      `/_synapse/admin/v2/users/${encodeURIComponent(this.userId(userId))}`,
      'PUT',
      { admin: false, displayname: 'Votz', logout_devices: false },
      token,
    )
    this.provisioned.add(userId)
  }
  async room(conversationId: string, userIds: string[]) {
    const token = await this.admin()
    for (const userId of userIds) await this.provision(userId)
    const alias = `#votz_${conversationId}:${this.serverName()}`
    let roomId: string
    try {
      roomId = (
        await this.request(
          `/_matrix/client/v3/directory/room/${encodeURIComponent(alias)}`,
          'GET',
          undefined,
          token,
        )
      ).room_id
    } catch (error) {
      if (!(error instanceof HttpException) || error.getStatus() !== 404)
        throw error
      try {
        roomId = (
          await this.request(
            '/_matrix/client/v3/createRoom',
            'POST',
            {
              room_alias_name: `votz_${conversationId}`,
              visibility: 'private',
              preset: 'private_chat',
              initial_state: [
                {
                  type: 'm.room.encryption',
                  state_key: '',
                  content: {
                    algorithm: 'm.megolm.v1.aes-sha2',
                    rotation_period_msgs: 100,
                    rotation_period_ms: 86400000,
                  },
                },
                {
                  type: 'm.room.history_visibility',
                  state_key: '',
                  content: { history_visibility: 'joined' },
                },
              ],
              // Room v12 grants the creator implicit authority; listing it in users is invalid.
              power_level_content_override: {
                users: {},
                users_default: 0,
                events_default: 100,
                state_default: 100,
                invite: 100,
                kick: 100,
                ban: 100,
                redact: 100,
                events: { 'm.room.encrypted': 0 },
              },
            },
            token,
          )
        ).room_id
      } catch (creationError) {
        if (
          !(creationError instanceof HttpException) ||
          (creationError.getResponse() as Json).errcode !== 'M_ROOM_IN_USE'
        )
          throw creationError
        roomId = (
          await this.request(
            `/_matrix/client/v3/directory/room/${encodeURIComponent(alias)}`,
            'GET',
            undefined,
            token,
          )
        ).room_id
      }
    }
    if (typeof roomId !== 'string') throw new BadRequestException()
    for (const userId of userIds) await this.join(roomId, userId)
    return roomId
  }
  async join(roomId: string, userId: string) {
    const key = `${roomId}|${userId}`
    if (this.joined.has(key)) return
    const token = await this.admin()
    await this.provision(userId)
    try {
      await this.request(
        `/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`,
        'POST',
        { user_id: this.userId(userId) },
        token,
      )
    } catch (error) {
      if (!(error instanceof HttpException) || error.getStatus() !== 403)
        throw error
    }
    this.joined.add(key)
  }
  async kick(roomId: string, userId: string) {
    this.joined.delete(`${roomId}|${userId}`)
    const token = await this.admin()
    try {
      await this.request(
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/kick`,
        'POST',
        { user_id: this.userId(userId), reason: 'removed' },
        token,
      )
    } catch (error) {
      if (
        !(error instanceof HttpException) ||
        ![403, 404].includes(error.getStatus())
      )
        throw error
    }
  }
}
