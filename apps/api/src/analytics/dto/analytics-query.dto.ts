import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator'
import { Category, normalizeLocationKey } from '@votz/shared-types'

export enum PeriodPreset {
  D7 = '7d',
  D30 = '30d',
  D90 = '90d',
  D365 = '365d',
}

export enum AnalyticsScopeMode {
  AREA = 'area',
  DIRECTED = 'directed',
}

export enum TimeseriesMetric {
  VOLUME = 'volume',
  RESOLVED = 'resolved',
  RESPONSE_RATE = 'response_rate',
  RESOLUTION_RATE = 'resolution_rate',
  SUPPORT = 'support',
  COMMENTS = 'comments',
}

export enum TimeseriesGranularity {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export enum ExportFormat {
  JSON = 'json',
  CSV = 'csv',
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const GEOHASH7_PATTERN = /^[0-9b-hjkmnp-z]{7}$/i

export class BaseAnalyticsFilterDto {
  @ApiPropertyOptional({ enum: AnalyticsScopeMode, default: AnalyticsScopeMode.AREA })
  @IsOptional()
  @IsEnum(AnalyticsScopeMode)
  scope?: AnalyticsScopeMode = AnalyticsScopeMode.AREA

  @ApiPropertyOptional({ enum: PeriodPreset })
  @IsOptional()
  @IsEnum(PeriodPreset)
  period?: PeriodPreset

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Data inicial (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN, { message: 'from deve estar no formato YYYY-MM-DD' })
  from?: string

  @ApiPropertyOptional({ example: '2026-11-15', description: 'Data final (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN, { message: 'to deve estar no formato YYYY-MM-DD' })
  to?: string

  @ApiPropertyOptional({ enum: Category })
  @IsOptional()
  @IsEnum(Category)
  category?: Category

  @ApiPropertyOptional({ description: 'UF (validado contra área da organização ativa)' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/, { message: 'state deve ter 2 letras maiúsculas' })
  state?: string

  @ApiPropertyOptional({ description: 'Chave normalizada de município (validada contra área)' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeLocationKey(value) : value))
  cityKey?: string

  @ApiPropertyOptional({ description: 'Célula geohash precisão 7' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(GEOHASH7_PATTERN, { message: 'cell deve ser um geohash de 7 caracteres' })
  cell?: string
}

export class TimeseriesQueryDto extends BaseAnalyticsFilterDto {
  @ApiPropertyOptional({ enum: TimeseriesMetric, default: TimeseriesMetric.VOLUME })
  @IsOptional()
  @IsEnum(TimeseriesMetric)
  metric?: TimeseriesMetric = TimeseriesMetric.VOLUME

  @ApiPropertyOptional({ enum: TimeseriesGranularity, default: TimeseriesGranularity.DAY })
  @IsOptional()
  @IsEnum(TimeseriesGranularity)
  granularity?: TimeseriesGranularity = TimeseriesGranularity.DAY
}

export class PaginatedAnalyticsQueryDto extends BaseAnalyticsFilterDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25
}

export class ExportAnalyticsQueryDto extends BaseAnalyticsFilterDto {
  @ApiPropertyOptional({ enum: ExportFormat, default: ExportFormat.JSON })
  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat = ExportFormat.JSON
}

export class PublicMunicipalityAnalyticsDto {
  @ApiPropertyOptional({ example: 'SP' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/, { message: 'state deve ter 2 letras maiúsculas' })
  state: string

  @ApiPropertyOptional({ example: 'São Paulo' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  city: string

  @ApiPropertyOptional({ enum: PeriodPreset, default: PeriodPreset.D30 })
  @IsOptional()
  @IsEnum(PeriodPreset)
  period?: PeriodPreset = PeriodPreset.D30
}

export class PublicOrgAnalyticsDto {
  @ApiPropertyOptional({ enum: PeriodPreset, default: PeriodPreset.D30 })
  @IsOptional()
  @IsEnum(PeriodPreset)
  period?: PeriodPreset = PeriodPreset.D30
}
