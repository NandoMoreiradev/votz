import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { OrgPermission } from '@prisma/client'
import { Throttle } from '@nestjs/throttler'
import { ActingUser } from '../auth/acting-org'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator'
import { PlanGuard } from '../auth/guards/plan.guard'
import {
  CreateReplyTemplateDto,
  CreateReportNoteDto,
  CreateReportTagDto,
  MandateInboxQueryDto,
  QuickRespondDto,
  UnsubscribeDigestDto,
  UpdateDigestSettingsDto,
  UpdateMandateGoalDto,
  UpdateOnboardingDto,
  UpdateReplyTemplateDto,
} from './dto/mandate.dto'
import { MandateTemplatesService } from './mandate-templates.service'
import { MandateService } from './mandate.service'
import { WeeklyDigestService } from './weekly-digest.service'

@ApiTags('mandate')
@Controller('mandate')
@UseGuards(PlanGuard)
export class MandateController {
  constructor(
    private readonly mandate: MandateService,
    private readonly templates: MandateTemplatesService,
    private readonly digest: WeeklyDigestService,
  ) {}

  // ── Caixa do mandato (T1) ─────────────────────────────────────────────────

  @Get('inbox')
  @ApiBearerAuth()
  @RequiresFeature('respond_reports', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Caixa priorizada do mandato com KPIs e filtros territoriais' })
  getInbox(@CurrentUser() user: ActingUser, @Query() query: MandateInboxQueryDto) {
    return this.mandate.getInbox(user, query)
  }

  @Post('inbox/:reportId/respond')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @RequiresFeature('respond_reports', undefined, OrgPermission.RESPOND_REPORTS)
  @ApiOperation({ summary: 'Ação rápida na caixa: avocar, responder (com modelo opcional) e atualizar status' })
  quickRespond(
    @CurrentUser() user: ActingUser,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: QuickRespondDto,
  ) {
    return this.mandate.quickRespond(user, reportId, dto)
  }

  @Put('goal')
  @ApiBearerAuth()
  @RequiresFeature('analytics_full', undefined, OrgPermission.MANAGE_PROFILE)
  @ApiOperation({ summary: 'Definir meta mensal do mandato' })
  updateGoal(@CurrentUser() user: ActingUser, @Body() dto: UpdateMandateGoalDto) {
    return this.mandate.updateGoal(user, dto)
  }

  // ── Onboarding (T8) ───────────────────────────────────────────────────────

  @Get('onboarding')
  @ApiBearerAuth()
  @RequiresFeature('respond_reports', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Checklist de primeiros passos do mandato' })
  getOnboarding(@CurrentUser() user: ActingUser) {
    return this.mandate.getOnboarding(user)
  }

  @Patch('onboarding')
  @ApiBearerAuth()
  @RequiresFeature('respond_reports', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Atualizar confirmação de território ou dispensar checklist' })
  updateOnboarding(@CurrentUser() user: ActingUser, @Body() dto: UpdateOnboardingDto) {
    return this.mandate.updateOnboarding(user, dto)
  }

  // ── Resumo semanal por e-mail (T2) ────────────────────────────────────────

  @Get('digest/settings')
  @ApiBearerAuth()
  @RequiresFeature('respond_reports', 'POLITICIAN', OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Consultar preferências do resumo semanal por e-mail' })
  getDigestSettings(@CurrentUser() user: ActingUser) {
    return this.digest.getSettings(user)
  }

  @Put('digest/settings')
  @ApiBearerAuth()
  @RequiresFeature('respond_reports', 'POLITICIAN', OrgPermission.MANAGE_PROFILE)
  @ApiOperation({ summary: 'Ativar/desativar e configurar horário do resumo semanal (LGPD opt-in)' })
  updateDigestSettings(
    @CurrentUser() user: ActingUser,
    @Body() dto: UpdateDigestSettingsDto,
  ) {
    return this.digest.updateSettings(user, dto)
  }

  @Public()
  @Get('digest/unsubscribe')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Validar token e exibir status sem alterar preferências (anti-prefetch)' })
  previewUnsubscribeDigest(@Query('token') token: string) {
    return this.digest.previewUnsubscribeByToken(token)
  }

  @Public()
  @Post('digest/unsubscribe')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirmar descadastro idempotente do resumo semanal via botão (POST)' })
  confirmUnsubscribeDigest(@Body() dto: UnsubscribeDigestDto) {
    return this.digest.confirmUnsubscribeByToken(dto.token)
  }

  // ── Modelos de resposta e notas/tags internas (T4) ────────────────────────

  @Get('templates')
  @ApiBearerAuth()
  @RequiresFeature('reply_templates', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Listar modelos de resposta da organização' })
  listTemplates(@CurrentUser() user: ActingUser) {
    return this.templates.listTemplates(user)
  }

  @Post('templates')
  @ApiBearerAuth()
  @RequiresFeature('reply_templates', undefined, OrgPermission.RESPOND_REPORTS)
  @ApiOperation({ summary: 'Criar modelo de resposta com variáveis allowlisted e sanitização' })
  createTemplate(@CurrentUser() user: ActingUser, @Body() dto: CreateReplyTemplateDto) {
    return this.templates.createTemplate(user, dto)
  }

  @Patch('templates/:id')
  @ApiBearerAuth()
  @RequiresFeature('reply_templates', undefined, OrgPermission.RESPOND_REPORTS)
  @ApiOperation({ summary: 'Editar modelo de resposta' })
  updateTemplate(
    @CurrentUser() user: ActingUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReplyTemplateDto,
  ) {
    return this.templates.updateTemplate(user, id, dto)
  }

  @Delete('templates/:id')
  @ApiBearerAuth()
  @RequiresFeature('reply_templates', undefined, OrgPermission.RESPOND_REPORTS)
  @ApiOperation({ summary: 'Excluir modelo de resposta' })
  deleteTemplate(@CurrentUser() user: ActingUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.deleteTemplate(user, id)
  }

  @Get('reports/:reportId/annotations')
  @ApiBearerAuth()
  @RequiresFeature('respond_reports', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Listar tags e notas internas da equipe (nunca visíveis ao cidadão)' })
  listAnnotations(
    @CurrentUser() user: ActingUser,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return this.templates.listReportPrivateAnnotations(user, reportId)
  }

  @Post('reports/:reportId/tags')
  @ApiBearerAuth()
  @RequiresFeature('reply_templates', undefined, OrgPermission.RESPOND_REPORTS)
  @ApiOperation({ summary: 'Adicionar tag interna ao relato (visível apenas para a equipe)' })
  addTag(
    @CurrentUser() user: ActingUser,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: CreateReportTagDto,
  ) {
    return this.templates.addTag(user, reportId, dto)
  }

  @Delete('reports/:reportId/tags/:tagId')
  @ApiBearerAuth()
  @RequiresFeature('reply_templates', undefined, OrgPermission.RESPOND_REPORTS)
  @ApiOperation({ summary: 'Remover tag interna do relato' })
  removeTag(
    @CurrentUser() user: ActingUser,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
  ) {
    return this.templates.removeTag(user, reportId, tagId)
  }

  @Post('reports/:reportId/notes')
  @ApiBearerAuth()
  @RequiresFeature('reply_templates', undefined, OrgPermission.RESPOND_REPORTS)
  @ApiOperation({ summary: 'Adicionar nota interna ao relato (visível apenas para a equipe)' })
  addNote(
    @CurrentUser() user: ActingUser,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: CreateReportNoteDto,
  ) {
    return this.templates.addNote(user, reportId, dto)
  }

  @Delete('reports/:reportId/notes/:noteId')
  @ApiBearerAuth()
  @RequiresFeature('reply_templates', undefined, OrgPermission.RESPOND_REPORTS)
  @ApiOperation({ summary: 'Remover nota interna do relato' })
  deleteNote(
    @CurrentUser() user: ActingUser,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ) {
    return this.templates.deleteNote(user, reportId, noteId)
  }
}
