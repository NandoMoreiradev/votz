import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { WebhookEventType } from '@prisma/client'
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsUrl,
  MaxLength,
} from 'class-validator'

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://gabinete.exemplo.gov.br/hooks/votz' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  url: string

  @ApiProperty({ enum: WebhookEventType, isArray: true })
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
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(WebhookEventType, { each: true })
  events?: WebhookEventType[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean
}
