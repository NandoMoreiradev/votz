import { Body, Controller, Headers, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { IsEnum, IsString } from 'class-validator'
import { OrgType } from '@prisma/client'
import { Request } from 'express'
import { SubscricoesService } from './subscricoes.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'

class CheckoutDto {
  @IsString() orgId: string
  @IsEnum(OrgType) orgType: OrgType
  @IsString() plan: string
}

class PortalDto {
  @IsString() orgId: string
  @IsEnum(OrgType) orgType: OrgType
}

@ApiTags('subscricoes')
@Controller('subscricoes')
export class SubscricoesController {
  constructor(private readonly service: SubscricoesService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar sessão de checkout Stripe para upgrade de plano' })
  checkout(
    @Body() dto: CheckoutDto,
    @CurrentUser() user: { id: string; email: string },
  ) {
    return this.service.criarCheckout(dto.orgId, dto.orgType, dto.plan, user.email)
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar sessão do portal de cobrança Stripe (gerenciar/cancelar)' })
  portal(@Body() dto: PortalDto) {
    return this.service.criarPortal(dto.orgId, dto.orgType)
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Receber eventos do Stripe (uso interno — verificado por assinatura)' })
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.service.handleWebhook(req.rawBody!, signature)
  }
}
