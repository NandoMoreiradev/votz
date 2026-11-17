import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator'
import { PostKind } from '@prisma/client'

export class ListPostsQueryDto {
  @ApiPropertyOptional({ enum: ['for_you', 'trending', 'following', 'recent'], default: 'for_you' })
  @IsOptional()
  @IsIn(['for_you', 'trending', 'following', 'recent'])
  sort?: 'for_you' | 'trending' | 'following' | 'recent'

  @ApiPropertyOptional({ description: 'Slug da pauta cívica (#hashtag sem #)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  topic?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @MaxLength(2)
  state?: string

  @ApiPropertyOptional({ enum: PostKind })
  @IsOptional()
  @IsEnum(PostKind)
  kind?: PostKind

  @ApiPropertyOptional({ enum: ['CITIZEN', 'POLITICIAN', 'ENTITY'] })
  @IsOptional()
  @IsIn(['CITIZEN', 'POLITICIAN', 'ENTITY'])
  authorType?: 'CITIZEN' | 'POLITICIAN' | 'ENTITY'

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  authorUserId?: string

  @ApiPropertyOptional({ description: 'Perfil cidadão: publicações próprias e reposts, em ordem de atividade' })
  @IsOptional()
  @IsUUID()
  profileUserId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  authorOrgId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasPoll?: boolean

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number
}
