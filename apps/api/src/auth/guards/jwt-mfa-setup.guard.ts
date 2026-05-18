import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'

/**
 * Valida tokens do tipo `mfa_setup_required`.
 * Emitidos no login de perfis privilegiados que ainda não ativaram MFA.
 * Permite acesso apenas a /auth/mfa/setup e /auth/mfa/enable.
 */
@Injectable()
export class JwtMfaSetupGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest()
    const auth: string | undefined = request.headers['authorization']

    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException()

    const token = auth.slice(7)

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; type: string }>(token, {
        secret: this.config.getOrThrow('JWT_SECRET'),
      })

      if (payload.type !== 'mfa_setup_required') throw new UnauthorizedException()

      request.user = { id: payload.sub, fromSetupFlow: true }
      return true
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA setup token')
    }
  }
}
