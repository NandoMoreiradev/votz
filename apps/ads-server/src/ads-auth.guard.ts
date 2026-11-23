import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'

/** O que o servidor de anúncios sabe da pessoa: só quem é. */
export interface AdsRequestUser {
  id: string
}

interface AccessPayload {
  sub?: string
  typ?: string
}

/**
 * Confere o token de acesso (o mesmo que a API emite) **sem ir ao banco**: assinatura HS256, validade e tipo "access".
 * É o que deixa o servidor de anúncios responder em milissegundos e continuar de pé se o banco der um soluço.
 * Custo aceito: quem foi banido continua vendo anúncio até o token vencer (15 minutos); anúncio não dá acesso a nada.
 * Troca de senha, banimento e saída continuam valendo na API.
 */
@Injectable()
export class AdsAuthGuard implements CanActivate {
  private readonly secret: string

  constructor(
    config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_SECRET')
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: AdsRequestUser }>()
    const header = request.headers.authorization ?? ''
    const [scheme, token] = header.split(' ')
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException()
    let payload: AccessPayload
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, { secret: this.secret, algorithms: ['HS256'] })
    } catch {
      throw new UnauthorizedException()
    }
    if (payload.typ !== 'access' || !payload.sub) throw new UnauthorizedException()
    request.user = { id: payload.sub }
    return true
  }
}
