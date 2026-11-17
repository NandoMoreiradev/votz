import { Type } from 'class-transformer'
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { SuggestionCategory, SuggestionStatus } from '@prisma/client'

export class ListSuggestionsQueryDto {
  @ApiPropertyOptional({ enum: SuggestionStatus })
  @IsOptional()
  @IsEnum(SuggestionStatus)
  status?: SuggestionStatus

  @ApiPropertyOptional({ enum: SuggestionCategory })
  @IsOptional()
  @IsEnum(SuggestionCategory)
  category?: SuggestionCategory

  @ApiPropertyOptional({ enum: ['top', 'recent'], default: 'top' })
  @IsOptional()
  @IsIn(['top', 'recent'])
  sort?: 'top' | 'recent'

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number
}
