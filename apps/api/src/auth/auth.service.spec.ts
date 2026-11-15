import { Test, TestingModule } from '@nestjs/testing'
import {
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  HttpStatus,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcrypt'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { AccessEvent } from '@prisma/client'
import { TERMS_VERSION, PRIVACY_VERSION } from '@votz/shared-types'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { PrismaService } from '../prisma/prisma.service'
import { MailService } from '../mail/mail.service'
import { AccessLogService } from '../access-log/access-log.service'
import { CryptoService } from '../crypto/crypto.service'

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$hashed'),
  compare: jest.fn().mockResolvedValue(true),
}))

jest.mock('otplib', () => ({
  generateSecret: jest.fn().mockReturnValue('TESTSECRET'),
  generateURI: jest.fn().mockReturnValue('otpauth://totp/Votz:test@example.com?secret=TESTSECRET'),
  verify: jest.fn().mockResolvedValue({ valid: true }),
}))

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,fake'),
}))

const refreshTokenStore: Array<{
  id: string
  userId: string
  familyId: string
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}> = []

const mockPrismaUser = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
}

const mockPrismaRefreshToken = {
  create: jest.fn(async ({ data }: any) => {
    const row = {
      id: `rt-${refreshTokenStore.length + 1}`,
      usedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      ...data,
    }
    refreshTokenStore.push(row)
    return row
  }),
  findUnique: jest.fn(async ({ where, include }: any) => {
    const row = refreshTokenStore.find((r) => r.tokenHash === where.tokenHash)
    if (!row) return null
    if (include?.user) {
      const user = await mockPrismaUser.findUnique({ where: { id: row.userId } })
      return { ...row, user }
    }
    return row
  }),
  updateMany: jest.fn(async ({ where, data }: any) => {
    let count = 0
    for (const row of refreshTokenStore) {
      if (where.id !== undefined && row.id !== where.id) continue
      if (where.userId !== undefined && row.userId !== where.userId) continue
      if (where.familyId !== undefined && row.familyId !== where.familyId) continue
      if (where.usedAt === null && row.usedAt !== null) continue
      if (where.revokedAt === null && row.revokedAt !== null) continue
      Object.assign(row, data)
      count++
    }
    return { count }
  }),
}

const mockPrisma: {
  user: typeof mockPrismaUser
  refreshToken: typeof mockPrismaRefreshToken
  $transaction: jest.Mock
} = {
  user: mockPrismaUser,
  refreshToken: mockPrismaRefreshToken,
  $transaction: jest.fn(async (fn: any) => fn(mockPrisma)),
}

const mockJwt = {
  signAsync: jest.fn().mockResolvedValue('mock.jwt.token'),
  verifyAsync: jest.fn(),
}

const mockConfig = {
  getOrThrow: jest.fn((key: string) => {
    const cfg: Record<string, string> = {
      JWT_SECRET: 'test-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      CPF_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
    }
    if (key in cfg) return cfg[key]
    throw new Error(`Unknown config key: ${key}`)
  }),
  get: jest.fn((_key: string, def?: string) => def),
}

const mockMail = {
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendMfaBackupCodes: jest.fn().mockResolvedValue(undefined),
}

const mockAccessLog = {
  record: jest.fn().mockResolvedValue(undefined),
}

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    password: '$2b$12$hashed',
    type: 'CITIZEN',
    banned: false,
    lockedUntil: null,
    failedLoginAttempts: 0,
    mfaEnabled: false,
    mfaSecret: null,
    mfaBackupCodes: [] as string[],
    verified: false,
    reputation: 0,
    avatarUrl: null,
    emailVerified: false,
    createdAt: new Date('2024-01-01'),
    googleId: null,
    ...overrides,
  }
}

describe('AuthService', () => {
  let service: AuthService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: MailService, useValue: mockMail },
        { provide: AccessLogService, useValue: mockAccessLog },
        {
          provide: CryptoService,
          useFactory: () => new CryptoService(mockConfig as any),
        },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
    jest.clearAllMocks()
    refreshTokenStore.length = 0

    // Restore default implementations after clearAllMocks
    ;(bcrypt.hash as jest.Mock).mockResolvedValue('$2b$12$hashed')
    ;(bcrypt.compare as jest.Mock).mockResolvedValue(true)
    mockJwt.signAsync.mockResolvedValue('mock.jwt.token')
    mockPrismaUser.update.mockResolvedValue({})
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
    mockMail.sendVerificationEmail.mockResolvedValue(undefined)
    mockMail.sendMfaBackupCodes.mockResolvedValue(undefined)
    mockAccessLog.record.mockResolvedValue(undefined)
    mockConfig.getOrThrow.mockImplementation((key: string) => {
      const cfg: Record<string, string> = {
        JWT_SECRET: 'test-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        CPF_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
      }
      if (key in cfg) return cfg[key]
      throw new Error(`Unknown config key: ${key}`)
    })
    mockConfig.get.mockImplementation((_key: string, def?: string) => def)
  })

  // ──────────────────────────────────────────────
  // register()
  // ──────────────────────────────────────────────

  describe('register', () => {
    const dto = {
      name: 'João Silva',
      email: 'joao@example.com',
      password: 'Senha@123',
      phone: '+5511999999999',
      zipCode: '01310100',
      streetNumber: '1000',
      acceptedTermsVersion: TERMS_VERSION,
      acceptedPrivacyVersion: PRIVACY_VERSION,
      confirmAge18: true,
    } as any

    it('throws ConflictException when email is already registered', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser())

      await expect(service.register(dto)).rejects.toThrow(ConflictException)
    })

    it('throws BadRequestException when confirmAge18 is not true', async () => {
      await expect(service.register({ ...dto, confirmAge18: false })).rejects.toThrow(BadRequestException)
      expect(mockPrismaUser.create).not.toHaveBeenCalled()
    })

    it('throws ConflictException (409) when terms or privacy version is outdated', async () => {
      await expect(
        service.register({ ...dto, acceptedTermsVersion: '2020-01-01' }),
      ).rejects.toThrow(ConflictException)

      await expect(
        service.register({ ...dto, acceptedPrivacyVersion: '2020-01-01' }),
      ).rejects.toThrow(ConflictException)
      expect(mockPrismaUser.create).not.toHaveBeenCalled()
    })

    it('creates user with consent timestamps and versions, sends verification email, and returns tokens', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null)
      mockPrismaUser.create.mockResolvedValue(
        makeUser({
          email: dto.email,
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
          termsAcceptedAt: new Date(),
          ageConfirmedAt: new Date(),
        }),
      )

      const result = await service.register(dto)

      expect(mockPrismaUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            termsVersion: TERMS_VERSION,
            privacyVersion: PRIVACY_VERSION,
            termsAcceptedAt: expect.any(Date),
            ageConfirmedAt: expect.any(Date),
          }),
        }),
      )
      expect(mockMail.sendVerificationEmail).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
      )
      expect(result).toHaveProperty('accessToken')
      expect(result.user).toEqual(
        expect.objectContaining({
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
          hasPassword: true,
        }),
      )
    })

    it('rejects RegisterDto with confirmAge18 = false (400 validation)', async () => {
      const instance = plainToInstance(RegisterDto, { ...dto, confirmAge18: false })
      const errors = await validate(instance)
      const ageErr = errors.find((e) => e.property === 'confirmAge18')
      expect(ageErr).toBeDefined()
    })
  })

  // ──────────────────────────────────────────────
  // login()
  // ──────────────────────────────────────────────

  describe('login', () => {
    const dto = { email: 'test@example.com', password: 'Senha@123' }

    it('throws UnauthorizedException when user is not found and equalizes timing with bcrypt', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null)
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException)
      expect(bcrypt.compare).toHaveBeenCalledWith(dto.password, expect.stringMatching(/^\$2b\$12\$/))
    })

    it('equalizes timing with bcrypt when account has no password (OAuth user)', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser({ password: null }))
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException)
      expect(bcrypt.compare).toHaveBeenCalledWith(dto.password, expect.stringMatching(/^\$2b\$12\$/))
    })

    it('throws UnauthorizedException when account is banned', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser({ banned: true }))
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException)
    })

    it('throws 429 when account is locked', async () => {
      const lockedUntil = new Date(Date.now() + 10 * 60_000)
      mockPrismaUser.findUnique.mockResolvedValue(makeUser({ lockedUntil }))

      try {
        await service.login(dto)
        fail('Expected HttpException to be thrown')
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
      }
    })

    it('increments failedLoginAttempts on wrong password', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser({ failedLoginAttempts: 2 }))
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(false)

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException)

      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ failedLoginAttempts: 3 }) }),
      )
    })

    it('locks account after 5 failed attempts', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser({ failedLoginAttempts: 4 }))
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(false)

      try {
        await service.login(dto)
        fail('Expected UnauthorizedException to be thrown')
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnauthorizedException)
        expect(err.message).toMatch(/locked/)
      }

      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ lockedUntil: expect.any(Date) }) }),
      )
    })

    it('returns mfaToken when user has MFA enabled', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser({ mfaEnabled: true }))

      const result = await service.login(dto)

      expect(result).toEqual(expect.objectContaining({ requiresMfa: true, mfaToken: expect.any(String) }))
    })

    it('returns mfaSetupToken for ADMIN without MFA (mandatory MFA)', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser({ type: 'ADMIN' }))

      const result = await service.login(dto)

      expect(result).toEqual(expect.objectContaining({ requiresMfaSetup: true, mfaSetupToken: expect.any(String) }))
    })

    it.each(['CITIZEN', 'ENTITY', 'POLITICIAN', 'COMPANY'])(
      'returns access and refresh tokens for %s without MFA at login',
      async (type) => {
        mockPrismaUser.findUnique.mockResolvedValue(makeUser({ type }))

        const result = await service.login(dto) as any

        expect(result.requiresMfa).toBe(false)
        expect(result).toHaveProperty('accessToken')
        expect(result).toHaveProperty('user')
      },
    )

    it('resets failedLoginAttempts on successful login', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser({ failedLoginAttempts: 3 }))

      await service.login(dto)

      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ failedLoginAttempts: 0 }) }),
      )
    })
  })

  // ──────────────────────────────────────────────
  // mfaSetup()
  // ──────────────────────────────────────────────

  describe('mfaSetup', () => {
    it('throws BadRequestException when MFA is already enabled', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser({ mfaEnabled: true }))
      await expect(service.mfaSetup('u1')).rejects.toThrow(BadRequestException)
    })

    it('returns secret, otpauthUrl, and qrCode and stores v1 encrypted mfaSecret', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser())

      const result = await service.mfaSetup('u1')

      expect(result).toHaveProperty('secret')
      expect(result.secret.startsWith('v1:')).toBe(false)
      expect(result).toHaveProperty('qrCode')
      const updateArg = mockPrismaUser.update.mock.calls[0][0]
      expect(updateArg.data.mfaSecret.startsWith('v1:')).toBe(true)
      expect(new CryptoService(mockConfig as any).decrypt(updateArg.data.mfaSecret)).toBe(result.secret)
    })
  })

  // ──────────────────────────────────────────────
  // mfaEnable()
  // ──────────────────────────────────────────────

  describe('mfaEnable', () => {
    it('throws BadRequestException when MFA is already enabled', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser({ mfaEnabled: true, mfaSecret: 'SECRET' }))
      await expect(service.mfaEnable('u1', '123456')).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when setup was not started (no secret)', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser({ mfaSecret: null }))
      await expect(service.mfaEnable('u1', '123456')).rejects.toThrow(BadRequestException)
    })

    it('decrypts v1 encrypted mfaSecret before verifying TOTP in mfaEnable', async () => {
      const crypto = new CryptoService(mockConfig as any)
      const { verify } = jest.requireMock('otplib')
      mockPrismaUser.findUnique.mockResolvedValue(
        makeUser({ mfaSecret: crypto.encrypt('ENCRYPTEDSECRET123') }),
      )

      const result = await service.mfaEnable('u1', '123456') as any

      expect(verify).toHaveBeenCalledWith(
        expect.objectContaining({ token: '123456', secret: 'ENCRYPTEDSECRET123' }),
      )
      expect(result).toHaveProperty('backupCodes')
    })

    it('returns backupCodes on success (voluntary flow)', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser({ mfaSecret: 'SECRET' }))

      const result = await service.mfaEnable('u1', '123456') as any

      expect(result).toHaveProperty('backupCodes')
      expect(result.backupCodes).toHaveLength(8)
      expect(result).not.toHaveProperty('accessToken')
    })

    it('returns accessToken + user on forced setup flow', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser({ mfaSecret: 'SECRET' }))

      const result = await service.mfaEnable('u1', '123456', true) as any

      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('user')
      expect(result.backupCodes).toHaveLength(8)
    })
  })

  // ──────────────────────────────────────────────
  // mfaDisable()
  // ──────────────────────────────────────────────

  describe('mfaDisable', () => {
    it('throws BadRequestException when MFA is not enabled', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser({ mfaEnabled: false }))
      await expect(service.mfaDisable('u1', '123456')).rejects.toThrow(BadRequestException)
    })

    it('throws ForbiddenException for ADMIN (MFA is mandatory)', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(
        makeUser({ type: 'ADMIN', mfaEnabled: true, mfaSecret: 'SECRET' }),
      )
      await expect(service.mfaDisable('u1', '123456')).rejects.toThrow(ForbiddenException)
    })

    it.each(['CITIZEN', 'ENTITY', 'POLITICIAN', 'COMPANY'])(
      'disables MFA for %s with valid TOTP code',
      async (type) => {
        mockPrismaUser.findUnique.mockResolvedValue(
          makeUser({ type, mfaEnabled: true, mfaSecret: 'SECRET' }),
        )

        const result = await service.mfaDisable('u1', '123456')

        expect(mockPrismaUser.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ mfaEnabled: false, mfaSecret: null }),
          }),
        )
        expect(result).toEqual({ message: 'MFA disabled' })
      },
    )
  })

  describe('mfaVerifyLogin (L1 MFA brute-force lockout)', () => {
    it('rejects with 429 when mfaLockedUntil is in the future', async () => {
      mockJwt.verifyAsync.mockResolvedValue({ sub: 'u-mfa', type: 'mfa_pending' })
      mockPrismaUser.findUnique.mockResolvedValue(
        makeUser({
          id: 'u-mfa',
          mfaEnabled: true,
          mfaSecret: 'SECRET',
          mfaLockedUntil: new Date(Date.now() + 10 * 60_000),
        }),
      )

      try {
        await service.mfaVerifyLogin('mfa-token', '123456')
        fail('Expected HttpException 429')
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
      }
    })

    it('increments mfaFailedAttempts and locks MFA after 5 wrong codes', async () => {
      const { verify } = jest.requireMock('otplib')
      ;(verify as jest.Mock).mockResolvedValueOnce({ valid: false })
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(false)
      mockJwt.verifyAsync.mockResolvedValue({ sub: 'u-mfa', type: 'mfa_pending' })
      mockPrismaUser.findUnique.mockResolvedValue(
        makeUser({
          id: 'u-mfa',
          mfaEnabled: true,
          mfaSecret: 'SECRET',
          mfaBackupCodes: [],
          mfaFailedAttempts: 4,
          mfaLockedUntil: null,
        }),
      )

      await expect(service.mfaVerifyLogin('mfa-token', '000000')).rejects.toThrow(
        UnauthorizedException,
      )

      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-mfa' },
          data: expect.objectContaining({
            mfaFailedAttempts: 5,
            mfaLockedUntil: expect.any(Date),
          }),
        }),
      )
    })

    it('resets mfaFailedAttempts and mfaLockedUntil after successful MFA verification', async () => {
      mockJwt.verifyAsync.mockResolvedValue({ sub: 'u-mfa', type: 'mfa_pending' })
      mockPrismaUser.findUnique.mockResolvedValue(
        makeUser({
          id: 'u-mfa',
          mfaEnabled: true,
          mfaSecret: 'SECRET',
          mfaFailedAttempts: 3,
          mfaLockedUntil: null,
        }),
      )

      await service.mfaVerifyLogin('mfa-token', '123456')

      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-mfa' },
          data: expect.objectContaining({
            mfaFailedAttempts: 0,
            mfaLockedUntil: null,
          }),
        }),
      )
    })
  })

  // ──────────────────────────────────────────────
  // verifyEmail()
  // ──────────────────────────────────────────────

  describe('verifyEmail', () => {
    it('throws BadRequestException for invalid or missing token', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null)
      await expect(service.verifyEmail('bad-token')).rejects.toThrow(BadRequestException)
    })

    it('returns message when email is already verified', async () => {
      mockPrismaUser.findUnique.mockResolvedValue({ id: 'u1', emailVerified: true, emailVerificationExpires: null })
      const result = await service.verifyEmail('any-token')
      expect(result.message).toBe('Email already verified')
    })

    it('throws BadRequestException for expired token', async () => {
      const expired = new Date(Date.now() - 1000)
      mockPrismaUser.findUnique.mockResolvedValue({
        id: 'u1', emailVerified: false, emailVerificationExpires: expired,
      })
      await expect(service.verifyEmail('expired-token')).rejects.toThrow(BadRequestException)
    })

    it('marks email as verified for valid token', async () => {
      const futureExpiry = new Date(Date.now() + 60_000)
      mockPrismaUser.findUnique.mockResolvedValue({
        id: 'u1', emailVerified: false, emailVerificationExpires: futureExpiry,
      })

      const result = await service.verifyEmail('valid-token')

      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ emailVerified: true }) }),
      )
      expect(result.message).toBe('Email verified successfully')
    })
  })

  // ──────────────────────────────────────────────
  // Access logs & inactivityNoticeSentAt reset
  // ──────────────────────────────────────────────

  describe('access logs & inactivity reset', () => {
    it('records REGISTER event with IP on registration', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null)
      mockPrismaUser.create.mockResolvedValue(makeUser({ id: 'u-reg' }))

      await service.register(
        {
          name: 'Ana',
          email: 'ana@example.com',
          password: 'Senha@123',
          acceptedTermsVersion: TERMS_VERSION,
          acceptedPrivacyVersion: PRIVACY_VERSION,
          confirmAge18: true,
        } as any,
        '200.10.20.30',
      )

      expect(mockAccessLog.record).toHaveBeenCalledTimes(1)
      expect(mockAccessLog.record).toHaveBeenCalledWith('u-reg', AccessEvent.REGISTER, '200.10.20.30')
    })

    it('records LOGIN and resets inactivityNoticeSentAt on password login without MFA', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser({ id: 'u-log' }))

      await service.login({ email: 'test@example.com', password: 'Senha@123' }, '189.1.2.3')

      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-log' },
          data: expect.objectContaining({
            lastLoginAt: expect.any(Date),
            inactivityNoticeSentAt: null,
          }),
        }),
      )
      expect(mockAccessLog.record).toHaveBeenCalledWith('u-log', AccessEvent.LOGIN, '189.1.2.3')
    })

    it('records MFA_LOGIN on mfaVerifyLogin and resets inactivityNoticeSentAt', async () => {
      mockJwt.verifyAsync.mockResolvedValue({ sub: 'u-mfa', type: 'mfa_pending' })
      mockPrismaUser.findUnique.mockResolvedValue(
        makeUser({ id: 'u-mfa', mfaEnabled: true, mfaSecret: 'SECRET' }),
      )

      await service.mfaVerifyLogin('mfa-token', '123456', '177.2.3.4')

      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-mfa' },
          data: expect.objectContaining({
            lastLoginAt: expect.any(Date),
            inactivityNoticeSentAt: null,
          }),
        }),
      )
      expect(mockAccessLog.record).toHaveBeenCalledWith('u-mfa', AccessEvent.MFA_LOGIN, '177.2.3.4')
    })

    it('records GOOGLE_LOGIN and resets inactivityNoticeSentAt on googleLogin', async () => {
      mockPrismaUser.findFirst.mockResolvedValue(makeUser({ id: 'u-goo', googleId: 'g-1' }))

      await service.googleLogin(
        { googleId: 'g-1', email: 'test@example.com', name: 'Test', avatarUrl: null },
        '179.3.4.5',
      )

      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-goo' },
          data: { lastLoginAt: expect.any(Date), inactivityNoticeSentAt: null },
        }),
      )
      expect(mockAccessLog.record).toHaveBeenCalledWith('u-goo', AccessEvent.GOOGLE_LOGIN, '179.3.4.5')
    })

    it('does NOT record TOKEN_REFRESH and resets inactivityNoticeSentAt on refresh', async () => {
      const user = makeUser({ id: 'u-ref', email: 'ref@example.com', type: 'CITIZEN' })
      mockPrismaUser.findUnique.mockResolvedValue(user)

      const loginRes = (await service.login({ email: 'ref@example.com', password: 'Senha@123' })) as any
      mockAccessLog.record.mockClear()
      mockPrismaUser.update.mockClear()

      const refRes = await service.refresh(loginRes.refreshToken)

      expect(refRes.accessToken).toBe('mock.jwt.token')
      expect(refRes.refreshToken).not.toBe(loginRes.refreshToken)
      expect(mockPrismaUser.update).toHaveBeenCalledWith({
        where: { id: 'u-ref' },
        data: { lastLoginAt: expect.any(Date), inactivityNoticeSentAt: null },
      })
      expect(mockAccessLog.record).not.toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────
  // H1 / H3 / M1 — Token typ, Refresh families, Reuse detection & Google M1
  // ──────────────────────────────────────────────

  describe('access token typ & opaque refresh token security (T1, T2, T5)', () => {
    it('stamps typ: access and HS256 on login and switchContext access tokens, but not on mfaToken', async () => {
      const user = makeUser({ id: 'u-typ', email: 'typ@example.com', mfaEnabled: true })
      mockPrismaUser.findUnique.mockResolvedValueOnce(user)
      await service.login({ email: 'typ@example.com', password: 'Senha@123' })
      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        { sub: 'u-typ', type: 'mfa_pending' },
        expect.objectContaining({ algorithm: 'HS256' }),
      )

      mockJwt.signAsync.mockClear()
      mockPrismaUser.findUnique.mockResolvedValueOnce(makeUser({ id: 'u-typ', email: 'typ@example.com', mfaEnabled: false }))
      await service.login({ email: 'typ@example.com', password: 'Senha@123' })
      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'u-typ', typ: 'access' }),
        expect.objectContaining({ algorithm: 'HS256' }),
      )

      mockJwt.signAsync.mockClear()
      mockPrismaUser.findUnique.mockResolvedValueOnce({ email: 'typ@example.com', type: 'CITIZEN', mfaEnabled: false, mfaSecret: null })
      await service.switchContext('u-typ', 'personal')
      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'u-typ', typ: 'access' }),
        expect.objectContaining({ algorithm: 'HS256' }),
      )
    })

    it('tolerates concurrent Promise.all refresh calls within 10s leeway without revoking the family', async () => {
      const user = makeUser({ id: 'u-conc', email: 'conc@example.com' })
      mockPrismaUser.findUnique.mockResolvedValue(user)

      const session = (await service.login({ email: 'conc@example.com', password: 'Senha@123' })) as any
      const firstToken = session.refreshToken
      const familyId = refreshTokenStore[0].familyId

      const [resA, resB] = await Promise.all([
        service.refresh(firstToken),
        service.refresh(firstToken),
      ])

      expect(resA.accessToken).toBe('mock.jwt.token')
      expect(resB.accessToken).toBe('mock.jwt.token')
      expect(resA.refreshToken).not.toBe(firstToken)
      expect(resB.refreshToken).not.toBe(firstToken)
      expect(resA.refreshToken).not.toBe(resB.refreshToken)
      expect(refreshTokenStore.every((r) => r.familyId === familyId && r.revokedAt === null)).toBe(true)

      // Both newly issued tokens in the same family must remain usable
      const nextA = await service.refresh(resA.refreshToken)
      expect(nextA.accessToken).toBe('mock.jwt.token')
    })

    it('detects refresh token reuse AFTER the 10s leeway, rejects it (401), and revokes the entire family', async () => {
      jest.useFakeTimers()
      const baseTime = new Date('2026-11-14T20:00:00.000Z')
      jest.setSystemTime(baseTime)

      try {
        const user = makeUser({ id: 'u-reuse', email: 'reuse@example.com' })
        mockPrismaUser.findUnique.mockResolvedValue(user)

        const session = (await service.login({ email: 'reuse@example.com', password: 'Senha@123' })) as any
        const firstToken = session.refreshToken

        // First rotation succeeds and emits secondToken in the same family
        const rotated = await service.refresh(firstToken)
        expect(rotated.refreshToken).not.toBe(firstToken)

        // Advance past the 10s leeway window
        jest.setSystemTime(new Date(baseTime.getTime() + 10_001))

        // Reusing firstToken fails with 401 AND revokes the entire family (including rotated.refreshToken)
        await expect(service.refresh(firstToken)).rejects.toThrow(UnauthorizedException)
        await expect(service.refresh(rotated.refreshToken)).rejects.toThrow(UnauthorizedException)
      } finally {
        jest.useRealTimers()
      }
    })

    it('rejects missing, revoked, or expired tokens without leeway', async () => {
      await expect(service.refresh(undefined)).rejects.toThrow(UnauthorizedException)
      await expect(service.refresh('nonexistent-token')).rejects.toThrow(UnauthorizedException)

      const user = makeUser({ id: 'u-exp', email: 'exp@example.com' })
      mockPrismaUser.findUnique.mockResolvedValue(user)
      const session = (await service.login({ email: 'exp@example.com', password: 'Senha@123' })) as any

      // Mark stored token expired
      refreshTokenStore[0].expiresAt = new Date(Date.now() - 1000)
      await expect(service.refresh(session.refreshToken)).rejects.toThrow(UnauthorizedException)

      // Mark non-expired token revoked
      refreshTokenStore[0].expiresAt = new Date(Date.now() + 60_000)
      refreshTokenStore[0].revokedAt = new Date()
      await expect(service.refresh(session.refreshToken)).rejects.toThrow(UnauthorizedException)
    })

    it('keeps two device families independent on logout and revokes all on logoutAll', async () => {
      const user = makeUser({ id: 'u-dev', email: 'dev@example.com' })
      mockPrismaUser.findUnique.mockResolvedValue(user)

      const dev1 = (await service.login({ email: 'dev@example.com', password: 'Senha@123' })) as any
      const dev2 = (await service.login({ email: 'dev@example.com', password: 'Senha@123' })) as any

      expect(refreshTokenStore).toHaveLength(2)
      expect(refreshTokenStore[0].familyId).not.toBe(refreshTokenStore[1].familyId)

      // Logout device 1 only revokes device 1 family
      await service.logout('u-dev', dev1.refreshToken)
      await expect(service.refresh(dev1.refreshToken)).rejects.toThrow(UnauthorizedException)

      const dev2Rotated = await service.refresh(dev2.refreshToken)
      expect(dev2Rotated.accessToken).toBe('mock.jwt.token')

      // logoutAll revokes remaining device 2 family too
      await service.logoutAll('u-dev')
      await expect(service.refresh(dev2Rotated.refreshToken)).rejects.toThrow(UnauthorizedException)
    })

    it('rejects refresh for banned users even within the 10s leeway', async () => {
      const user = makeUser({ id: 'u-ban', email: 'ban@example.com', banned: false })
      mockPrismaUser.findUnique.mockResolvedValueOnce(user)
      const session = (await service.login({ email: 'ban@example.com', password: 'Senha@123' })) as any

      // Use once legitimately, then ban user before concurrent retry inside leeway
      mockPrismaUser.findUnique.mockResolvedValueOnce(user)
      await service.refresh(session.refreshToken)

      mockPrismaUser.findUnique.mockResolvedValueOnce({ ...user, banned: true })
      await expect(service.refresh(session.refreshToken)).rejects.toThrow(UnauthorizedException)
    })

    it('nullifies password and revokes active refresh sessions when linking Google to an unverified account (M1)', async () => {
      const unverified = makeUser({
        id: 'u-m1',
        email: 'victim@example.com',
        emailVerified: false,
        googleId: null,
        password: '$2b$12$attackerPasswordHash',
      })
      mockPrismaUser.findUnique.mockResolvedValue(unverified)
      await service.login({ email: 'victim@example.com', password: 'Senha@123' })
      expect(refreshTokenStore.some((r) => r.userId === 'u-m1' && !r.revokedAt)).toBe(true)

      mockPrismaUser.findFirst.mockResolvedValueOnce(unverified)
      mockPrismaUser.update.mockResolvedValueOnce({ ...unverified, googleId: 'g-victim', emailVerified: true, password: null })

      await service.googleLogin({
        googleId: 'g-victim',
        email: 'victim@example.com',
        name: 'Victim',
        avatarUrl: null,
      })

      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-m1' },
          data: { googleId: 'g-victim', emailVerified: true, password: null },
        }),
      )
      // Old password session family must have been revoked
      expect(refreshTokenStore[0].revokedAt).toBeInstanceOf(Date)
    })

    it('preserves password when linking Google to an already verified account (M1)', async () => {
      const verified = makeUser({
        id: 'u-ver',
        email: 'verified@example.com',
        emailVerified: true,
        googleId: null,
        password: '$2b$12$legitHash',
      })
      mockPrismaUser.findFirst.mockResolvedValueOnce(verified)
      mockPrismaUser.update.mockResolvedValueOnce({ ...verified, googleId: 'g-legit' })

      await service.googleLogin({
        googleId: 'g-legit',
        email: 'verified@example.com',
        name: 'Verified User',
        avatarUrl: null,
      })

      const linkCall = mockPrismaUser.update.mock.calls[0][0]
      expect(linkCall.data).toEqual({ googleId: 'g-legit', emailVerified: true })
      expect(linkCall.data).not.toHaveProperty('password')
    })

    it('creates a new verified account when Google profile does not match any user (M1)', async () => {
      mockPrismaUser.findFirst.mockResolvedValueOnce(null)
      mockPrismaUser.create.mockResolvedValueOnce(
        makeUser({ id: 'u-newg', googleId: 'g-new', emailVerified: true, password: null }),
      )

      const res = await service.googleLogin({
        googleId: 'g-new',
        email: 'newgoogle@example.com',
        name: 'New Google',
        avatarUrl: null,
      })

      expect(mockPrismaUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            googleId: 'g-new',
            emailVerified: true,
          }),
        }),
      )
      expect(res.refreshToken).toBeTruthy()
    })
  })
})
