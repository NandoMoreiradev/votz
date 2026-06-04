import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ReportsService } from './reports.service'
import { CreateReportDto } from './dto/create-report.dto'
import { UpdateStatusDto } from './dto/update-status.dto'
import { UpdateRecipientDto } from './dto/update-recipient.dto'
import { DisputeDto } from './dto/dispute.dto'
import { ResolveDisputeDto } from './dto/resolve-dispute.dto'
import { ListReportsQueryDto } from './dto/list-reports-query.dto'
import { SimilarReportsQueryDto } from './dto/similar-reports-query.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'

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

  @Get('similar')
  @ApiOperation({ summary: 'Buscar relatos similares por trigram, full-text e embedding semântico' })
  findSimilar(@Query() query: SimilarReportsQueryDto) {
    return this.reportsService.findSimilar(query.title, query.description, query.limit ?? 5)
  }

  @Get()
  @ApiOperation({ summary: 'List reports with filters and pagination' })
  findAll(@Query() query: ListReportsQueryDto) {
    return this.reportsService.findAll({
      category: query.category,
      status: query.status,
      city: query.city,
      state: query.state,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    })
  }

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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update report status (entity/moderator/admin only)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: { id: string; type: string },
  ) {
    return this.reportsService.updateStatus(id, dto, user)
  }

  @Post(':id/dispute')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dispute a resolved report — only the original author can dispute' })
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
  @ApiOperation({ summary: 'Resolve a disputed report (moderator/admin only)' })
  resolveDispute(
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
    @CurrentUser() user: { id: string; type: string },
  ) {
    return this.reportsService.resolveDispute(id, dto, user)
  }

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
    @CurrentUser() user: { id: string; type: string },
  ) {
    return this.reportsService.getFollowStatus(id, user.id, user.type)
  }

  @Post(':id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Acompanhar relato (apenas político ou entidade)' })
  follow(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; type: string },
  ) {
    return this.reportsService.follow(id, user.id, user.type)
  }

  @Delete(':id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deixar de acompanhar relato' })
  unfollow(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; type: string },
  ) {
    return this.reportsService.unfollow(id, user.id, user.type)
  }
}
