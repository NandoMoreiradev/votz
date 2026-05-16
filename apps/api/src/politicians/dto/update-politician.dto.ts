import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsDateString, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator'

export class UpdatePoliticianDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  party?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  office?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  termStart?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  termEnd?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  avatarUrl?: string
}
