import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { WebhookEventType } from '@prisma/client'
import { Transform } from 'class-transformer'
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsUrl,
  MaxLength,
} from 'class-validator'

const EVENT_INPUT_MAP: Record<string, WebhookEventType> = {
  'report.created': WebhookEventType.REPORT_CREATED,
  'report.status_changed': WebhookEventType.REPORT_STATUS_CHANGED,
  'report.pressure_threshold': WebhookEventType.REPORT_PRESSURE_THRESHOLD,
  'outbreak.detected': WebhookEventType.OUTBREAK_DETECTED,
  'sla.at_risk': WebhookEventType.SLA_AT_RISK,
  'sla.breached': WebhookEventType.SLA_BREACHED,
  'report.assigned': WebhookEventType.REPORT_ASSIGNED,
}

function normalizeWebhookEvents(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  return value.map((item) => {
    if (typeof item !== 'string') return item
    const lower = item.trim().toLowerCase()
    return EVENT_INPUT_MAP[lower] ?? item
  })
}

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://gabinete.exemplo.gov.br/hooks/votz' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  url: string

  @ApiProperty({ enum: WebhookEventType, isArray: true })
  @Transform(({ value }) => normalizeWebhookEvents(value))
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(WebhookEventType, { each: true })
  events: WebhookEventType[]
}

export class UpdateWebhookDto {
  @ApiPropertyOptional({ example: 'https://gabinete.exemplo.gov.br/hooks/votz' })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  url?: string

  @ApiPropertyOptional({ enum: WebhookEventType, isArray: true })
  @IsOptional()
  @Transform(({ value }) => normalizeWebhookEvents(value))
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(WebhookEventType, { each: true })
  events?: WebhookEventType[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean
}
