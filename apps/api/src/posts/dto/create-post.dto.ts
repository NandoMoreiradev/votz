import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { POST_MEDIA_MAX_ITEMS } from '@votz/shared-types'
import { PostMediaInputDto } from '../../media/dto/media.dto'

export class CreatePostPollDto {
  @ApiPropertyOptional({ maxLength: 280 })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  question?: string

  @ApiPropertyOptional({ type: [String], minItems: 2, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  options: string[]

  @ApiPropertyOptional({ default: 24, minimum: 1, maximum: 168 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  durationHours?: number
}

export class CreatePostDto {
  @ApiPropertyOptional({ maxLength: 2000, example: 'Avenida Paulista precisa de faixa exclusiva! #MobilidadeSP' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string

  @ApiPropertyOptional({
    type: [String],
    deprecated: true,
    description: 'Apps antigos: URLs enviadas via /storage/upload/post-media (máx. 4), sem formato. Use `mediaAssets`.',
  })
  @IsOptional()
  @IsArray()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }, { each: true })
  @ArrayMaxSize(4)
  media?: string[]

  @ApiPropertyOptional({
    type: [PostMediaInputDto],
    description: 'Fotos e vídeos enviados em /media/uploads, com formato e enquadramento (máx. 4, todos no mesmo formato)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(POST_MEDIA_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => PostMediaInputDto)
  mediaAssets?: PostMediaInputDto[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(100)
  city?: string

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/, { message: 'state deve ser uma UF de 2 letras maiúsculas' })
  state?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  mentionedReportId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  mentionedDebateId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  mentionedPropostaId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  mentionedDebatePollId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  quotePostId?: string

  @ApiPropertyOptional({ type: CreatePostPollDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePostPollDto)
  poll?: CreatePostPollDto
}
