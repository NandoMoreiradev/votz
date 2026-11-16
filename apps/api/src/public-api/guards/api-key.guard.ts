import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common'
import { createHash } from 'crypto'
import type { Request, Response } from 'express'
import type { Redis } from 'ioredis'
import { ApiKeyTier } from '@prisma/client'
import { ApiKeysService } from '../api-keys.service'
import { REDIS_CLIENT } from '../public-api.constants'

const RATE_LIMIT: Record<ApiKeyTier, number> = {
  [ApiKeyTier.FREE]: 1_000,
  [ApiKeyTier.PAID]: 10_000,
}

const IP_HOURLY_RATE_LIMIT = 10_000

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name)

  constructor(
    private readonly apiKeysService: ApiKeysService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp()
    const req  = http.getRequest<Request & { resolvedApiKey: unknown }>()
    const res  = http.getResponse<Response>()

    const rawKey = req.headers['x-api-key']
    if (!rawKey || typeof rawKey !== 'string') {
      throw new UnauthorizedException('Cabeçalho x-api-key ausente ou inválido')
    }

    const keyHash = createHash('sha256').update(rawKey).digest('hex')
    const apiKey  = await this.apiKeysService.findByHash(keyHash)

    if (!apiKey || apiKey.revokedAt) {
      throw new UnauthorizedException('API key inválida ou revogada')
    }

    const limit      = RATE_LIMIT[apiKey.tier]
    const windowHour = Math.floor(Date.now() / 3_600_000)
    const redisKey   = `rl:apikey:${keyHash}:${windowHour}`
    const clientIp   = req.ip || req.socket?.remoteAddress || 'unknown'
    const ipHash     = createHash('sha256').update(clientIp).digest('hex').slice(0, 24)
    const redisIpKey = `rl:apikey-ip:${ipHash}:${windowHour}`
    const resetAt    = (windowHour + 1) * 3600

    let count = limit // fail-open default
    let ipCount = 0
    try {
      count = await this.redis.incr(redisKey)
      if (count === 1) await this.redis.expire(redisKey, 3601)
      ipCount = await this.redis.incr(redisIpKey)
      if (ipCount === 1) await this.redis.expire(redisIpKey, 3601)
    } catch (err) {
      this.logger.warn(`Redis indisponível no rate-limit: ${(err as Error).message}`)
    }

    const remaining = Math.max(0, limit - count)
    const ipRemaining = Math.max(0, IP_HOURLY_RATE_LIMIT - ipCount)
    res.setHeader('X-RateLimit-Limit', limit)
    res.setHeader('X-RateLimit-Remaining', remaining)
    res.setHeader('X-RateLimit-Reset', resetAt)
    res.setHeader('X-RateLimit-IP-Limit', IP_HOURLY_RATE_LIMIT)
    res.setHeader('X-RateLimit-IP-Remaining', ipRemaining)

    if (count > limit || ipCount > IP_HOURLY_RATE_LIMIT) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message:
            ipCount > IP_HOURLY_RATE_LIMIT
              ? 'Limite de requisições por IP por hora excedido'
              : 'Limite de requisições por hora excedido',
          retryAfter: resetAt - Math.floor(Date.now() / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    req.resolvedApiKey = apiKey
    void this.apiKeysService.touchLastUsed(apiKey.id)

    return true
  }
}
