import { ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator'

export class AdvocateReportDto {
  @ApiPropertyOptional({ default: false, description: 'Publicar a avocação como destaque no feed social' })
  @IsOptional()
  @IsBoolean()
  publishToFeed?: boolean

  @ApiPropertyOptional({ maxLength: 1000, description: 'Mensagem oficial que acompanhará a avocação no feed' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  postContent?: string

  @ApiPropertyOptional({ type: [String], description: 'URLs de mídia no R2 (posts/) para anexar à publicação' })
  @IsOptional()
  @IsArray()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  @ArrayMaxSize(4)
  media?: string[]
}
