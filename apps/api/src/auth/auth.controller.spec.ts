

jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'SECRET'),
  generateURI: jest.fn(() => 'otpauth://totp/Votz'),
  verify: jest.fn(async () => ({ valid: false })),
}))

import { BadRequestException, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { Test } from '@nestjs/testing'
import cookieParser from 'cookie-parser'
import { OriginCsrfGuard } from '../common/security/origin-csrf.guard'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import {
  GoogleAuthGuard,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_COOKIE_BASE,
  OAUTH_STATE_COOKIE_OPTIONS,
} from './guards/google-auth.guard'
import { GoogleStrategy } from './strategies/google.strategy'

describe('AuthController', () => {
  it('googleCallback validates state cookie, clears it, sets refresh cookie, and redirects without token in URL', async () => {
    const authService = {
      googleLogin: jest.fn().mockResolvedValue({
        accessToken: 'jwt-access-secret',
        refreshToken: 'refresh-token-value',
      }),
    } as unknown as AuthService

    const config = {
      get: jest.fn((key: string, fallback?: string) =>
        key === 'APP_URL' ? 'https://votz.app' : fallback,
      ),
    } as unknown as ConfigService

    const controller = new AuthController(authService, config)

    const cookieMock = jest.fn()
    const clearCookieMock = jest.fn()
    const redirectMock = jest.fn()
    const req = {
      cookies: { [OAUTH_STATE_COOKIE]: 'matching-state-value-123456' },
      query: { state: 'matching-state-value-123456' },
    } as any
    const res = { cookie: cookieMock, clearCookie: clearCookieMock, redirect: redirectMock } as any

    await controller.googleCallback(
      { googleId: 'g1', email: 'ana@votz.app', name: 'Ana', avatarUrl: null },
      '127.0.0.1',
      req,
      res,
    )

    expect(clearCookieMock).toHaveBeenCalledWith(OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_BASE)
    expect(cookieMock).toHaveBeenCalledWith(
      'votz_refresh_token',
      'refresh-token-value',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    )
    expect(redirectMock).toHaveBeenCalledTimes(1)
    const redirectUrl = redirectMock.mock.calls[0][0] as string
    expect(redirectUrl).toBe('https://votz.app/auth/google/callback')
    expect(redirectUrl).not.toContain('token=')
    expect(redirectUrl).not.toContain('jwt-access-secret')
  })

  it('googleCallback rejects missing or mismatched state cookie with 400 and clears cookie', async () => {
    const googleLogin = jest.fn()
    const authService = { googleLogin } as unknown as AuthService
    const config = { get: jest.fn((_k: string, fallback?: string) => fallback) } as unknown as ConfigService
    const controller = new AuthController(authService, config)

    const clearMissing = jest.fn()
    await expect(
      controller.googleCallback(
        { googleId: 'g1', email: 'ana@votz.app', name: 'Ana', avatarUrl: null },
        '127.0.0.1',
        { cookies: {}, query: { state: 'some-state' } } as any,
        { clearCookie: clearMissing, cookie: jest.fn(), redirect: jest.fn() } as any,
      ),
    ).rejects.toThrow(BadRequestException)
    expect(clearMissing).toHaveBeenCalledWith(OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_BASE)

    const clearMismatch = jest.fn()
    await expect(
      controller.googleCallback(
        { googleId: 'g1', email: 'ana@votz.app', name: 'Ana', avatarUrl: null },
        '127.0.0.1',
        { cookies: { [OAUTH_STATE_COOKIE]: 'victim-state' }, query: { state: 'attacker-state' } } as any,
        { clearCookie: clearMismatch, cookie: jest.fn(), redirect: jest.fn() } as any,
      ),
    ).rejects.toThrow(BadRequestException)
    expect(clearMismatch).toHaveBeenCalledWith(OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_BASE)
    expect(googleLogin).not.toHaveBeenCalled()
  })

  it('attaches OriginCsrfGuard to refresh, logout, and logoutAll', () => {
    for (const method of ['refresh', 'logout', 'logoutAll'] as const) {
      const guards = Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype[method]) as unknown[]
      expect(guards).toContain(OriginCsrfGuard)
    }
  })
})

describe('GoogleAuthGuard & Google OAuth state CSRF protection (A6)', () => {
  it('sets votz_oauth_state cookie and passes matching state via getAuthenticateOptions on initiate', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: string) =>
        key === 'GOOGLE_CLIENT_ID' ? 'google-client-id' : fallback,
      ),
    } as unknown as ConfigService

    const guard = new GoogleAuthGuard(config)
    const superCanActivate = jest
      .spyOn(Object.getPrototypeOf(GoogleAuthGuard.prototype), 'canActivate')
      .mockResolvedValue(true)

    const req: Record<string, unknown> = { originalUrl: '/api/v1/auth/google' }
    const resCookie = jest.fn()
    const ctx = {
      getHandler: () => AuthController.prototype.googleRedirect,
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({ cookie: resCookie, clearCookie: jest.fn() }),
      }),
    } as unknown as ExecutionContext

    await guard.canActivate(ctx)

    expect(resCookie).toHaveBeenCalledWith(
      OAUTH_STATE_COOKIE,
      expect.any(String),
      OAUTH_STATE_COOKIE_OPTIONS,
    )
    const issuedState = resCookie.mock.calls[0][1] as string
    expect(issuedState.length).toBeGreaterThanOrEqual(24)
    expect(guard.getAuthenticateOptions(ctx)).toEqual({ state: issuedState })
    expect(superCanActivate).toHaveBeenCalled()
    superCanActivate.mockRestore()
  })

  it('enforces state generation on GET /api/v1/auth/google and constant-time state cookie check on HTTP callback', async () => {
    const googleLogin = jest.fn().mockResolvedValue({
      accessToken: 'jwt-access-secret',
      refreshToken: 'refresh-token-value',
    })

    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: 'test-oauth-jwt-secret-min-32-chars' }),
      ],
      controllers: [AuthController],
      providers: [
        GoogleStrategy,
        GoogleAuthGuard,
        { provide: AuthService, useValue: { googleLogin } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: string) => {
              const map: Record<string, string> = {
                GOOGLE_CLIENT_ID: 'google-client-id',
                GOOGLE_CLIENT_SECRET: 'google-client-secret',
                GOOGLE_CALLBACK_URL: 'http://127.0.0.1/api/v1/auth/google/callback',
                APP_URL: 'https://votz.app',
              }
              return map[key] ?? fallback
            },
          },
        },
      ],
    }).compile()

    const app = moduleRef.createNestApplication()
    app.use(cookieParser())
    app.setGlobalPrefix('api/v1')
    await app.init()
    await app.listen(0, '127.0.0.1')
    const baseUrl = await app.getUrl()

    try {
      // 1. Initiate sets votz_oauth_state cookie and includes same state in Google redirect URL
      const initRes = await fetch(`${baseUrl}/api/v1/auth/google`, { redirect: 'manual' })
      expect(initRes.status).toBe(302)
      const setCookie = initRes.headers.get('set-cookie') ?? ''
      const location = initRes.headers.get('location') ?? ''
      expect(setCookie).toContain(`${OAUTH_STATE_COOKIE}=`)
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('Path=/api/v1/auth/google')
      expect(setCookie).toContain('SameSite=Lax')

      const cookieMatch = setCookie.match(/votz_oauth_state=([^;]+)/)
      expect(cookieMatch).not.toBeNull()
      const cookieState = decodeURIComponent(cookieMatch![1])
      const locationUrl = new URL(location)
      expect(locationUrl.searchParams.get('state')).toBe(cookieState)

      // 2. Callback without cookie -> 400 and clears cookie
      const noCookieRes = await fetch(
        `${baseUrl}/api/v1/auth/google/callback?state=${encodeURIComponent(cookieState)}&code=dummy`,
      )
      expect(noCookieRes.status).toBe(400)
      expect(noCookieRes.headers.get('set-cookie') ?? '').toContain(`${OAUTH_STATE_COOKIE}=;`)

      // 3. Callback with mismatched state -> 400 and clears cookie
      const mismatchRes = await fetch(
        `${baseUrl}/api/v1/auth/google/callback?state=attacker-forged-state&code=dummy`,
        { headers: { cookie: `${OAUTH_STATE_COOKIE}=${cookieState}` } },
      )
      expect(mismatchRes.status).toBe(400)
      expect(mismatchRes.headers.get('set-cookie') ?? '').toContain(`${OAUTH_STATE_COOKIE}=;`)
      expect(googleLogin).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  }, 20_000)
})

describe('OriginCsrfGuard (L4)', () => {
  function makeContext(headers: Record<string, string | undefined>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    } as unknown as ExecutionContext
  }

  it('allows requests with matching Origin or comma-separated FRONTEND_URL', () => {
    const config = {
      get: jest.fn().mockReturnValue('https://votz.app, https://www.votz.app'),
    } as unknown as ConfigService
    const guard = new OriginCsrfGuard(config)

    expect(guard.canActivate(makeContext({ origin: 'https://votz.app' }))).toBe(true)
    expect(guard.canActivate(makeContext({ origin: 'https://www.votz.app' }))).toBe(true)
  })

  it('falls back to Referer origin when Origin header is absent', () => {
    const config = {
      get: jest.fn().mockReturnValue('https://votz.app'),
    } as unknown as ConfigService
    const guard = new OriginCsrfGuard(config)

    expect(guard.canActivate(makeContext({ referer: 'https://votz.app/entrar?next=/' }))).toBe(true)
  })

  it('throws ForbiddenException when Origin or Referer is foreign or missing', () => {
    const config = {
      get: jest.fn().mockReturnValue('https://votz.app'),
    } as unknown as ConfigService
    const guard = new OriginCsrfGuard(config)

    expect(() => guard.canActivate(makeContext({ origin: 'https://evil.example' }))).toThrow(
      ForbiddenException,
    )
    expect(() => guard.canActivate(makeContext({ referer: 'https://evil.example/csrf' }))).toThrow(
      ForbiddenException,
    )
    expect(() => guard.canActivate(makeContext({}))).toThrow(ForbiddenException)
  })
})
