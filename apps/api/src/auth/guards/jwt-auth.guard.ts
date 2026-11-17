import { Injectable, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { IS_OPTIONAL_AUTH_KEY, IS_PUBLIC_KEY } from '../decorators/public.decorator'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super()
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isOptional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (isOptional) {
      const req = ctx.switchToHttp().getRequest<{ headers?: { authorization?: string } }>()
      if (!req?.headers?.authorization) return true
      try {
        await Promise.resolve(super.canActivate(ctx))
      } catch {
        // Optional auth: anonymous fallback if token is absent/expired
      }
      return true
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (isPublic) return true

    return Boolean(await Promise.resolve(super.canActivate(ctx)))
  }
}
