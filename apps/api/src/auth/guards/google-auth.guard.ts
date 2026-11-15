import { BadRequestException, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthGuard, IAuthModuleOptions } from '@nestjs/passport'
import { randomBytes, timingSafeEqual } from 'crypto'
import type { Request, Response } from 'express'

export const OAUTH_STATE_COOKIE = 'votz_oauth_state'

const isProd = process.env.NODE_ENV === 'production'

export const OAUTH_STATE_COOKIE_BASE = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/api/v1/auth/google',
}

export const OAUTH_STATE_COOKIE_OPTIONS = {
  ...OAUTH_STATE_COOKIE_BASE,
  maxAge: 10 * 60 * 1000,
}

export function assertValidOAuthState(req: Request, res: Response, clearOnSuccess: boolean): void {
  const cookieState =
    typeof req.cookies?.[OAUTH_STATE_COOKIE] === 'string' ? req.cookies[OAUTH_STATE_COOKIE] : ''
  const queryState = typeof req.query?.state === 'string' ? req.query.state : ''

  const cookieBuf = Buffer.from(cookieState, 'utf8')
  const queryBuf = Buffer.from(queryState, 'utf8')

  const valid =
    cookieBuf.length > 0 &&
    cookieBuf.length === queryBuf.length &&
    timingSafeEqual(cookieBuf, queryBuf)

  if (!valid) {
    res.clearCookie(OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_BASE)
    throw new BadRequestException('Estado OAuth inválido ou expirado')
  }

  if (clearOnSuccess) {
    res.clearCookie(OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_BASE)
  }
}

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super()
  }

  private isCallbackRequest(context: ExecutionContext): boolean {
    if (context.getHandler()?.name === 'googleCallback') return true
    const req = context.switchToHttp().getRequest<Request>()
    const path = (req.originalUrl ?? req.url ?? req.path ?? '').split('?')[0]
    return path.endsWith('/callback')
  }

  canActivate(context: ExecutionContext) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID', '')
    if (!clientId || clientId === 'not-configured') {
      throw new ServiceUnavailableException(
        'Google OAuth não está configurado neste ambiente. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.',
      )
    }

    const http = context.switchToHttp()
    const req = http.getRequest<Request & { __oauthState?: string }>()
    const res = http.getResponse<Response>()

    if (this.isCallbackRequest(context)) {
      assertValidOAuthState(req, res, false)
    } else {
      const state = randomBytes(24).toString('base64url')
      req.__oauthState = state
      res.cookie(OAUTH_STATE_COOKIE, state, OAUTH_STATE_COOKIE_OPTIONS)
    }

    return super.canActivate(context)
  }

  getAuthenticateOptions(context: ExecutionContext): IAuthModuleOptions | undefined {
    if (this.isCallbackRequest(context)) {
      return undefined
    }
    const req = context.switchToHttp().getRequest<Request & { __oauthState?: string }>()
    return req.__oauthState ? { state: req.__oauthState } : undefined
  }
}
