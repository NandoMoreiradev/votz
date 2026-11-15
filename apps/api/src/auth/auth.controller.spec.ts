jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'SECRET'),
  generateURI: jest.fn(() => 'otpauth://totp/Votz'),
  verify: jest.fn(async () => ({ valid: false })),
}))

import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { ConfigService } from '@nestjs/config'
import { OriginCsrfGuard } from '../common/security/origin-csrf.guard'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

describe('AuthController', () => {
  it('googleCallback sets refresh cookie and redirects without token in URL', async () => {
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
    const redirectMock = jest.fn()
    const res = { cookie: cookieMock, redirect: redirectMock } as any

    await controller.googleCallback(
      { googleId: 'g1', email: 'ana@votz.app', name: 'Ana', avatarUrl: null },
      '127.0.0.1',
      res,
    )

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

  it('attaches OriginCsrfGuard to refresh, logout, and logoutAll', () => {
    for (const method of ['refresh', 'logout', 'logoutAll'] as const) {
      const guards = Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype[method]) as unknown[]
      expect(guards).toContain(OriginCsrfGuard)
    }
  })
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
