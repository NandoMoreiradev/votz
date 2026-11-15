import { Logger } from '@nestjs/common'
import { RedisThrottlerStorage, RedisLike } from './redis-throttler-storage'

describe('RedisThrottlerStorage', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('uses Redis eval when client succeeds', async () => {
    const redisMock: RedisLike = {
      status: 'ready',
      eval: jest.fn().mockResolvedValue([2, 8500, 0, 0]),
      on: jest.fn().mockReturnThis() as any,
      quit: jest.fn().mockResolvedValue('OK'),
    }

    const storage = new RedisThrottlerStorage('redis://localhost:6379', redisMock)
    const result = await storage.increment('127.0.0.1', 10_000, 10, 0, 'medium')

    expect(redisMock.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      'votz:throttle:medium:127.0.0.1',
      'votz:throttle:medium:127.0.0.1:blocked',
      '10000',
      '10',
      '0',
    )
    expect(result).toEqual({
      totalHits: 2,
      timeToExpire: 9,
      isBlocked: false,
      timeToBlockExpire: 0,
    })
  })

  it('falls back to in-memory counting without throwing when Redis fails', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const redisMock: RedisLike = {
      status: 'reconnecting',
      eval: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      on: jest.fn().mockReturnThis() as any,
      quit: jest.fn().mockResolvedValue('OK'),
    }

    const storage = new RedisThrottlerStorage('redis://localhost:6379', redisMock)

    const r1 = await storage.increment('client-1', 10_000, 2, 5_000, 'short')
    const r2 = await storage.increment('client-1', 10_000, 2, 5_000, 'short')
    const r3 = await storage.increment('client-1', 10_000, 2, 5_000, 'short')

    expect(r1.totalHits).toBe(1)
    expect(r1.isBlocked).toBe(false)
    expect(r2.totalHits).toBe(2)
    expect(r2.isBlocked).toBe(false)
    expect(r3.totalHits).toBe(3)
    expect(r3.isBlocked).toBe(true)
    expect(r3.timeToBlockExpire).toBe(5)
    expect(warnSpy).toHaveBeenCalledTimes(3)
  })
})
