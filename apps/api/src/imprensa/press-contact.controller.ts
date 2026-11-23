import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { CreatePressContactDto, RespondPressContactDto, SetPressContactOptInDto } from './dto/press-contact.dto'
import { PressContactService } from './press-contact.service'

/** Pedido de contato da imprensa ao cidadão (camada de consentimento; não abre conversa nem revela contato). */
@ApiTags('imprensa')
@ApiBearerAuth()
@Controller('imprensa/contatos')
export class PressContactController {
  constructor(private readonly service: PressContactService) {}

  // ── Jornalista Pro ──────────────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard)
  // Sem teto de negócio por dia (decisão do dono); isto é só proteção contra robô, bem acima do uso de uma redação.
  @Throttle({ short: { limit: 3, ttl: 10_000 }, medium: { limit: 120, ttl: 3_600_000 }, long: { limit: 600, ttl: 86_400_000 } })
  @ApiOperation({ summary: '[PRESS Pro] Pedir contato ao autor de um relato que aceitou falar com a imprensa' })
  request(@CurrentUser() user: { id: string }, @Body() dto: CreatePressContactDto) {
    return this.service.request(user.id, dto)
  }

  @Get('enviados')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '[PRESS] Meus pedidos de contato' })
  sent(@CurrentUser() user: { id: string }) {
    return this.service.listSent(user.id)
  }

  @Post(':id/cancelar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '[PRESS] Cancelar um pedido que ainda aguarda resposta' })
  cancel(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancel(user.id, id)
  }

  // ── Cidadão ─────────────────────────────────────────────────────────────────

  @Get('recebidos')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Pedidos de contato da imprensa que recebi' })
  received(@CurrentUser() user: { id: string }) {
    return this.service.listReceived(user.id)
  }

  @Post(':id/responder')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { limit: 5, ttl: 10_000 }, medium: { limit: 60, ttl: 3_600_000 }, long: { limit: 200, ttl: 86_400_000 } })
  @ApiOperation({ summary: 'Aceitar ou recusar (e bloquear ou denunciar) um pedido de contato' })
  respond(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondPressContactDto,
  ) {
    return this.service.respond(user.id, id, dto)
  }

  // ── Relato ──────────────────────────────────────────────────────────────────

  @Get('relatos/:reportId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Estado do "aceito falar com a imprensa" de um relato, do ponto de vista de quem olha' })
  reportStatus(@CurrentUser() user: { id: string }, @Param('reportId', ParseUUIDPipe) reportId: string) {
    return this.service.reportStatus(user.id, reportId)
  }

  @Patch('relatos/:reportId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'O autor liga ou desliga o "aceito falar com a imprensa" de um relato público' })
  setOptIn(
    @CurrentUser() user: { id: string },
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: SetPressContactOptInDto,
  ) {
    return this.service.setOptIn(user.id, reportId, dto.pressContactOk)
  }
}
