import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'
import { Category, ReportStatus } from '@votz/shared-types'

export class MapQueryDto {
  @ApiPropertyOptional({ enum: Category })
  @IsOptional()
  @IsEnum(Category)
  category?: Category

  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus

  // Bounding box — retorna só relatos dentro do viewport
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  swLat?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  swLng?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  neLat?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  neLng?: number

  @ApiPropertyOptional({ default: 500, description: 'Max pins returned' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 500
}
