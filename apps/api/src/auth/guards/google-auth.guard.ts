import { ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super()
  }

  canActivate(context: ExecutionContext) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID', '')
    if (!clientId || clientId === 'not-configured') {
      throw new ServiceUnavailableException(
        'Google OAuth não está configurado neste ambiente. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.',
      )
    }
    return super.canActivate(context)
  }
}
