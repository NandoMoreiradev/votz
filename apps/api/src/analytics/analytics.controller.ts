import { createHash } from 'crypto'
import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { OrgPermission } from '@prisma/client'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { ActingUser } from '../auth/acting-org'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator'
import { PlanGuard } from '../auth/guards/plan.guard'
import { AnalyticsService } from './analytics.service'
import {
  BaseAnalyticsFilterDto,
  ExportAnalyticsQueryDto,
  ExportFormat,
  PaginatedAnalyticsQueryDto,
  PublicMunicipalityAnalyticsDto,
  PublicOrgAnalyticsDto,
  TimeseriesQueryDto,
} from './dto/analytics-query.dto'

@ApiTags('analytics')
@Controller('analytics')
@UseGuards(PlanGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @RequiresFeature('analytics_basic', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Visão geral de métricas pré-agregadas do painel' })
  getOverview(@CurrentUser() user: ActingUser, @Query() query: BaseAnalyticsFilterDto) {
    return this.analyticsService.getOverview(user, query)
  }

  @Get('categories')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @RequiresFeature('analytics_basic', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Mix e métricas agregadas por categoria' })
  getCategories(@CurrentUser() user: ActingUser, @Query() query: BaseAnalyticsFilterDto) {
    return this.analyticsService.getCategories(user, query)
  }

  @Get('timeseries')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @RequiresFeature('analytics_full', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Série temporal diária/semanal/mensal com comparação de período anterior' })
  getTimeseries(@CurrentUser() user: ActingUser, @Query() query: TimeseriesQueryDto) {
    return this.analyticsService.getTimeseries(user, query)
  }

  @Get('heatmap')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @RequiresFeature('heatmap', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Células geohash-7 de calor com supressão abaixo de MIN_CELL_SIZE' })
  getHeatmap(@CurrentUser() user: ActingUser, @Query() query: BaseAnalyticsFilterDto) {
    return this.analyticsService.getHeatmap(user, query)
  }

  @Get('recurrence')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @RequiresFeature('analytics_full', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Células reincidentes (geohash-7 + categoria nos últimos 90 dias)' })
  getRecurrence(@CurrentUser() user: ActingUser, @Query() query: PaginatedAnalyticsQueryDto) {
    return this.analyticsService.getRecurrence(user, query)
  }

  @Get('response-times')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @RequiresFeature('analytics_full', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Distribuição e percentis (p50/p90) de tempos de resposta e resolução' })
  getResponseTimes(@CurrentUser() user: ActingUser, @Query() query: BaseAnalyticsFilterDto) {
    return this.analyticsService.getResponseTimes(user, query)
  }

  @Get('outbreaks')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @RequiresFeature('analytics_full', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Histórico de surtos na área territorial da organização' })
  getOutbreaks(@CurrentUser() user: ActingUser, @Query() query: PaginatedAnalyticsQueryDto) {
    return this.analyticsService.getOutbreaks(user, query)
  }

  @Get('export')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequiresFeature('export_data', undefined, OrgPermission.EXPORT_DATA)
  @ApiOperation({ summary: 'Exportação agregada em CSV ou JSON (sem PII)' })
  async exportData(
    @CurrentUser() user: ActingUser,
    @Query() query: ExportAnalyticsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const exported = await this.analyticsService.exportData(user, query)
    res.setHeader('Content-Type', exported.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`)
    if (exported.format === ExportFormat.CSV && 'body' in exported) {
      return exported.body
    }
    return 'data' in exported ? exported.data : exported
  }

  @Get('peer-comparison')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @RequiresFeature('peer_comparison', undefined, OrgPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Comparativo por porte populacional (interface em breve)' })
  getPeerComparison(@CurrentUser() user: ActingUser, @Query() query: BaseAnalyticsFilterDto) {
    return this.analyticsService.getPeerComparison(user, query)
  }

  @Get('public/municipality')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Resumo público de transparência por município' })
  async getPublicMunicipality(
    @Query() query: PublicMunicipalityAnalyticsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = await this.analyticsService.getPublicMunicipality(query)
    return this.applyPublicCacheHeaders(req, res, payload)
  }

  @Get('public/entities/:id')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Resumo público de transparência de uma entidade' })
  async getPublicEntity(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PublicOrgAnalyticsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = await this.analyticsService.getPublicEntity(id, query)
    return this.applyPublicCacheHeaders(req, res, payload)
  }

  @Get('public/politicians/:id')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Resumo público de transparência de um político' })
  async getPublicPolitician(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PublicOrgAnalyticsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = await this.analyticsService.getPublicPolitician(id, query)
    return this.applyPublicCacheHeaders(req, res, payload)
  }

  private applyPublicCacheHeaders<
    T extends {
      subject: unknown
      period: unknown
      sampleSize: unknown
      suppressed: unknown
      definitionVersion: unknown
      kpis: unknown
    },
  >(req: Request, res: Response, payload: T) {
    const etagDigest = createHash('sha256')
      .update(
        JSON.stringify({
          subject: payload.subject,
          period: payload.period,
          sampleSize: payload.sampleSize,
          suppressed: payload.suppressed,
          definitionVersion: payload.definitionVersion,
          kpis: payload.kpis,
        }),
      )
      .digest('hex')
      .slice(0, 24)
    const etag = `"${etagDigest}"`
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=900, stale-while-revalidate=60')
    res.setHeader('ETag', etag)
    res.setHeader('Vary', 'Accept-Encoding')

    const ifNoneMatch = req.headers['if-none-match']
    if (ifNoneMatch && ifNoneMatch.split(',').map((s) => s.trim()).includes(etag)) {
      res.status(HttpStatus.NOT_MODIFIED)
      return undefined
    }
    return payload
  }
}
