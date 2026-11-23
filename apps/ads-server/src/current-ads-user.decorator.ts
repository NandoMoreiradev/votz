import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { AdsRequestUser } from './ads-auth.guard'

/** A pessoa que fez o pedido (colocada pela `AdsAuthGuard`). */
export const CurrentAdsUser = createParamDecorator((_data: unknown, context: ExecutionContext): AdsRequestUser => {
  return context.switchToHttp().getRequest<{ user: AdsRequestUser }>().user
})
