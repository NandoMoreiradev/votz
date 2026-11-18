import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import type { Response } from 'express'

@Injectable()
export class ConversationsPrivacyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const response = context.switchToHttp().getResponse<Response>()
    response.setHeader('Cache-Control', 'private, no-store')
    response.vary('Authorization')
    return next.handle()
  }
}
