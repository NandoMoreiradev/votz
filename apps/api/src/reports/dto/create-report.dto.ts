import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsEnum, IsString, IsUrl, MinLength, MaxLength, IsBoolean, IsOptional, IsNumber, IsUUID, ArrayMaxSize } from 'class-validator'
import { Category, RecipientType } from '@votz/shared-types'

export class CreateReportDto {
  @ApiProperty({ example: 'Pothole on Main Street for 3 months without repair' })
  @IsString()
  @MinLength(10)
  @MaxLength(120)
  title: string

  @ApiProperty({ example: 'The pothole is approximately 1 meter in diameter...' })
  @IsString()
  @MinLength(30)
  @MaxLength(2000)
  description: string

  @ApiProperty({ enum: Category })
  @IsEnum(Category)
  category: Category

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  anonymous?: boolean

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  latitude?: number

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  longitude?: number

  @ApiPropertyOptional({ description: 'Endereço formatado para exibição (gerado pelo frontend)' })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  typedAddress?: string

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  city?: string

  @ApiPropertyOptional({ description: 'UF — 2 caracteres', example: 'SP' })
  @IsString()
  @MaxLength(2)
  @IsOptional()
  state?: string

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  neighborhood?: string

  @ApiPropertyOptional({ enum: RecipientType })
  @IsEnum(RecipientType)
  @IsOptional()
  recipientType?: RecipientType

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  recipientId?: string

  @ApiPropertyOptional({ type: [String], description: 'URLs de mídia já enviadas via /storage/upload/report-media (máx. 5)' })
  @IsArray()
  @IsUrl({}, { each: true })
  @ArrayMaxSize(5)
  @IsOptional()
  media?: string[]
}
