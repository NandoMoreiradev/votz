import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator'
import { EntityType } from '@votz/shared-types'

export class CreateEntityDto {
  @ApiProperty({ example: 'Prefeitura Municipal de São Paulo' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  legalName: string

  @ApiProperty({ example: '12.345.678/0001-90', description: 'CNPJ com ou sem formatação' })
  @IsString()
  @Matches(/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/, { message: 'CNPJ inválido' })
  cnpj: string

  @ApiProperty({ enum: EntityType })
  @IsEnum(EntityType)
  type: EntityType

  @ApiPropertyOptional({ example: 'São Paulo' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string

  @ApiPropertyOptional({ example: 'https://prefeitura.sp.gov.br' })
  @IsOptional()
  @IsUrl()
  website?: string
}
