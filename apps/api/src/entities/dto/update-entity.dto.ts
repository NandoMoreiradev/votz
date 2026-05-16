import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { Category } from '@votz/shared-types'

class SlaHoursDto {
  @ApiPropertyOptional({ example: 48 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  [Category.HEALTH]?: number

  @ApiPropertyOptional({ example: 72 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  [Category.MOBILITY]?: number

  @ApiPropertyOptional({ example: 72 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  [Category.SAFETY]?: number

  @ApiPropertyOptional({ example: 96 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  [Category.EDUCATION]?: number

  @ApiPropertyOptional({ example: 72 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  [Category.SANITATION]?: number

  @ApiPropertyOptional({ example: 96 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  [Category.HOUSING]?: number

  @ApiPropertyOptional({ example: 72 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  [Category.OTHER]?: number
}

export class UpdateEntityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  legalName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  website?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  logoUrl?: string

  @ApiPropertyOptional({ type: SlaHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SlaHoursDto)
  slaHours?: SlaHoursDto
}
