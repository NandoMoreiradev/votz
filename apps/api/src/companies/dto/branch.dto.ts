import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min, MinLength } from 'class-validator'

export class CreateBranchDto {
  @ApiProperty({ maxLength: 140, example: 'Unidade Paulista' })
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name: string

  @ApiProperty({ maxLength: 240, example: 'Av. Paulista, 1000 - Bela Vista' })
  @IsString()
  @MinLength(4)
  @MaxLength(240)
  address: string

  @ApiProperty({ maxLength: 100, example: 'São Paulo' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city: string

  @ApiProperty({ minLength: 2, maxLength: 2, example: 'SP' })
  @IsString()
  @Length(2, 2)
  state: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number
}

export class UpdateBranchDto {
  @ApiPropertyOptional({ maxLength: 140 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name?: string

  @ApiPropertyOptional({ maxLength: 240 })
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(240)
  address?: string

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city?: string

  @ApiPropertyOptional({ minLength: 2, maxLength: 2 })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string
}
