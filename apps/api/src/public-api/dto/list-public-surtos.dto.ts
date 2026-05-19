import { IsOptional, IsEnum, IsString, IsBoolean } from 'class-validator'
import { Transform } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Category } from '@votz/shared-types'

export class ListPublicSurtosDto {
  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  state?: string

  @ApiPropertyOptional({ enum: Category })
  @IsOptional()
  @IsEnum(Category)
  category?: Category

  @ApiPropertyOptional({ default: true, description: 'Filtrar apenas surtos ativos' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean = true
}
