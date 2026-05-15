import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsString, MinLength, MaxLength, IsBoolean, IsOptional, IsNumber, IsUUID } from 'class-validator'
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

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(300)
  @IsOptional()
  typedAddress?: string

  @ApiPropertyOptional({ enum: RecipientType })
  @IsEnum(RecipientType)
  @IsOptional()
  recipientType?: RecipientType

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  recipientId?: string
}
