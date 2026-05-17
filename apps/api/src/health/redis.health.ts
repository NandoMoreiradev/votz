import { Injectable } from '@nestjs/common'
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly config: ConfigService) {
    super()
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const client = new Redis(
      this.config.get<string>('REDIS_URL', 'redis://localhost:6379'),
      { connectTimeout: 2_000, lazyConnect: true, enableReadyCheck: false },
    )
    try {
      await client.connect()
      await client.ping()
      await client.quit()
      return this.getStatus(key, true)
    } catch (e) {
      await client.quit().catch(() => {})
      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false, { message: (e as Error).message }),
      )
    }
  }
}
