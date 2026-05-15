import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../prisma/prisma.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'

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
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (existing) throw new ConflictException('Email already registered')

    const passwordHash = await bcrypt.hash(dto.password, 12)

    const user = await this.prisma.user.create({
      data: { name: dto.name, email: dto.email, password: passwordHash },
      select: USER_PUBLIC_SELECT,
    })

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.type)
    await this.storeRefreshHash(user.id, refreshToken)

    return { user, accessToken, refreshToken }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })

    if (!user || !user.password) throw new UnauthorizedException('Invalid credentials')
    if (user.banned) throw new UnauthorizedException('Account suspended')

    const isPasswordValid = await bcrypt.compare(dto.password, user.password)
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials')

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.type)
    await this.storeRefreshHash(user.id, refreshToken)

    const publicUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      type: user.type,
      verified: user.verified,
      reputation: user.reputation,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    }

    return { user: publicUser, accessToken, refreshToken }
  }

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
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_PUBLIC_SELECT,
    })
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
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: hash },
    })
  }
}
