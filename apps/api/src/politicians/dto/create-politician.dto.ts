import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class CreatePoliticianDto {
  @ApiProperty({ example: 'PT' })
  @IsString()
  @MaxLength(20)
  party: string

  @ApiProperty({ example: 'Vereador' })
  @IsString()
  @MaxLength(80)
  office: string

  @ApiProperty({ example: '2025-01-01' })
  @IsDateString()
  termStart: string

  @ApiProperty({ example: '2028-12-31' })
  @IsDateString()
  termEnd: string

  @ApiProperty({ example: 'Zona Sul' })
  @IsString()
  @MaxLength(80)
  electoralZone: string

  @ApiProperty({ example: 'SP' })
  @IsString()
  @MaxLength(2)
  state: string

  @ApiPropertyOptional({ example: 'São Paulo' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string
}
