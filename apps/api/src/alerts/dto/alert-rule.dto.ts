import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  AlertChannel,
  AlertFrequency,
  AlertRuleType,
  Category,
} from '@prisma/client'
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

export class CreateAlertRuleDto {
  @ApiProperty({ example: 'Buracos urgentes no Centro' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name: string

  @ApiProperty({ enum: AlertRuleType })
  @IsEnum(AlertRuleType)
  ruleType: AlertRuleType

  @ApiPropertyOptional({ enum: Category, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(Category, { each: true })
  categories?: Category[]

  @ApiPropertyOptional({ isArray: true, example: ['6gyf4bf'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(/^[0-9bcdefghjkmnpqrstuvwxyz]{4,9}$/, { each: true })
  cell7s?: string[]

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  wholeArea?: boolean

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100_000)
  minPressure?: number

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  stalledDays?: number

  @ApiProperty({ enum: AlertChannel, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(AlertChannel, { each: true })
  channels: AlertChannel[]

  @ApiProperty({ enum: AlertFrequency, default: AlertFrequency.IMMEDIATE })
  @IsOptional()
  @IsEnum(AlertFrequency)
  frequency?: AlertFrequency
}

export class UpdateAlertRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean

  @ApiPropertyOptional({ enum: AlertFrequency })
  @IsOptional()
  @IsEnum(AlertFrequency)
  frequency?: AlertFrequency

  @ApiPropertyOptional({ enum: AlertChannel, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(AlertChannel, { each: true })
  channels?: AlertChannel[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100_000)
  minPressure?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  stalledDays?: number
}
