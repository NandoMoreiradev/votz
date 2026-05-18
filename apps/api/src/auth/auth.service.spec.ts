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
import { AuthService } from './auth.service'
import { PrismaService } from '../prisma/prisma.service'
import { MailService } from '../mail/mail.service'

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

const mockPrismaUser = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
}

const mockPrisma = { user: mockPrismaUser }

const mockJwt = {
  signAsync: jest.fn().mockResolvedValue('mock.jwt.token'),
  verifyAsync: jest.fn(),
}

const mockConfig = {
  getOrThrow: jest.fn((key: string) => {
    const cfg: Record<string, string> = {
      JWT_SECRET: 'test-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
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
    refreshTokenHash: null,
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
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
    jest.clearAllMocks()

    // Restore default implementations after clearAllMocks
    ;(bcrypt.hash as jest.Mock).mockResolvedValue('$2b$12$hashed')
    ;(bcrypt.compare as jest.Mock).mockResolvedValue(true)
    mockJwt.signAsync.mockResolvedValue('mock.jwt.token')
    mockPrismaUser.update.mockResolvedValue({})
    mockMail.sendVerificationEmail.mockResolvedValue(undefined)
    mockMail.sendMfaBackupCodes.mockResolvedValue(undefined)
    mockConfig.getOrThrow.mockImplementation((key: string) => {
      const cfg: Record<string, string> = {
        JWT_SECRET: 'test-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
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
    } as any

    it('throws ConflictException when email is already registered', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser())

      await expect(service.register(dto)).rejects.toThrow(ConflictException)
    })

    it('creates user, sends verification email, and returns tokens', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null)
      mockPrismaUser.create.mockResolvedValue(makeUser({ email: dto.email }))

      const result = await service.register(dto)

      expect(mockPrismaUser.create).toHaveBeenCalledTimes(1)
      expect(mockMail.sendVerificationEmail).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
      )
      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('user')
    })
  })

  // ──────────────────────────────────────────────
  // login()
  // ──────────────────────────────────────────────

  describe('login', () => {
    const dto = { email: 'test@example.com', password: 'Senha@123' }

    it('throws UnauthorizedException when user is not found', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null)
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException)
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

    it.each(['ENTITY', 'POLITICIAN', 'COMPANY', 'ADMIN'])(
      'returns mfaSetupToken for %s without MFA (mandatory MFA)',
      async (type) => {
        mockPrismaUser.findUnique.mockResolvedValue(makeUser({ type }))

        const result = await service.login(dto)

        expect(result).toEqual(expect.objectContaining({ requiresMfaSetup: true, mfaSetupToken: expect.any(String) }))
      },
    )

    it('returns access and refresh tokens for CITIZEN without MFA', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser({ type: 'CITIZEN' }))

      const result = await service.login(dto) as any

      expect(result.requiresMfa).toBe(false)
      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('user')
    })

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

    it('returns secret, otpauthUrl, and qrCode', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(makeUser())

      const result = await service.mfaSetup('u1')

      expect(result).toHaveProperty('secret')
      expect(result).toHaveProperty('qrCode')
      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ mfaSecret: expect.any(String) }) }),
      )
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

    it.each(['ENTITY', 'POLITICIAN', 'COMPANY', 'ADMIN'])(
      'throws ForbiddenException for %s (MFA is mandatory)',
      async (type) => {
        mockPrismaUser.findUnique.mockResolvedValue(
          makeUser({ type, mfaEnabled: true, mfaSecret: 'SECRET' }),
        )
        await expect(service.mfaDisable('u1', '123456')).rejects.toThrow(ForbiddenException)
      },
    )

    it('disables MFA for CITIZEN with valid TOTP code', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(
        makeUser({ type: 'CITIZEN', mfaEnabled: true, mfaSecret: 'SECRET' }),
      )

      const result = await service.mfaDisable('u1', '123456')

      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mfaEnabled: false, mfaSecret: null }),
        }),
      )
      expect(result).toEqual({ message: 'MFA disabled' })
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
})
