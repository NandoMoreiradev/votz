import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { Transform, Type } from 'class-transformer'

export class ListPoliticiansDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  party?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  office?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ description: 'Filter only verified politicians' })
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
