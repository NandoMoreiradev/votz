import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { AD_LIBRARY } from '@votz/shared-types'

const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

export class AdLibraryQueryDto {
  @ApiPropertyOptional({ description: 'Busca no texto do anúncio ou no nome da empresa' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(AD_LIBRARY.SEARCH_MAX)
  q?: string

  @ApiPropertyOptional({ description: 'Só os anúncios desta empresa (id ou @usuario)' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(60)
  company?: string

  @ApiPropertyOptional({ enum: ['active', 'all'], description: 'active: só os que estão rodando. all: também os que pararam nos últimos 12 meses (padrão)' })
  @IsOptional()
  @IsIn(['active', 'all'])
  status?: 'active' | 'all'

  @ApiPropertyOptional({ minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page?: number

  @ApiPropertyOptional({ minimum: 1, maximum: AD_LIBRARY.MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(AD_LIBRARY.MAX_PAGE_SIZE)
  limit?: number
}
