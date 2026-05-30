import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsDateString, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator'

export class UpdatePoliticianDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string

  @ApiPropertyOptional({ description: 'ID do partido (GET /parties)' })
  @IsOptional()
  @IsUUID()
  partyId?: string

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
  electoralZone?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  avatarUrl?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  website?: string
}
