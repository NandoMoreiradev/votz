import { createHash, randomUUID } from 'node:crypto'
import { GoneException, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

export interface FeedEntry {
  id: string
  repostId?: string | null
  reason?: string | null
}

export interface RecentCursor {
  kind: 'recent'
  asOf: string
  before: { createdAt: string; id: string }
  total: number
}

interface FeedSnapshot {
  kind: 'snapshot'
  total: number
}

export type FeedCursorState = RecentCursor | FeedSnapshot

const TTL_SECONDS = 15 * 60
const CURSOR_FORMAT = /^([0-9a-f-]{36})\.(\d{1,10})\.([1-9]\d{0,9})$/
const redisKey = (id: string) => `posts:cursor:v1:{${id}}`
const entryKey = (id: string) => `${redisKey(id)}:entries`

export function feedCursorScope(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('base64url')
}

@Injectable()
export class FeedCursorService implements OnModuleDestroy {
  private readonly redis: Redis | null

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL')?.trim()
    this.redis = url ? new Redis(url, {
      connectTimeout: 500,
      commandTimeout: 300,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    }) : null
    this.redis?.on('error', () => undefined)
  }

  onModuleDestroy() {
    this.redis?.disconnect()
  }

  async saveRecent(scope: string, state: RecentCursor, page: number): Promise<string> {
    const id = randomUUID()
    await this.useRedis((redis) => redis.set(redisKey(id), JSON.stringify({ scope, state }), 'EX', TTL_SECONDS))
    return this.position(id, 0, page)
  }

  async saveSnapshot(scope: string, entries: FeedEntry[], offset: number): Promise<string> {
    const id = randomUUID()
    const state: FeedSnapshot = { kind: 'snapshot', total: entries.length }
    await this.useRedis(async (redis) => {
      const commands = redis.multi()
      for (let start = 0; start < entries.length; start += 500) {
        commands.rpush(entryKey(id), ...entries.slice(start, start + 500).map((entry) => JSON.stringify(entry)))
      }
      commands.expire(entryKey(id), TTL_SECONDS)
      commands.set(redisKey(id), JSON.stringify({ scope, state }), 'EX', TTL_SECONDS)
      const results = await commands.exec()
      if (!results || results.some(([error]) => error)) throw new Error('Não foi possível salvar a sequência do feed')
    })
    return this.position(id, offset, 2)
  }

  async entries(id: string, offset: number, count: number): Promise<FeedEntry[]> {
    const rows = await this.useRedis((redis) => redis.lrange(entryKey(id), offset, offset + count - 1))
    if (rows.length !== count) throw this.expired()
    return rows.map((row) => JSON.parse(row) as FeedEntry)
  }

  position(id: string, offset: number, page: number): string {
    return `${id}.${offset}.${page}`
  }

  async read(cursor: string, scope: string): Promise<{ id: string; offset: number; page: number; state: FeedCursorState }> {
    const match = CURSOR_FORMAT.exec(cursor)
    if (!match) throw this.expired()
    const [, id, rawOffset, rawPage] = match
    const value = await this.useRedis((redis) => redis.get(redisKey(id)))
    if (!value) throw this.expired()
    const stored = JSON.parse(value) as { scope: string; state: FeedCursorState }
    const offset = Number(rawOffset)
    if (stored.scope !== scope || (stored.state.kind === 'snapshot' && offset >= stored.state.total) ||
        (stored.state.kind === 'recent' && offset !== 0)) throw this.expired()
    return { id, offset, page: Number(rawPage), state: stored.state }
  }

  private expired() {
    return new GoneException('A lista de publicações expirou. Atualize o feed para continuar.')
  }

  private async useRedis<T>(command: (redis: Redis) => Promise<T>): Promise<T> {
    if (this.redis) {
      try {
        return await command(this.redis)
      } catch {
        // O cursor precisa continuar apontando para a mesma sequência, inclusive entre instâncias.
      }
    }
    throw new ServiceUnavailableException('Não foi possível continuar o feed agora. Tente novamente.')
  }
}
