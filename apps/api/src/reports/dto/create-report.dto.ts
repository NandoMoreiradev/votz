import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsEnum, IsString, IsUrl, MinLength, MaxLength, IsBoolean, IsOptional, IsNumber, IsUUID, ArrayMaxSize, Matches } from 'class-validator'
import { Transform } from 'class-transformer'
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
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(100)
  city?: string

  @ApiPropertyOptional({ description: 'UF — 2 caracteres maiúsculos', example: 'SP' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/, { message: 'state deve ser uma UF de 2 letras maiúsculas' })
  state?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(100)
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
