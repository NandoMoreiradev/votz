import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { ReportsService } from './reports.service'
import { CreateReportDto } from './dto/create-report.dto'
import { UpdateStatusDto } from './dto/update-status.dto'
import { UpdateRecipientDto } from './dto/update-recipient.dto'
import { DisputeDto } from './dto/dispute.dto'
import { ResolveDisputeDto } from './dto/resolve-dispute.dto'
import { ListReportsQueryDto } from './dto/list-reports-query.dto'
import { SimilarReportsQueryDto } from './dto/similar-reports-query.dto'
import { WithdrawAdvocacyDto } from '../report-lifecycle/dto/withdraw-advocacy.dto'
import { DisputeQueueQueryDto } from '../report-lifecycle/dto/dispute-queue-query.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { ActingUser } from '../auth/acting-org'

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new report' })
  create(
    @Body() dto: CreateReportDto,
    @CurrentUser() user: { id: string; type: string; emailVerified: boolean },
  ) {
    return this.reportsService.create(dto, user)
  }

  @Public()
  @Get('similar')
  @ApiOperation({ summary: 'Buscar relatos similares por trigram, full-text e embedding semântico' })
  findSimilar(@Query() query: SimilarReportsQueryDto) {
    return this.reportsService.findSimilar(query.title, query.description, query.limit ?? 5, {
      category: query.category,
      state: query.state,
      city: query.city,
    })
  }

  @Get('moderation/disputes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fila de contestações para a moderação (mais antigas primeiro)' })
  disputeQueue(@Query() query: DisputeQueueQueryDto, @CurrentUser() user: { id: string; type: string }) {
    return this.reportsService.disputeQueue(user, query.page ?? 1, query.limit ?? 20)
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List reports with filters and pagination' })
  findAll(@Query() query: ListReportsQueryDto) {
    return this.reportsService.findAll({
      category: query.category,
      status: query.status,
      city: query.city,
      state: query.state,
      search: query.search,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    })
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get report by ID with timeline' })
  findById(@Param('id') id: string) {
    return this.reportsService.findById(id)
  }

  @Patch(':id/recipient')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reatribuir destinatário do relato — apenas o autor pode chamar' })
  updateRecipient(
    @Param('id') id: string,
    @Body() dto: UpdateRecipientDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.reportsService.updateRecipient(id, dto, user.id)
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mudar status (só o destinatário, seguindo as transições permitidas) ou, sem status, publicar atualização (destinatário ou quem avocou)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: ActingUser,
  ) {
    return this.reportsService.updateStatus(id, dto, user)
  }

  @Post(':id/dispute')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Contestar resolução ou arquivamento (autor ou quem marcou "Eu também", até 30 dias, uma vez por resolução)' })
  dispute(
    @Param('id') id: string,
    @Body() dto: DisputeDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.reportsService.dispute(id, dto, user.id)
  }

  @Post(':id/dispute/resolve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Decidir contestação (só moderação): UPHOLD mantém a resolução, REOPEN reabre' })
  resolveDispute(
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
    @CurrentUser() user: { id: string; type: string },
  ) {
    return this.reportsService.resolveDispute(id, dto, user)
  }

  @Post(':id/confirm-resolution')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Autor confirma que o problema foi resolvido' })
  confirmResolution(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.reportsService.confirmResolution(id, user.id)
  }

  @Post(':id/advocacy/withdraw')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Desistir da avocação (público, com motivo; conta no Mandatômetro)' })
  withdrawAdvocacy(
    @Param('id') id: string,
    @Body() dto: WithdrawAdvocacyDto,
    @CurrentUser() user: ActingUser,
  ) {
    return this.reportsService.withdrawAdvocacy(id, user, dto.reason)
  }

  @Public()
  @Get(':id/followers')
  @ApiOperation({ summary: 'Listar políticos e entidades que acompanham o relato' })
  getFollowers(@Param('id') id: string) {
    return this.reportsService.getFollowers(id)
  }

  @Get(':id/follow/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verificar se o usuário atual está acompanhando o relato' })
  getFollowStatus(
    @Param('id') id: string,
    @CurrentUser() user: ActingUser,
  ) {
    return this.reportsService.getFollowStatus(id, user)
  }

  @Post(':id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Acompanhar relato (apenas político ou entidade)' })
  follow(
    @Param('id') id: string,
    @CurrentUser() user: ActingUser,
  ) {
    return this.reportsService.follow(id, user)
  }

  @Delete(':id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deixar de acompanhar relato' })
  unfollow(
    @Param('id') id: string,
    @CurrentUser() user: ActingUser,
  ) {
    return this.reportsService.unfollow(id, user)
  }
}
