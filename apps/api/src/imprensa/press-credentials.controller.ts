import {
  Body, Controller, DefaultValuePipe, Get, HttpCode, HttpStatus, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { UserType } from '@votz/shared-types'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { PressCredentialsService } from './press-credentials.service'
import { PressPlanService } from './press-plan.service'
import {
  ConfirmPressEmailDto, CreatePressCredentialDto, ReviewPressCredentialDto, SetPressPlanDto,
} from './dto/press-credential.dto'

@ApiTags('imprensa')
@Controller('imprensa')
export class PressCredentialsController {
  constructor(
    private readonly service: PressCredentialsService,
    private readonly plan: PressPlanService,
  ) {}

  // ── Jornalista ──────────────────────────────────────────────────────────────

  @Post('credenciamento')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  // Erro de digitação no formulário também conta; por isso a folga de 10 por hora (a redação inteira pode estar no mesmo IP).
  @Throttle({ short: { limit: 2, ttl: 10_000 }, medium: { limit: 10, ttl: 3_600_000 }, long: { limit: 20, ttl: 86_400_000 } })
  @ApiOperation({ summary: 'Pedir credencial de imprensa (jornalista, veículo ou freelancer)' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreatePressCredentialDto) {
    return this.service.create(user.id, dto)
  }

  @Get('credenciamento/minha')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Meu pedido de credencial mais recente (ou null)' })
  mine(@CurrentUser() user: { id: string }) {
    return this.service.findMine(user.id)
  }

  @Post('credenciamento/confirmar-email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 3, ttl: 10_000 }, medium: { limit: 20, ttl: 3_600_000 }, long: { limit: 50, ttl: 86_400_000 } })
  @ApiOperation({ summary: 'Confirmar o e-mail da redação com o código recebido' })
  confirmEmail(@CurrentUser() user: { id: string }, @Body() dto: ConfirmPressEmailDto) {
    return this.service.confirmEmail(user.id, dto.token)
  }

  @Post('credenciamento/reenviar-email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 1, ttl: 10_000 }, medium: { limit: 5, ttl: 3_600_000 }, long: { limit: 10, ttl: 86_400_000 } })
  @ApiOperation({ summary: 'Reenviar o e-mail de confirmação da redação' })
  resend(@CurrentUser() user: { id: string }) {
    return this.service.resendEmail(user.id)
  }

  // ── Moderação ───────────────────────────────────────────────────────────────

  @Get('credenciamentos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserType.MODERATOR, UserType.ADMIN)
  @ApiBearerAuth()
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'APPROVED', 'REJECTED', 'REVOKED'] })
  @ApiOperation({ summary: '[Moderação] Listar pedidos de credencial de imprensa, com sinais de verificação' })
  list(
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.service.list(status, page, limit)
  }

  @Post('credenciamentos/:id/aprovar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserType.MODERATOR, UserType.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Moderação] Aprovar: a conta vira imprensa verificada' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPressCredentialDto,
    @CurrentUser() reviewer: { id: string },
  ) {
    return this.service.approve(id, reviewer.id, dto.reviewNote)
  }

  @Post('credenciamentos/:id/recusar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserType.MODERATOR, UserType.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Moderação] Recusar um pedido em análise (motivo obrigatório)' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPressCredentialDto,
    @CurrentUser() reviewer: { id: string },
  ) {
    return this.service.reject(id, reviewer.id, dto.reviewNote)
  }

  @Post('credenciamentos/:id/plano')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserType.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Trocar o plano (Gratuita ou Pro) de uma credencial aprovada, com motivo' })
  setPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPressPlanDto,
    @CurrentUser() actor: { id: string },
  ) {
    return this.plan.setPlanByStaff(id, dto.plan, actor.id, dto.reason)
  }

  @Post('credenciamentos/:id/cancelar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserType.MODERATOR, UserType.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Moderação] Cancelar uma credencial aprovada (motivo obrigatório)' })
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPressCredentialDto,
    @CurrentUser() reviewer: { id: string },
  ) {
    return this.service.revoke(id, reviewer.id, dto.reviewNote)
  }
}
