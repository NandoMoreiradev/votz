import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { UserType } from '@votz/shared-types'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { OptionalAuth, Public } from '../auth/decorators/public.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import {
  CancelSurveyDto,
  CreateInstituteDto,
  CreateSurveyDto,
  DrawSampleDto,
  ListSurveysQueryDto,
  ReviewSurveyDto,
  SubmitEntitySurveyDto,
  SubmitSurveyVoteDto,
  UpdateSurveyDto,
} from './dto/surveys.dto'
import { SurveysService } from './surveys.service'

@ApiTags('surveys')
@Controller('surveys')
export class SurveysController {
  constructor(private readonly service: SurveysService) {}

  @Public()
  @Get('config')
  @ApiOperation({ summary: 'Configuração pública da Pesquisa Votz (feature flag e trava TSE)' })
  getConfig() {
    return this.service.getConfig()
  }

  @Public()
  @OptionalAuth()
  @Get()
  @ApiOperation({ summary: 'Listar Pesquisas Votz públicas (abertas e encerradas)' })
  listPublic(
    @Query() query: ListSurveysQueryDto,
    @CurrentUser() user?: { id: string },
  ) {
    return this.service.listPublic(query, user?.id)
  }

  @Public()
  @OptionalAuth()
  @Get('featured')
  @ApiOperation({ summary: 'Pesquisas em destaque elegíveis para o card do feed' })
  listFeatured(@CurrentUser() user?: { id: string }) {
    return this.service.listFeatured(user?.id)
  }

  @Get('my-invitations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Convites exclusivos de amostra sorteada para o cidadão autenticado' })
  listMyInvitations(@CurrentUser() user: { id: string }) {
    return this.service.listMyInvitations(user.id)
  }

  @Post('invitations/:id/decline')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recusar convite de amostra sorteada' })
  declineInvitation(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.service.declineInvitation(id, user.id)
  }

  @Public()
  @Get('institutes')
  @ApiOperation({ summary: 'Listar institutos de pesquisa credenciados' })
  listInstitutes() {
    return this.service.listInstitutes(true)
  }

  @Public()
  @OptionalAuth()
  @Get('institutes/:slug')
  @ApiOperation({ summary: 'Perfil público e histórico de pesquisas de um instituto credenciado' })
  getInstitute(@Param('slug') slug: string, @CurrentUser() user?: { id: string }) {
    return this.service.getInstituteBySlug(slug, user?.id)
  }

  @Public()
  @Get('compare')
  @ApiOperation({ summary: 'Comparador histórico de pesquisas encerradas pelo mesmo topicKey' })
  @ApiQuery({ name: 'topicKey', required: true })
  compare(@Query('topicKey') topicKey = '') {
    return this.service.compareByTopicKey(topicKey)
  }

  @Get('entity/:entityId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar consultas públicas propostas pela entidade (membros ativos)' })
  listEntitySurveys(@Param('entityId') entityId: string, @CurrentUser() user: { id: string }) {
    return this.service.listEntitySurveys(entityId, user.id)
  }

  @Post('entity/:entityId/submit')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Entidade pública submete consulta pública para revisão editorial do Admin' })
  submitEntitySurvey(
    @Param('entityId') entityId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SubmitEntitySurveyDto,
  ) {
    return this.service.submitEntitySurvey(entityId, user.id, dto)
  }

  @Public()
  @OptionalAuth()
  @Get(':slugOrId')
  @ApiOperation({ summary: 'Detalhes da pesquisa, perguntas embaralhadas e elegibilidade do cidadão' })
  getDetail(
    @Param('slugOrId') slugOrId: string,
    @CurrentUser() user?: { id: string },
  ) {
    return this.service.getDetail(slugOrId, user?.id)
  }

  @Post(':id/vote')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 2, ttl: 10_000 }, medium: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Registrar participação anônima e definitiva na Pesquisa Votz' })
  submitVote(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SubmitSurveyVoteDto,
  ) {
    return this.service.submitVote(id, user.id, dto)
  }

  @Public()
  @OptionalAuth()
  @Get(':slugOrId/results')
  @ApiOperation({ summary: 'Resultados agregados da pesquisa (protegidos por quórum e k-anonimato)' })
  @ApiQuery({ name: 'segment', required: false, example: 'ALL' })
  getResults(
    @Param('slugOrId') slugOrId: string,
    @Query('segment') segment = 'ALL',
    @CurrentUser() user?: { id: string },
  ) {
    return this.service.getResults(slugOrId, segment, user?.id)
  }

  @Public()
  @Get(':slugOrId/export')
  @ApiOperation({ summary: 'Exportação CSV ou JSON exclusivamente de agregados k-anônimos' })
  @ApiQuery({ name: 'format', required: false, enum: ['csv', 'json'] })
  @ApiQuery({ name: 'segment', required: false, example: 'ALL' })
  async exportResults(
    @Param('slugOrId') slugOrId: string,
    @Query('format') format: 'csv' | 'json' = 'csv',
    @Query('segment') segment = 'ALL',
    @Res() res: Response,
  ) {
    const file = await this.service.exportAggregatedResults(slugOrId, format === 'json' ? 'json' : 'csv', segment)
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    res.send(file.body)
  }
}

@ApiTags('admin-surveys')
@Controller('admin/surveys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.ADMIN)
@ApiBearerAuth()
export class AdminSurveysController {
  constructor(private readonly service: SurveysService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas as Pesquisas Votz (Admin)' })
  listAll() {
    return this.service.listAdmin()
  }

  @Get('institutes')
  @ApiOperation({ summary: 'Listar todos os institutos de pesquisa (Admin)' })
  listInstitutes() {
    return this.service.listInstitutes(false)
  }

  @Post('institutes')
  @ApiOperation({ summary: 'Cadastrar novo instituto de pesquisa credenciado (Admin)' })
  createInstitute(@Body() dto: CreateInstituteDto) {
    return this.service.createInstitute(dto)
  }

  @Post()
  @ApiOperation({ summary: 'Criar nova Pesquisa Votz em rascunho (Admin)' })
  create(@Body() dto: CreateSurveyDto, @CurrentUser() actor: { id: string }) {
    return this.service.createSurvey(dto, actor.id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar metadados de uma Pesquisa Votz (Admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateSurveyDto) {
    return this.service.updateSurvey(id, dto)
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revisar consulta pública submetida por Entidade/Parceiro (aprovar/ajustes/rejeitar)' })
  review(@Param('id') id: string, @Body() dto: ReviewSurveyDto) {
    return this.service.reviewSurvey(id, dto)
  }

  @Post(':id/draw-sample')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sortear amostra independente para pesquisa INVITED_SAMPLE respeitando quarentena' })
  drawSample(@Param('id') id: string, @Body() dto: DrawSampleDto) {
    return this.service.drawSample(id, dto)
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publicar Pesquisa Votz (valida trava TSE se eleitoral)' })
  publish(@Param('id') id: string, @CurrentUser() actor: { id: string }) {
    return this.service.publishSurvey(id, actor.id)
  }

  @Post(':id/drain')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Forçar drenagem embaralhada do Mix Pool agora (Admin)' })
  drain(@Param('id') id: string) {
    return this.service.drainMixPool(id, { force: true })
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Encerrar Pesquisa Votz, drenar Mix Pool e executar crypto-shredding do salt' })
  close(@Param('id') id: string) {
    return this.service.closeSurvey(id)
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar Pesquisa Votz com motivo registrado' })
  cancel(@Param('id') id: string, @Body() dto: CancelSurveyDto) {
    return this.service.cancelSurvey(id, dto)
  }
}
