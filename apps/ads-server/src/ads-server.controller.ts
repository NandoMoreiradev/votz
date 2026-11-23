import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { AdsDeliveryService } from '../../api/src/ads/ads-delivery/ads-delivery.service'
import { AdEventsBatchDto, NextAdQueryDto } from '../../api/src/ads/ads-delivery/dto/ads-delivery.dto'
import { AdsAuthGuard, type AdsRequestUser } from './ads-auth.guard'
import { CurrentAdsUser } from './current-ads-user.decorator'

/**
 * As duas rotas que o site e o celular chamam o tempo todo (mesmos caminhos e mesmas respostas da API: `/api/v1/ads/next`
 * e `/api/v1/ads/events`), com a mesma lógica de entrega. O proxy da frente manda só estas duas para cá.
 */
@Controller('ads')
@UseGuards(AdsAuthGuard)
export class AdsServerController {
  constructor(private readonly delivery: AdsDeliveryService) {}

  @Get('next')
  async next(@CurrentAdsUser() user: AdsRequestUser, @Query() query: NextAdQueryDto) {
    // Em desenvolvimento a resposta sem anúncio explica o motivo (`debugReason`). Em produção o campo nunca existe.
    const { ad, reason } = await this.delivery.nextWithReason(user.id, query)
    return reason ? { ad, debugReason: reason } : { ad }
  }

  @Post('events')
  @HttpCode(200)
  events(@CurrentAdsUser() user: AdsRequestUser, @Body() dto: AdEventsBatchDto) {
    return this.delivery.ingest(user.id, dto)
  }
}

/** Para o balanceador saber se está de pé. Sem login e fora do limite de pedidos. */
@Controller('ads-server')
export class AdsServerHealthController {
  @Get('health')
  @SkipThrottle()
  health() {
    return { status: 'ok', service: 'ads-server' }
  }
}
