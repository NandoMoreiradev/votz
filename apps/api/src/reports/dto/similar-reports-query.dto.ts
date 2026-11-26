import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator'
import { Type } from 'class-transformer'
import { Category } from '@votz/shared-types'

export class SimilarReportsQueryDto {
  @ApiProperty({ description: 'Título para comparar', minLength: 5, maxLength: 300 })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  title: string

  @ApiPropertyOptional({ description: 'Descrição para comparar (melhora a busca semântica)', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @ApiPropertyOptional({ description: 'Filtrar por categoria do relato', enum: Category })
  @IsOptional()
  @IsEnum(Category)
  category?: Category

  @ApiPropertyOptional({ description: 'Filtrar por UF (2 letras, ex.: SP)', example: 'SP' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'UF deve ter 2 letras' })
  state?: string

  @ApiPropertyOptional({ description: 'Filtrar por cidade', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string

  @ApiPropertyOptional({ description: 'Máximo de resultados', default: 5, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  limit?: number
}
