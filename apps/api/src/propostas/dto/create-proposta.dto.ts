import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator'
import { Category } from '@votz/shared-types'

export class CreatePropostaDto {
  @ApiProperty({ example: 'Projeto de melhoria do transporte público municipal' })
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  titulo: string

  @ApiProperty({ example: '## Objetivo\n\nReduzir o tempo médio de espera nas linhas de ônibus...' })
  @IsString()
  @MinLength(30)
  @MaxLength(10000)
  descricao: string

  @ApiProperty({ enum: Category, isArray: true, example: ['MOBILITY', 'URBAN_SERVICES'] })
  @IsArray()
  @IsEnum(Category, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  categorias: Category[]

  @ApiPropertyOptional({ example: 'https://camara.leg.br/proposicoes/PL-1234-2026' })
  @IsUrl()
  @IsOptional()
  @MaxLength(500)
  linkExterno?: string
}
