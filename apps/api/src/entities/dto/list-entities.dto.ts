import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { Transform, Type } from 'class-transformer'
import { EntityType } from '@votz/shared-types'

export class ListEntitiesDto {
  @ApiPropertyOptional({ enum: EntityType })
  @IsOptional()
  @IsEnum(EntityType)
  type?: EntityType

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string

  @ApiPropertyOptional({ description: 'Search by legal name' })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ description: 'Filter only verified entities' })
  @IsOptional()
  @Transform(({ value }) => value === undefined ? undefined : value === 'true')
  @IsBoolean()
  verified?: boolean

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20
}
