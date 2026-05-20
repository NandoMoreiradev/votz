import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcrypt'
import { randomBytes, randomUUID } from 'crypto'
import { generateSecret, generateURI, verify as otpVerify } from 'otplib'
import * as QRCode from 'qrcode'
import { OrgPermission, MembershipStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { MailService } from '../mail/mail.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { ContextType } from './dto/switch-context.dto'
import { ActiveContextPayload } from './strategies/jwt.strategy'

const OTP_EPOCH_TOLERANCE = 30 // aceita código do período anterior (clock skew)

// Perfis que exigem MFA obrigatório conforme escopo (seção 16.2)
const MFA_REQUIRED_TYPES = ['ENTITY', 'POLITICIAN', 'COMPANY', 'ADMIN'] as const
type MfaRequiredType = (typeof MFA_REQUIRED_TYPES)[number]

function requiresMandatoryMfa(type: string): type is MfaRequiredType {
  return MFA_REQUIRED_TYPES.includes(type as MfaRequiredType)
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
  createdAt: true,
} as const

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  // ─────────────────────────────────────────────
  // REGISTER
  // ─────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (existing) throw new ConflictException('Email already registered')

    const passwordHash = await bcrypt.hash(dto.password, 12)
    const verificationToken = randomUUID()
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)

    const user = await this.prisma.user.create({
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
      },
      select: USER_PUBLIC_SELECT,
    })

    await this.mail.sendVerificationEmail(user.email, user.name, verificationToken)

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.type)
    await this.storeRefreshHash(user.id, refreshToken)

    return { user, accessToken, refreshToken }
  }

  // ─────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })

    if (!user || !user.password) throw new UnauthorizedException('Invalid credentials')
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
      data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    })

    // Se MFA habilitado → emite token temporário de 5 min para verificação
    if (user.mfaEnabled) {
      const mfaToken = await this.jwt.signAsync(
        { sub: user.id, type: 'mfa_pending' },
        { secret: this.config.getOrThrow('JWT_SECRET'), expiresIn: '5m' },
      )
      return { requiresMfa: true, mfaToken }
    }

    // Perfis privilegiados sem MFA ativo → bloqueio com token de setup
    if (requiresMandatoryMfa(user.type)) {
      const mfaSetupToken = await this.jwt.signAsync(
        { sub: user.id, type: 'mfa_setup_required' },
        { secret: this.config.getOrThrow('JWT_SECRET'), expiresIn: '30m' },
      )
      return { requiresMfaSetup: true, mfaSetupToken }
    }

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.type)
    await this.storeRefreshHash(user.id, refreshToken)

    const publicUser = {
      id: user.id, name: user.name, email: user.email, type: user.type,
      verified: user.verified, reputation: user.reputation, avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified, createdAt: user.createdAt,
    }

    return { requiresMfa: false, user: publicUser, accessToken, refreshToken }
  }

  // ─────────────────────────────────────────────
  // REFRESH / LOGOUT / ME
  // ─────────────────────────────────────────────

  async refresh(userId: string, email: string, type: string) {
    const { accessToken, refreshToken } = await this.generateTokens(userId, email, type)
    await this.storeRefreshHash(userId, refreshToken)
    return { accessToken, refreshToken }
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    })
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: USER_PUBLIC_SELECT })
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

    // Salva secret temporariamente (ainda não está habilitado)
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret } })

    return { secret, otpauthUrl, qrCode }
  }

  // ─────────────────────────────────────────────
  // MFA — ENABLE (confirma com primeiro código)
  // ─────────────────────────────────────────────

  async mfaEnable(userId: string, code: string, fromSetupFlow = false) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, type: true, verified: true, reputation: true, avatarUrl: true, emailVerified: true, createdAt: true, mfaEnabled: true, mfaSecret: true },
    })
    if (!user) throw new NotFoundException('User not found')
    if (user.mfaEnabled) throw new BadRequestException('MFA already enabled')
    if (!user.mfaSecret) throw new BadRequestException('Run MFA setup first')

    const { valid } = await otpVerify({ token: code, secret: user.mfaSecret, epochTolerance: OTP_EPOCH_TOLERANCE })
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
      await this.storeRefreshHash(user.id, refreshToken)
      const publicUser = {
        id: user.id, name: user.name, email: user.email, type: user.type,
        verified: user.verified, reputation: user.reputation, avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified, createdAt: user.createdAt,
      }
      return { backupCodes: plainCodes, accessToken, refreshToken, user: publicUser }
    }

    return { backupCodes: plainCodes }
  }

  // ─────────────────────────────────────────────
  // MFA — VERIFY (durante o login)
  // ─────────────────────────────────────────────

  async mfaVerifyLogin(mfaToken: string, code: string) {
    let payload: { sub: string; type: string }
    try {
      payload = await this.jwt.verifyAsync(mfaToken, {
        secret: this.config.getOrThrow('JWT_SECRET'),
      })
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token')
    }

    if (payload.type !== 'mfa_pending') throw new UnauthorizedException('Invalid token type')

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, email: true, name: true, type: true, verified: true,
        reputation: true, avatarUrl: true, emailVerified: true, createdAt: true,
        mfaSecret: true, mfaBackupCodes: true, mfaEnabled: true,
      },
    })
    if (!user || !user.mfaEnabled || !user.mfaSecret) throw new UnauthorizedException()

    // Tenta TOTP primeiro; se falhar, tenta backup codes
    const { valid: totpValid } = await otpVerify({ token: code, secret: user.mfaSecret, epochTolerance: OTP_EPOCH_TOLERANCE })

    if (!totpValid) {
      const backupIndex = await this.findAndConsumeBackupCode(user.id, user.mfaBackupCodes, code)
      if (backupIndex === -1) throw new UnauthorizedException('Invalid MFA code')
    }

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.type)
    await this.storeRefreshHash(user.id, refreshToken)

    const publicUser = {
      id: user.id, name: user.name, email: user.email, type: user.type,
      verified: user.verified, reputation: user.reputation, avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified, createdAt: user.createdAt,
    }

    return { user: publicUser, accessToken, refreshToken }
  }

  // ─────────────────────────────────────────────
  // MFA — DISABLE
  // ─────────────────────────────────────────────

  async mfaDisable(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, type: true, mfaEnabled: true, mfaSecret: true },
    })
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA is not enabled')
    }

    if (requiresMandatoryMfa(user.type)) {
      throw new ForbiddenException('MFA cannot be disabled for this account type')
    }

    const { valid: isValid } = await otpVerify({ token: code, secret: user.mfaSecret, epochTolerance: OTP_EPOCH_TOLERANCE })
    if (!isValid) throw new UnauthorizedException('Invalid TOTP code')

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] },
    })

    return { message: 'MFA disabled' }
  }

  // ─────────────────────────────────────────────
  // GOOGLE OAUTH
  // ─────────────────────────────────────────────

  async googleLogin(profile: { googleId: string; email: string; name: string; avatarUrl: string | null }) {
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
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { googleId: profile.googleId, emailVerified: true },
        select: { ...USER_PUBLIC_SELECT, googleId: true, type: true },
      })
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.type)
    await this.storeRefreshHash(user.id, refreshToken)

    return { user, accessToken, refreshToken }
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

  async switchContext(userId: string, contextType: ContextType, contextId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, type: true },
    })
    if (!user) throw new UnauthorizedException()

    if (contextType === 'personal') {
      const accessToken = await this.jwt.signAsync(
        { sub: userId, email: user.email, type: user.type },
        { secret: this.config.getOrThrow('JWT_SECRET'), expiresIn: this.config.get('JWT_EXPIRES_IN', '15m') },
      )
      return { accessToken, ctx: null }
    }

    if (!contextId) throw new BadRequestException('contextId é obrigatório')

    const ctx = await this.resolveOrgContext(userId, contextType, contextId)
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email: user.email, type: user.type, ctx },
      { secret: this.config.getOrThrow('JWT_SECRET'), expiresIn: this.config.get('JWT_EXPIRES_IN', '15m') },
    )
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

  private async generateTokens(userId: string, email: string, type: string) {
    const payload = { sub: userId, email, type }
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ])
    return { accessToken, refreshToken }
  }

  private async storeRefreshHash(userId: string, refreshToken: string) {
    const hash = await bcrypt.hash(refreshToken, 10)
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: hash } })
  }
}
