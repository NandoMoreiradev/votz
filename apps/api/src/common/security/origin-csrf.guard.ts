import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'

/** Extracts normalized scheme+host+port origins from comma-separated FRONTEND_URL. */
export function parseAllowedOrigins(rawOrigins?: string): Set<string> {
  const value = rawOrigins?.trim() || 'http://localhost:5173'
  const origins = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      try {
        return new URL(entry).origin
      } catch {
        return entry.replace(/\/+$/, '')
      }
    })

  return new Set(origins.length > 0 ? origins : ['http://localhost:5173'])
}

/**
 * Verifies Origin (or Referer origin fallback) matches configured FRONTEND_URL
 * on cookie-authenticated session endpoints (`POST /auth/refresh`, `/logout`, `/logout-all`).
 */
@Injectable()
export class OriginCsrfGuard implements CanActivate {
  constructor(@Optional() private readonly config?: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()
    const rawFrontendUrl =
      this.config?.get<string>('FRONTEND_URL') ?? process.env.FRONTEND_URL
    const allowedOrigins = parseAllowedOrigins(rawFrontendUrl)

    const originHeader = req.headers.origin
    if (typeof originHeader === 'string' && originHeader.trim().length > 0) {
      if (allowedOrigins.has(originHeader.trim())) {
        return true
      }
      throw new ForbiddenException('Invalid request origin')
    }

    const refererHeader = req.headers.referer
    if (typeof refererHeader === 'string' && refererHeader.trim().length > 0) {
      try {
        const refererOrigin = new URL(refererHeader.trim()).origin
        if (allowedOrigins.has(refererOrigin)) {
          return true
        }
      } catch {
        throw new ForbiddenException('Invalid request referer')
      }
      throw new ForbiddenException('Invalid request origin')
    }

    throw new ForbiddenException('Origin or Referer header required')
  }
}
