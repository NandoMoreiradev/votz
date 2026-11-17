jest.mock('otplib', () => ({ generateSecret: jest.fn(), generateURI: jest.fn(), verify: jest.fn() }))
import 'reflect-metadata'
import { UnauthorizedException } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { validate } from 'class-validator'
import { MobileAuthController } from './mobile-auth.controller'
import { AuthService } from './auth.service'
import { MobileRefreshDto } from './dto/mobile-refresh.dto'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { JwtMfaSetupGuard } from './guards/jwt-mfa-setup.guard'

describe('Native authentication transport', () => {
  const session = { user: { id: 'u1' }, accessToken: 'access', refreshToken: 'opaque-refresh' }
  const service = {
    login: jest.fn(), refresh: jest.fn(), logout: jest.fn(), mfaVerifyLogin: jest.fn(), mfaEnable: jest.fn(),
  }
  const controller = new MobileAuthController(service as unknown as AuthService)
  beforeEach(() => jest.resetAllMocks())

  it('issues explicit native tokens after password authentication', async () => {
    service.login.mockResolvedValue({ ...session, requiresMfa: false })
    await expect(controller.login({ email: 'a@votz.app', password: 'password' }, '127.0.0.1')).resolves.toEqual(session)
  })

  it.each([
    { requiresMfa: true, mfaToken: 'challenge' },
    { requiresMfaSetup: true, mfaSetupToken: 'setup-challenge' },
  ])('does not disclose session tokens before completing $requiresMfa MFA', async (challenge) => {
    service.login.mockResolvedValue({ ...challenge, ...session })
    await expect(controller.login({ email: 'a@votz.app', password: 'password' }, '127.0.0.1')).resolves.toEqual(challenge)
  })

  it('passes the body token to the existing rotation and reuse-detection service', async () => {
    service.refresh.mockResolvedValue({ accessToken: 'new-access', refreshToken: 'rotated' })
    await expect(controller.refresh({ refreshToken: 'old' })).resolves.toEqual({ accessToken: 'new-access', refreshToken: 'rotated' })
    expect(service.refresh).toHaveBeenCalledWith('old')
    service.refresh.mockRejectedValue(new UnauthorizedException('Refresh token reuse detected'))
    await expect(controller.refresh({ refreshToken: 'reused' })).rejects.toThrow(UnauthorizedException)
  })

  it('uses the existing TOTP/backup-code verification and requires a setup JWT for enrollment', async () => {
    service.mfaVerifyLogin.mockResolvedValue(session)
    await expect(controller.verify({ mfaToken: 'challenge', code: '123456' }, 'ip')).resolves.toEqual(session)
    expect(service.mfaVerifyLogin).toHaveBeenCalledWith('challenge', '123456', 'ip')
    const guards = Reflect.getMetadata(GUARDS_METADATA, MobileAuthController.prototype.enable)
    expect(guards).toContain(JwtMfaSetupGuard)
    service.mfaEnable.mockResolvedValue(session)
    await controller.enable({ id: 'u1' }, { code: '123456' }, 'ip')
    expect(service.mfaEnable).toHaveBeenCalledWith('u1', '123456', true, 'ip')
  })

  it('requires an access JWT on logout and scopes revocation to its user', async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MobileAuthController.prototype.logout)).toContain(JwtAuthGuard)
    await controller.logout({ id: 'u1' }, { refreshToken: 'device-refresh' })
    expect(service.logout).toHaveBeenCalledWith('u1', 'device-refresh')
  })

  it('rejects missing, non-string, short and oversized body tokens', async () => {
    for (const refreshToken of [undefined, 123, '', 'short', 'x'.repeat(513)]) {
      const dto = Object.assign(new MobileRefreshDto(), { refreshToken })
      expect((await validate(dto)).length).toBeGreaterThan(0)
    }
    expect(await validate(Object.assign(new MobileRefreshDto(), { refreshToken: 'x'.repeat(64) }))).toEqual([])
  })
})
