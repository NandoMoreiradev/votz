import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { Request } from 'express'
import { PrismaService } from '../../prisma/prisma.service'
import * as bcrypt from 'bcrypt'

function extractRefreshFromCookie(req: Request): string | null {
  return req.cookies?.['votz:refresh_token'] ?? null
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: extractRefreshFromCookie,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    })
  }

  async validate(req: Request, payload: { sub: string; email: string; type: string }) {
    const token = extractRefreshFromCookie(req)
    if (!token) throw new UnauthorizedException()

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, type: true, banned: true, refreshTokenHash: true },
    })

    if (!user || user.banned || !user.refreshTokenHash) throw new UnauthorizedException()

    const isValid = await bcrypt.compare(token, user.refreshTokenHash)
    if (!isValid) throw new UnauthorizedException()

    return { id: user.id, email: user.email, type: user.type }
  }
}
