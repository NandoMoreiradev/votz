import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class UpdateCompanyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tradeName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  @MaxLength(300)
  website?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  logoUrl?: string
}
