import { ShareCardFormat } from '@prisma/client'
import { IsDateString, IsEnum, IsOptional } from 'class-validator'

export class GenerateShareCardDto {
  @IsOptional()
  @IsEnum(ShareCardFormat)
  format?: ShareCardFormat

  @IsOptional()
  @IsDateString()
  from?: string

  @IsOptional()
  @IsDateString()
  to?: string
}

export class ShareCardQueryDto {
  @IsOptional()
  @IsEnum(ShareCardFormat)
  format?: ShareCardFormat

  @IsOptional()
  @IsDateString()
  from?: string

  @IsOptional()
  @IsDateString()
  to?: string
}
