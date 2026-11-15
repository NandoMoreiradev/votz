import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcrypt'
import { createHash, randomBytes, randomUUID } from 'crypto'
import { generateSecret, generateURI, verify as otpVerify } from 'otplib'
import * as QRCode from 'qrcode'
import { AccessEvent, OrgPermission, MembershipStatus, Prisma } from '@prisma/client'
import { TERMS_VERSION, PRIVACY_VERSION, MIN_AGE } from '@votz/shared-types'
import { PrismaService } from '../prisma/prisma.service'
import { MailService } from '../mail/mail.service'
import { AccessLogService } from '../access-log/access-log.service'
import { CryptoService } from '../crypto/crypto.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { ContextType } from './dto/switch-context.dto'
import { ActiveContextPayload } from './strategies/jwt.strategy'

const OTP_EPOCH_TOLERANCE = 30 // aceita código do período anterior (clock skew)

// Tolerância curta (10s) para corridas legítimas de refresh simultâneo (React StrictMode, multi-aba,
// AuthInit + interceptor 401) sem revogar a família do usuário. Após essa janela, o reuso continua
// sendo tratado como comprometimento e revoga toda a família.
const REFRESH_REUSE_LEEWAY_MS = 10_000

// ADMIN e MODERATOR exigem MFA no login — perfis organizacionais exigem MFA na troca de contexto
const MFA_REQUIRED_TYPES = ['ADMIN', 'MODERATOR'] as const
type MfaRequiredType = (typeof MFA_REQUIRED_TYPES)[number]

function requiresMandatoryMfa(type: string): type is MfaRequiredType {
  return MFA_REQUIRED_TYPES.includes(type as MfaRequiredType)
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function parseDurationMs(raw: string | undefined, fallbackMs = 7 * 24 * 60 * 60 * 1000): number {
  if (!raw) return fallbackMs
  const match = raw.trim().match(/^(\d+)\s*([smhd])$/i)
  if (!match) return fallbackMs
  const value = Number(match[1])
  const unit = match[2].toLowerCase()
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  }
  return value * multipliers[unit]
}

const USER_PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  type: true,
  verified: true,
  reputation: true,
  avatarUrl: true,
  emailVerified: true,
  mfaEnabled: true,
  termsAcceptedAt: true,
  termsVersion: true,
  privacyVersion: true,
  ageConfirmedAt: true,
  createdAt: true,
  password: true,
} as const

function toPublicUser<T extends {
  id: string
  name: string
  email: string
  type: unknown
  verified: boolean
  reputation: number
  avatarUrl: string | null
  emailVerified: boolean
  mfaEnabled: boolean
  termsAcceptedAt?: Date | null
  termsVersion?: string | null
  privacyVersion?: string | null
  ageConfirmedAt?: Date | null
  createdAt: Date
  password?: string | null
}>(user: T) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    type: user.type,
    verified: user.verified,
    reputation: user.reputation,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    mfaEnabled: user.mfaEnabled,
    hasPassword: Boolean(user.password),
    termsAcceptedAt: user.termsAcceptedAt ?? null,
    termsVersion: user.termsVersion ?? null,
    privacyVersion: user.privacyVersion ?? null,
    ageConfirmedAt: user.ageConfirmedAt ?? null,
    createdAt: user.createdAt,
  }
}

// Valid cost-12 bcrypt hash used to equalize password verification timing for unknown accounts.
const DUMMY_BCRYPT_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO6Y.7r7O5F7E8yN0W2L7gK3v6gL9S6mK'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly accessLog: AccessLogService,
    private readonly crypto: CryptoService,
  ) {}

  private decryptMfaSecret(stored: string): string {
    // Plaintext Base32 secrets never contain ':'; encrypted ciphertexts always do.
    if (!stored.includes(':')) {
      return stored
    }
    return this.crypto.decrypt(stored)
  }

  // ─────────────────────────────────────────────
  // REGISTER
  // ─────────────────────────────────────────────

  async register(dto: RegisterDto, ip = 'unknown') {
    if (dto.confirmAge18 !== true) {
      throw new BadRequestException(`É preciso ter ${MIN_AGE} anos ou mais para criar uma conta.`)
    }
    if (
      dto.acceptedTermsVersion !== TERMS_VERSION ||
      dto.acceptedPrivacyVersion !== PRIVACY_VERSION
    ) {
      throw new ConflictException(
        'Os Termos foram atualizados. Recarregue a página e aceite novamente.',
      )
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (existing) throw new ConflictException('Email already registered')

    const passwordHash = await bcrypt.hash(dto.password, 12)
    const verificationToken = randomUUID()
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const now = new Date()

    const created = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: passwordHash,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpires,
        phone: dto.phone,
        zipCode: dto.zipCode,
        streetNumber: dto.streetNumber,
        complement: dto.complement,
        street: dto.street,
        neighborhood: dto.neighborhood,
        city: dto.city,
        state: dto.state,
        latitude: dto.latitude,
        longitude: dto.longitude,
        termsAcceptedAt: now,
        ageConfirmedAt: now,
        termsVersion: dto.acceptedTermsVersion,
        privacyVersion: dto.acceptedPrivacyVersion,
      },
      select: USER_PUBLIC_SELECT,
    })

    const user = toPublicUser(created)

    await this.mail.sendVerificationEmail(user.email, user.name, verificationToken)

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, String(user.type))
    void this.accessLog.record(user.id, AccessEvent.REGISTER, ip)

    return { user, accessToken, refreshToken }
  }

  // ─────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────

  async login(dto: LoginDto, ip = 'unknown') {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })

    if (!user || !user.password) {
      await bcrypt.compare(dto.password, DUMMY_BCRYPT_HASH)
      throw new UnauthorizedException('Invalid credentials')
    }
    if (user.banned) throw new UnauthorizedException('Account suspended')

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000)
      throw new HttpException(
        `Account locked. Try again in ${minutesLeft} minute(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password)

    if (!isPasswordValid) {
      const attempts = user.failedLoginAttempts + 1
      const shouldLock = attempts >= 5
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: shouldLock ? new Date(Date.now() + 15 * 60_000) : null,
        },
      })
      throw new UnauthorizedException(
        shouldLock
          ? 'Too many failed attempts. Account locked for 15 minutes.'
          : 'Invalid credentials',
      )
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), inactivityNoticeSentAt: null, failedLoginAttempts: 0, lockedUntil: null },
    })

    // Se MFA habilitado → emite token temporário de 5 min para verificação
    if (user.mfaEnabled) {
      const mfaToken = await this.jwt.signAsync(
        { sub: user.id, type: 'mfa_pending' },
        { secret: this.config.getOrThrow('JWT_SECRET'), expiresIn: '5m', algorithm: 'HS256' },
      )
      return { requiresMfa: true, mfaToken }
    }

    // Perfis privilegiados sem MFA ativo → bloqueio com token de setup
    if (requiresMandatoryMfa(user.type)) {
      const mfaSetupToken = await this.jwt.signAsync(
        { sub: user.id, type: 'mfa_setup_required' },
        { secret: this.config.getOrThrow('JWT_SECRET'), expiresIn: '30m', algorithm: 'HS256' },
      )
      return { requiresMfaSetup: true, mfaSetupToken }
    }

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.type)
    void this.accessLog.record(user.id, AccessEvent.LOGIN, ip)

    const publicUser = toPublicUser(user)

    return { requiresMfa: false, user: publicUser, accessToken, refreshToken }
  }

  // ─────────────────────────────────────────────
  // REFRESH / LOGOUT / ME
  // ─────────────────────────────────────────────

  async refresh(rawRefreshToken: string | undefined) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Missing refresh token')
    }

    const tokenHash = hashRefreshToken(rawRefreshToken)
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: { select: { id: true, email: true, type: true, banned: true } },
      },
    })

    const now = new Date()
    if (!stored || stored.revokedAt || stored.expiresAt <= now) {
      throw new UnauthorizedException('Invalid or expired refresh token')
    }
    if (!stored.user || stored.user.banned) {
      throw new UnauthorizedException('Account suspended')
    }

    if (stored.usedAt) {
      if (this.isWithinReuseLeeway(stored.usedAt, now)) {
        return this.issueLeewayRefresh(stored.user, stored.familyId, now)
      }
      await this.revokeFamily(stored.familyId, now)
      throw new UnauthorizedException('Refresh token reuse detected')
    }

    const newRefreshToken = randomBytes(48).toString('base64url')
    const newTokenHash = hashRefreshToken(newRefreshToken)
    const expiresAt = new Date(
      now.getTime() + parseDurationMs(this.config.get('JWT_REFRESH_EXPIRES_IN', '7d')),
    )

    const rotated = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.refreshToken.updateMany({
        where: { id: stored.id, usedAt: null, revokedAt: null },
        data: { usedAt: now },
      })
      if (claim.count !== 1) return false

      await tx.refreshToken.create({
        data: {
          userId: stored.userId,
          familyId: stored.familyId,
          tokenHash: newTokenHash,
          expiresAt,
        },
      })

      await tx.user.update({
        where: { id: stored.userId },
        data: { lastLoginAt: now, inactivityNoticeSentAt: null },
      })

      return true
    })

    if (!rotated) {
      const latest = await this.prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: { usedAt: true, revokedAt: true },
      })
      if (!latest || latest.revokedAt) {
        throw new UnauthorizedException('Invalid or expired refresh token')
      }
      if (latest.usedAt && this.isWithinReuseLeeway(latest.usedAt, now)) {
        return this.issueLeewayRefresh(stored.user, stored.familyId, now)
      }
      await this.revokeFamily(stored.familyId, now)
      throw new UnauthorizedException('Refresh token reuse detected')
    }

    const accessToken = await this.signAccessToken(
      stored.user.id,
      stored.user.email,
      stored.user.type,
    )
    return { accessToken, refreshToken: newRefreshToken }
  }

  private isWithinReuseLeeway(usedAt: Date, now: Date): boolean {
    return now.getTime() - usedAt.getTime() < REFRESH_REUSE_LEEWAY_MS
  }

  private async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    })
  }

  private async issueLeewayRefresh(
    user: { id: string; email: string; type: string },
    familyId: string,
    now: Date,
  ) {
    this.logger.warn(
      `Concurrent refresh tolerated within ${REFRESH_REUSE_LEEWAY_MS}ms leeway for user ${user.id}`,
    )
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(user.id, user.email, user.type),
      this.issueRefreshToken(user.id, familyId),
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now, inactivityNoticeSentAt: null },
      }),
    ])
    return { accessToken, refreshToken }
  }

  async logout(userId: string, rawRefreshToken?: string) {
    if (!rawRefreshToken) return
    const tokenHash = hashRefreshToken(rawRefreshToken)
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { userId: true, familyId: true },
    })
    if (!token || token.userId !== userId) return
    await this.prisma.refreshToken.updateMany({
      where: { userId, familyId: token.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: USER_PUBLIC_SELECT })
    return user ? toPublicUser(user) : null
  }

  // ─────────────────────────────────────────────
  // EMAIL VERIFICATION
  // ─────────────────────────────────────────────

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findUnique({
      where: { emailVerificationToken: token },
      select: { id: true, emailVerified: true, emailVerificationExpires: true },
    })

    if (!user) throw new BadRequestException('Invalid or expired verification token')
    if (user.emailVerified) return { message: 'Email already verified' }
    if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
      throw new BadRequestException('Verification token expired. Request a new one.')
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null },
    })

    return { message: 'Email verified successfully' }
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, emailVerified: true },
    })
    if (!user) throw new NotFoundException('User not found')
    if (user.emailVerified) throw new BadRequestException('Email already verified')

    const token = randomUUID()
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerificationToken: token, emailVerificationExpires: expires },
    })
    await this.mail.sendVerificationEmail(user.email, user.name, token)
    return { message: 'Verification email sent' }
  }

  // ─────────────────────────────────────────────
  // MFA — SETUP
  // ─────────────────────────────────────────────

  async mfaSetup(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, mfaEnabled: true },
    })
    if (!user) throw new NotFoundException('User not found')
    if (user.mfaEnabled) throw new BadRequestException('MFA already enabled')

    const secret = generateSecret({ length: 20 })
    const otpauthUrl = generateURI({ issuer: 'Votz', label: user.email, secret })
    const qrCode = await QRCode.toDataURL(otpauthUrl)

    // Salva secret cifrado temporariamente (ainda não está habilitado)
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: this.crypto.encrypt(secret) },
    })

    return { secret, otpauthUrl, qrCode }
  }

  // ─────────────────────────────────────────────
  // MFA — ENABLE (confirma com primeiro código)
  // ─────────────────────────────────────────────

  async mfaEnable(userId: string, code: string, fromSetupFlow = false, ip = 'unknown') {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...USER_PUBLIC_SELECT, mfaSecret: true },
    })
    if (!user) throw new NotFoundException('User not found')
    if (user.mfaEnabled) throw new BadRequestException('MFA already enabled')
    if (!user.mfaSecret) throw new BadRequestException('Run MFA setup first')

    const mfaSecret = this.decryptMfaSecret(user.mfaSecret)
    const { valid } = await otpVerify({ token: code, secret: mfaSecret, epochTolerance: OTP_EPOCH_TOLERANCE })
    if (!valid) throw new UnauthorizedException('Invalid TOTP code')

    // Gera 8 backup codes
    const plainCodes = Array.from({ length: 8 }, () =>
      randomBytes(5).toString('hex').toUpperCase(),
    )
    const hashedCodes = await Promise.all(plainCodes.map((c) => bcrypt.hash(c, 6)))

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaBackupCodes: hashedCodes },
    })

    await this.mail.sendMfaBackupCodes(user.email, user.name, plainCodes)

    // Fluxo de setup obrigatório: emite tokens completos para concluir o login
    if (fromSetupFlow) {
      const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.type)
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date(), inactivityNoticeSentAt: null },
      })
      void this.accessLog.record(user.id, AccessEvent.MFA_LOGIN, ip)
      const publicUser = toPublicUser({ ...user, mfaEnabled: true })
      return { backupCodes: plainCodes, accessToken, refreshToken, user: publicUser }
    }

    return { backupCodes: plainCodes }
  }

  // ─────────────────────────────────────────────
  // MFA — VERIFY (durante o login)
  // ─────────────────────────────────────────────

  async mfaVerifyLogin(mfaToken: string, code: string, ip = 'unknown') {
    let payload: { sub: string; type: string }
    try {
      payload = await this.jwt.verifyAsync(mfaToken, {
        secret: this.config.getOrThrow('JWT_SECRET'),
        algorithms: ['HS256'],
      })
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token')
    }

    if (payload.type !== 'mfa_pending') throw new UnauthorizedException('Invalid token type')

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        ...USER_PUBLIC_SELECT,
        mfaSecret: true,
        mfaBackupCodes: true,
        mfaFailedAttempts: true,
        mfaLockedUntil: true,
      },
    })
    if (!user || !user.mfaEnabled || !user.mfaSecret) throw new UnauthorizedException()

    if (user.mfaLockedUntil && user.mfaLockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.mfaLockedUntil.getTime() - Date.now()) / 60_000)
      throw new HttpException(
        `MFA temporarily locked. Try again in ${minutesLeft} minute(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    // Tenta TOTP primeiro; se falhar, tenta backup codes
    const mfaSecret = this.decryptMfaSecret(user.mfaSecret)
    const { valid: totpValid } = await otpVerify({ token: code, secret: mfaSecret, epochTolerance: OTP_EPOCH_TOLERANCE })

    let mfaValid = totpValid
    if (!mfaValid) {
      const backupIndex = await this.findAndConsumeBackupCode(user.id, user.mfaBackupCodes, code)
      mfaValid = backupIndex !== -1
    }

    if (!mfaValid) {
      const baseAttempts = user.mfaLockedUntil ? 0 : (user.mfaFailedAttempts ?? 0)
      const attempts = baseAttempts + 1
      const shouldLock = attempts >= 5
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          mfaFailedAttempts: attempts,
          mfaLockedUntil: shouldLock ? new Date(Date.now() + 15 * 60_000) : null,
        },
      })
      throw new UnauthorizedException('Invalid MFA code')
    }

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.type)
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        inactivityNoticeSentAt: null,
        mfaFailedAttempts: 0,
        mfaLockedUntil: null,
      },
    })
    void this.accessLog.record(user.id, AccessEvent.MFA_LOGIN, ip)

    const publicUser = toPublicUser(user)

    return { user: publicUser, accessToken, refreshToken }
  }

  // ─────────────────────────────────────────────
  // MFA — DISABLE
  // ─────────────────────────────────────────────

  async mfaDisable(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, type: true, mfaEnabled: true, mfaSecret: true, mfaBackupCodes: true },
    })
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA is not enabled')
    }

    if (requiresMandatoryMfa(user.type)) {
      throw new ForbiddenException('MFA cannot be disabled for this account type')
    }

    const mfaSecret = this.decryptMfaSecret(user.mfaSecret)
    const { valid: totpValid } = await otpVerify({ token: code, secret: mfaSecret, epochTolerance: OTP_EPOCH_TOLERANCE })

    if (!totpValid) {
      const backupIndex = await this.findAndConsumeBackupCode(user.id, user.mfaBackupCodes, code)
      if (backupIndex === -1) throw new UnauthorizedException('Invalid MFA code')
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] },
    })

    return { message: 'MFA disabled' }
  }

  // ─────────────────────────────────────────────
  // MFA — RESET DEVICE (trocar aparelho autenticador)
  // ─────────────────────────────────────────────

  async mfaResetDevice(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, mfaEnabled: true, mfaSecret: true, mfaBackupCodes: true },
    })
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA is not enabled')
    }

    const currentSecret = this.decryptMfaSecret(user.mfaSecret)
    const { valid: totpValid } = await otpVerify({ token: code, secret: currentSecret, epochTolerance: OTP_EPOCH_TOLERANCE })

    if (!totpValid) {
      const backupIndex = await this.findAndConsumeBackupCode(user.id, user.mfaBackupCodes, code)
      if (backupIndex === -1) throw new UnauthorizedException('Invalid MFA code')
    }

    // Gera novo secret e suspende MFA até confirmar com o novo dispositivo
    const newSecret = generateSecret({ length: 20 })
    const otpauthUrl = generateURI({ issuer: 'Votz', label: user.email, secret: newSecret })
    const qrCode = await QRCode.toDataURL(otpauthUrl)

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: this.crypto.encrypt(newSecret), mfaBackupCodes: [] },
    })

    return { secret: newSecret, otpauthUrl, qrCode }
  }

  // ─────────────────────────────────────────────
  // MFA — REGENERATE BACKUP CODES
  // ─────────────────────────────────────────────

  async mfaRegenerateBackupCodes(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, mfaEnabled: true, mfaSecret: true },
    })
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA is not enabled')
    }

    const mfaSecret = this.decryptMfaSecret(user.mfaSecret)
    const { valid } = await otpVerify({ token: code, secret: mfaSecret, epochTolerance: OTP_EPOCH_TOLERANCE })
    if (!valid) throw new UnauthorizedException('Invalid TOTP code')

    const plainCodes = Array.from({ length: 8 }, () =>
      randomBytes(5).toString('hex').toUpperCase(),
    )
    const hashedCodes = await Promise.all(plainCodes.map((c) => bcrypt.hash(c, 6)))

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaBackupCodes: hashedCodes },
    })

    await this.mail.sendMfaBackupCodes(user.email, user.name, plainCodes)

    return { backupCodes: plainCodes }
  }

  // ─────────────────────────────────────────────
  // GOOGLE OAUTH
  // ─────────────────────────────────────────────

  async googleLogin(profile: { googleId: string; email: string; name: string; avatarUrl: string | null }, ip = 'unknown') {
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId: profile.googleId }, { email: profile.email }] },
      select: { ...USER_PUBLIC_SELECT, googleId: true, type: true },
    })

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          googleId: profile.googleId,
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          emailVerified: true,
        },
        select: { ...USER_PUBLIC_SELECT, googleId: true, type: true },
      })
    } else if (!user.googleId) {
      if (!user.emailVerified) {
        // M1: conta cadastrada com senha sem verificação de e-mail pode ser pré-sequestro;
        // anula a senha e revoga sessões existentes antes de vincular o Google OAuth.
        await this.logoutAll(user.id)
      }
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: profile.googleId,
          emailVerified: true,
          ...(!user.emailVerified ? { password: null } : {}),
        },
        select: { ...USER_PUBLIC_SELECT, googleId: true, type: true },
      })
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), inactivityNoticeSentAt: null },
    })

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.type)
    void this.accessLog.record(user.id, AccessEvent.GOOGLE_LOGIN, ip)

    return { user: toPublicUser(user), accessToken, refreshToken }
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private async findAndConsumeBackupCode(
    userId: string,
    hashes: string[],
    code: string,
  ): Promise<number> {
    for (let i = 0; i < hashes.length; i++) {
      const match = await bcrypt.compare(code.toUpperCase(), hashes[i])
      if (match) {
        const remaining = [...hashes]
        remaining.splice(i, 1)
        await this.prisma.user.update({
          where: { id: userId },
          data: { mfaBackupCodes: remaining },
        })
        return i
      }
    }
    return -1
  }

  // ─────────────────────────────────────────────
  // MULTI-PROFILE
  // ─────────────────────────────────────────────

  async getMyProfiles(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        type: true,
        avatarUrl: true,
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          select: {
            orgType: true,
            orgId: true,
            role: { select: { name: true, permissions: true } },
          },
        },
      },
    })

    if (!user) throw new UnauthorizedException()

    type OrgProfile = {
      id: string
      name: string
      type: 'ENTITY' | 'POLITICIAN' | 'COMPANY'
      logoUrl: string | null
      verified: boolean
      role: string
      permissions: OrgPermission[]
    }

    const orgs: OrgProfile[] = []

    for (const membership of user.memberships) {
      if (membership.orgType === 'ENTITY') {
        const entity = await this.prisma.entity.findUnique({
          where: { id: membership.orgId },
          select: { legalName: true, logoUrl: true, verified: true },
        })
        if (entity) {
          orgs.push({
            id: membership.orgId,
            name: entity.legalName,
            type: 'ENTITY',
            logoUrl: entity.logoUrl,
            verified: entity.verified,
            role: membership.role.name,
            permissions: membership.role.permissions,
          })
        }
      } else if (membership.orgType === 'POLITICIAN') {
        const politician = await this.prisma.politician.findUnique({
          where: { id: membership.orgId },
          select: { verified: true, office: true, createdByUserId: true },
        })
        if (politician) {
          const displayName = await this.resolvePoliticianName(politician.createdByUserId, politician.office)
          const displayAvatar = await this.resolvePoliticianAvatar(politician.createdByUserId)
          orgs.push({
            id: membership.orgId,
            name: displayName,
            type: 'POLITICIAN',
            logoUrl: displayAvatar,
            verified: politician.verified,
            role: membership.role.name,
            permissions: membership.role.permissions,
          })
        }
      } else if (membership.orgType === 'COMPANY') {
        const company = await this.prisma.company.findUnique({
          where: { id: membership.orgId },
          select: { tradeName: true, logoUrl: true },
        })
        if (company) {
          orgs.push({
            id: membership.orgId,
            name: company.tradeName,
            type: 'COMPANY',
            logoUrl: company.logoUrl,
            verified: false,
            role: membership.role.name,
            permissions: membership.role.permissions,
          })
        }
      }
    }

    return {
      personal: {
        id: user.id,
        name: user.name,
        type: user.type,
        avatarUrl: user.avatarUrl,
      },
      orgs,
    }
  }

  async switchContext(userId: string, contextType: ContextType, contextId?: string, mfaCode?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, type: true, mfaEnabled: true, mfaSecret: true },
    })
    if (!user) throw new UnauthorizedException()

    if (contextType === 'personal') {
      const accessToken = await this.signAccessToken(userId, user.email, user.type)
      return { accessToken, ctx: null }
    }

    if (!contextId) throw new BadRequestException('contextId é obrigatório')

    // Contextos elevados exigem MFA — o risco está em agir como político/entidade/empresa
    if (!user.mfaEnabled) {
      return { requiresMfaSetup: true }
    }

    if (!mfaCode) {
      return { requiresMfa: true }
    }

    const mfaSecret = this.decryptMfaSecret(user.mfaSecret!)
    const { valid } = await otpVerify({ token: mfaCode, secret: mfaSecret, epochTolerance: OTP_EPOCH_TOLERANCE })
    if (!valid) throw new UnauthorizedException('Código MFA inválido')

    const ctx = await this.resolveOrgContext(userId, contextType, contextId)
    const accessToken = await this.signAccessToken(userId, user.email, user.type, ctx)
    return { accessToken, ctx }
  }

  private async resolveOrgContext(
    userId: string,
    contextType: ContextType,
    contextId: string,
  ): Promise<ActiveContextPayload> {
    if (contextType === 'entity') {
      const entity = await this.prisma.entity.findUnique({
        where: { id: contextId },
        select: { legalName: true, logoUrl: true },
      })
      if (!entity) throw new NotFoundException('Entidade não encontrada')

      const membership = await this.prisma.orgMembership.findUnique({
        where: { userId_orgType_orgId: { userId, orgType: 'ENTITY', orgId: contextId } },
        select: { status: true, role: { select: { permissions: true } } },
      })
      if (!membership || membership.status !== MembershipStatus.ACTIVE) {
        throw new ForbiddenException('Sem acesso ativo a esta entidade')
      }
      return { type: 'ENTITY', id: contextId, name: entity.legalName, logoUrl: entity.logoUrl, permissions: membership.role.permissions }
    }

    if (contextType === 'politician') {
      const politician = await this.prisma.politician.findUnique({
        where: { id: contextId },
        select: { office: true, createdByUserId: true },
      })
      if (!politician) throw new NotFoundException('Político não encontrado')

      const membership = await this.prisma.orgMembership.findUnique({
        where: { userId_orgType_orgId: { userId, orgType: 'POLITICIAN', orgId: contextId } },
        select: { status: true, role: { select: { permissions: true } } },
      })
      if (!membership || membership.status !== MembershipStatus.ACTIVE) {
        throw new ForbiddenException('Sem acesso ativo a este perfil de político')
      }

      const displayName = await this.resolvePoliticianName(politician.createdByUserId, politician.office)
      const displayAvatar = await this.resolvePoliticianAvatar(politician.createdByUserId)
      return { type: 'POLITICIAN', id: contextId, name: displayName, logoUrl: displayAvatar, permissions: membership.role.permissions }
    }

    if (contextType === 'company') {
      const company = await this.prisma.company.findUnique({
        where: { id: contextId },
        select: { tradeName: true, logoUrl: true },
      })
      if (!company) throw new NotFoundException('Empresa não encontrada')

      const membership = await this.prisma.orgMembership.findUnique({
        where: { userId_orgType_orgId: { userId, orgType: 'COMPANY', orgId: contextId } },
        select: { status: true, role: { select: { permissions: true } } },
      })
      if (!membership || membership.status !== MembershipStatus.ACTIVE) {
        throw new ForbiddenException('Sem acesso ativo a esta empresa')
      }
      return { type: 'COMPANY', id: contextId, name: company.tradeName, logoUrl: company.logoUrl, permissions: membership.role.permissions }
    }

    throw new BadRequestException('Tipo de contexto inválido')
  }

  private async resolvePoliticianName(createdByUserId: string | null, office: string): Promise<string> {
    if (!createdByUserId) return office
    const owner = await this.prisma.user.findUnique({
      where: { id: createdByUserId },
      select: { name: true },
    })
    return owner?.name ?? office
  }

  private async resolvePoliticianAvatar(createdByUserId: string | null): Promise<string | null> {
    if (!createdByUserId) return null
    const owner = await this.prisma.user.findUnique({
      where: { id: createdByUserId },
      select: { avatarUrl: true },
    })
    return owner?.avatarUrl ?? null
  }

  private async signAccessToken(
    userId: string,
    email: string,
    type: string,
    ctx?: ActiveContextPayload,
  ): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, email, type, typ: 'access', ...(ctx ? { ctx } : {}) },
      {
        secret: this.config.getOrThrow('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
        algorithm: 'HS256',
      },
    )
  }

  private async issueRefreshToken(
    userId: string,
    familyId: string = randomUUID(),
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<string> {
    const refreshToken = randomBytes(48).toString('base64url')
    const tokenHash = hashRefreshToken(refreshToken)
    const expiresAt = new Date(
      Date.now() + parseDurationMs(this.config.get('JWT_REFRESH_EXPIRES_IN', '7d')),
    )
    await db.refreshToken.create({
      data: { userId, familyId, tokenHash, expiresAt },
    })
    return refreshToken
  }

  private async generateTokens(userId: string, email: string, type: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(userId, email, type),
      this.issueRefreshToken(userId),
    ])
    return { accessToken, refreshToken }
  }
}
