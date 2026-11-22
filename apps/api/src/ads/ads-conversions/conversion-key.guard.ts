import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common'
import type { Request } from 'express'
import { AdsConversionsService, type ConversionKeyIdentity } from './ads-conversions.service'

type RequestWithKey = Request & { conversionKey?: ConversionKeyIdentity }

/**
 * Autentica o anunciante pela chave de conversões (`x-api-key: vzc_...`). Sem login de pessoa: a rota é pública para
 * o JWT e esta chave a protege. A mensagem de erro é a mesma para chave ausente, errada ou revogada.
 */
@Injectable()
export class ConversionKeyGuard implements CanActivate {
  constructor(private readonly service: AdsConversionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithKey>()
    const raw = req.headers['x-api-key']
    const key = typeof raw === 'string' ? await this.service.authenticate(raw.trim()) : null
    if (!key) throw new UnauthorizedException('Chave de conversões ausente, inválida ou revogada.')
    req.conversionKey = key
    return true
  }
}

export const CurrentConversionKey = createParamDecorator((_data: unknown, context: ExecutionContext): ConversionKeyIdentity => {
  return context.switchToHttp().getRequest<RequestWithKey>().conversionKey as ConversionKeyIdentity
})
