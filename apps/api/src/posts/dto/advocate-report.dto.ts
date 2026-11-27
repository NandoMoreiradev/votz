import { ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator'
import { ADVOCACY_PROMISE_DAYS, REPORT_LIFECYCLE_LIMITS as L } from '@votz/shared-types'

export class AdvocateReportDto {
  @ApiPropertyOptional({ default: false, description: 'Publicar a avocação como destaque no feed social' })
  @IsOptional()
  @IsBoolean()
  publishToFeed?: boolean

  @ApiPropertyOptional({ maxLength: L.ADVOCACY_MESSAGE_MAX, description: 'Mensagem oficial que acompanhará a avocação (no relato e, se publicada, no feed)' })
  @IsOptional()
  @IsString()
  @MaxLength(L.ADVOCACY_MESSAGE_MAX)
  postContent?: string

  @ApiPropertyOptional({ type: [String], description: 'URLs de mídia (posts/) para anexar à publicação' })
  @IsOptional()
  @IsArray()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  @ArrayMaxSize(L.MEDIA_MAX)
  media?: string[]

  @ApiPropertyOptional({ enum: ADVOCACY_PROMISE_DAYS, description: 'Prazo prometido, em dias a partir de hoje (opcional)' })
  @IsOptional()
  @IsInt()
  @IsIn([...ADVOCACY_PROMISE_DAYS])
  promisedInDays?: number
}
