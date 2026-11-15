import { Logger, OnModuleDestroy } from '@nestjs/common'
import { ThrottlerStorage } from '@nestjs/throttler'
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface'
import Redis from 'ioredis'

interface MemoryEntry {
  totalHits: number
  expiresAt: number
  blockedUntil: number
}

const INCREMENT_LUA = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttlMs = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDurationMs = tonumber(ARGV[3])

local blockTtl = redis.call('PTTL', blockKey)
if blockTtl > 0 then
  local hits = tonumber(redis.call('GET', hitsKey) or limit)
  local hitsTtl = math.max(redis.call('PTTL', hitsKey), 0)
  return { hits, hitsTtl, 1, blockTtl }
end

local hits = redis.call('INCR', hitsKey)
if hits == 1 then
  redis.call('PEXPIRE', hitsKey, ttlMs)
end

local hitsTtl = redis.call('PTTL', hitsKey)
if hitsTtl < 0 then
  redis.call('PEXPIRE', hitsKey, ttlMs)
  hitsTtl = ttlMs
end

if hits > limit and blockDurationMs > 0 then
  redis.call('SET', blockKey, '1', 'PX', blockDurationMs)
  return { hits, hitsTtl, 1, blockDurationMs }
end

return { hits, hitsTtl, 0, 0 }
`

export type RedisLike = Pick<Redis, 'eval' | 'on' | 'quit' | 'status'>

/**
 * Redis-backed ThrottlerStorage for multi-instance rate limiting.
 * Falls back transparently to in-memory storage when REDIS_URL is absent
 * or Redis errors/disconnects occur, preventing API downtime.
 */
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly logger = new Logger(RedisThrottlerStorage.name)
  private readonly fallbackStore = new Map<string, MemoryEntry>()
  private readonly redis: RedisLike | null

  constructor(redisUrl?: string, clientOverride?: RedisLike | null) {
    if (clientOverride !== undefined) {
      this.redis = clientOverride
    } else if (redisUrl && redisUrl.trim().length > 0) {
      const client = new Redis(redisUrl.trim(), {
        enableReadyCheck: true,
        maxRetriesPerRequest: 1,
        lazyConnect: false,
      })
      client.on('error', (err) => {
        this.logger.warn(`Redis throttler connection error, using memory fallback: ${err.message}`)
      })
      this.redis = client
    } else {
      this.redis = null
    }
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (this.redis) {
      try {
        const redisKey = `votz:throttle:${throttlerName}:${key}`
        const blockKey = `${redisKey}:blocked`
        const raw = (await this.redis.eval(
          INCREMENT_LUA,
          2,
          redisKey,
          blockKey,
          String(ttl),
          String(limit),
          String(blockDuration),
        )) as [number | string, number | string, number | string, number | string]

        return {
          totalHits: Number(raw[0]),
          timeToExpire: Math.max(0, Math.ceil(Number(raw[1]) / 1000)),
          isBlocked: Number(raw[2]) === 1,
          timeToBlockExpire: Math.max(0, Math.ceil(Number(raw[3]) / 1000)),
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error'
        this.logger.warn(`Redis throttler command failed, using memory fallback: ${message}`)
      }
    }

    return this.incrementMemory(`${throttlerName}:${key}`, ttl, limit, blockDuration)
  }

  private incrementMemory(
    compositeKey: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): ThrottlerStorageRecord {
    const now = Date.now()
    let entry = this.fallbackStore.get(compositeKey)

    if (!entry || entry.expiresAt <= now) {
      entry = { totalHits: 0, expiresAt: now + ttl, blockedUntil: 0 }
      this.fallbackStore.set(compositeKey, entry)
    }

    if (entry.blockedUntil > now) {
      return {
        totalHits: entry.totalHits,
        timeToExpire: Math.max(0, Math.ceil((entry.expiresAt - now) / 1000)),
        isBlocked: true,
        timeToBlockExpire: Math.max(0, Math.ceil((entry.blockedUntil - now) / 1000)),
      }
    }

    entry.totalHits += 1
    if (entry.totalHits > limit && blockDuration > 0) {
      entry.blockedUntil = now + blockDuration
      return {
        totalHits: entry.totalHits,
        timeToExpire: Math.max(0, Math.ceil((entry.expiresAt - now) / 1000)),
        isBlocked: true,
        timeToBlockExpire: Math.max(0, Math.ceil(blockDuration / 1000)),
      }
    }

    return {
      totalHits: entry.totalHits,
      timeToExpire: Math.max(0, Math.ceil((entry.expiresAt - now) / 1000)),
      isBlocked: false,
      timeToBlockExpire: 0,
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit()
      } catch {
        // Ignore teardown errors when Redis was never reachable.
      }
    }
  }
}
