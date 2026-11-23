import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { PressPlanService } from './press-plan.service'

@ApiTags('imprensa')
@ApiBearerAuth()
@Controller('imprensa/plano')
export class PressPlanController {
  constructor(private readonly service: PressPlanService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '[PRESS] Meu plano e o que ele libera' })
  info(@CurrentUser() user: { id: string }) {
    return this.service.getInfo(user.id)
  }

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { limit: 2, ttl: 10_000 }, medium: { limit: 10, ttl: 3_600_000 }, long: { limit: 20, ttl: 86_400_000 } })
  @ApiOperation({ summary: '[PRESS] Abrir o pagamento do plano Imprensa Pro (Stripe)' })
  checkout(@CurrentUser() user: { id: string; email: string }) {
    return this.service.checkout(user.id, user.email)
  }

  @Post('portal')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { limit: 2, ttl: 10_000 }, medium: { limit: 10, ttl: 3_600_000 }, long: { limit: 20, ttl: 86_400_000 } })
  @ApiOperation({ summary: '[PRESS] Gerenciar ou cancelar a assinatura (portal Stripe)' })
  portal(@CurrentUser() user: { id: string }) {
    return this.service.portal(user.id)
  }
}
