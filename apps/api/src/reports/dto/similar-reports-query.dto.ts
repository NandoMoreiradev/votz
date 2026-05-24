import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { Type } from 'class-transformer'

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

  @ApiPropertyOptional({ description: 'Máximo de resultados', default: 5, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  limit?: number
}
