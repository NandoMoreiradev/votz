import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../prisma/prisma.service'

export interface ActiveContextPayload {
  type: 'ENTITY' | 'POLITICIAN' | 'COMPANY'
  id: string
  name: string
  logoUrl: string | null
  permissions: string[]
}

export interface JwtPayload {
  sub: string
  email: string
  type: string
  ctx?: ActiveContextPayload
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    })
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, type: true, banned: true, emailVerified: true },
    })

    if (!user || user.banned) {
      throw new UnauthorizedException()
    }

    return { ...user, ctx: payload.ctx ?? null }
  }
}
