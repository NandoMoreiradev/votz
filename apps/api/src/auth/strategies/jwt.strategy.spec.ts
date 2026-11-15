import { Test } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { PassportModule } from '@nestjs/passport'
import { JwtStrategy } from './jwt.strategy'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthController } from '../auth.controller'
import { AuthService } from '../auth.service'

jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verify: jest.fn(),
}))

describe('JwtStrategy (H1 typ enforcement)', () => {
  let strategy: JwtStrategy
  let prisma: any

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'ana@votz.app',
          type: 'CITIZEN',
          banned: false,
          emailVerified: true,
        }),
      },
    }
    const config: any = {
      getOrThrow: jest.fn(() => 'test-secret'),
    }
    strategy = new JwtStrategy(config, prisma)
  })

  it('rejects tokens missing typ or with non-access typ (e.g. mfa_pending, mfa_setup_required)', async () => {
    await expect(
      strategy.validate({ sub: 'u1', email: 'ana@votz.app', type: 'mfa_pending' }),
    ).rejects.toThrow(UnauthorizedException)

    await expect(
      strategy.validate({ sub: 'u1', email: 'ana@votz.app', type: 'mfa_setup_required' }),
    ).rejects.toThrow(UnauthorizedException)

    await expect(
      strategy.validate({ sub: 'u1', email: 'ana@votz.app', type: 'CITIZEN' }),
    ).rejects.toThrow(UnauthorizedException)

    await expect(
      strategy.validate({ sub: 'u1', email: 'ana@votz.app', type: 'CITIZEN', typ: 'mfa_pending' }),
    ).rejects.toThrow(UnauthorizedException)

    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('accepts access token when typ === "access" and user is active', async () => {
    const user = await strategy.validate({
      sub: 'u1',
      email: 'ana@votz.app',
      type: 'CITIZEN',
      typ: 'access',
    })
    expect(user).toMatchObject({ id: 'u1', email: 'ana@votz.app', ctx: null })
  })

  it('integration: mfaToken (without typ: access) receives 401 on GET /auth/me', async () => {
    const mockAuthService = { me: jest.fn().mockResolvedValue({ id: 'u1' }) }
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ JWT_SECRET: 'integration-secret' })],
        }),
        PassportModule,
        JwtModule.register({
          secret: 'integration-secret',
          signOptions: { algorithm: 'HS256' },
          verifyOptions: { algorithms: ['HS256'] },
        }),
      ],
      controllers: [AuthController],
      providers: [
        JwtStrategy,
        { provide: AuthService, useValue: mockAuthService },
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { getOrThrow: () => 'integration-secret' } },
      ],
    }).compile()

    const app: INestApplication = moduleRef.createNestApplication()
    await app.listen(0, '127.0.0.1')
    const url = await app.getUrl()

    try {
      const jwt = moduleRef.get(JwtService)
      const mfaToken = await jwt.signAsync({ sub: 'u1', type: 'mfa_pending' })
      const mfaSetupToken = await jwt.signAsync({ sub: 'u1', type: 'mfa_setup_required' })
      const validAccessToken = await jwt.signAsync({
        sub: 'u1',
        email: 'ana@votz.app',
        type: 'CITIZEN',
        typ: 'access',
      })

      const r1 = await fetch(`${url}/auth/me`, {
        headers: { Authorization: `Bearer ${mfaToken}` },
      })
      expect(r1.status).toBe(401)

      const r2 = await fetch(`${url}/auth/me`, {
        headers: { Authorization: `Bearer ${mfaSetupToken}` },
      })
      expect(r2.status).toBe(401)

      expect(mockAuthService.me).not.toHaveBeenCalled()

      const r3 = await fetch(`${url}/auth/me`, {
        headers: { Authorization: `Bearer ${validAccessToken}` },
      })
      expect(r3.status).toBe(200)
      expect(mockAuthService.me).toHaveBeenCalledWith('u1')
    } finally {
      await app.close()
    }
  })
})
