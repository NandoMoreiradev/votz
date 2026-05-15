import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsEnum, IsString, MinLength, MaxLength,
  IsBoolean, IsOptional, IsNumber, IsUUID,
} from 'class-validator'
import { Categoria, DestinatarioTipo } from '@votz/shared-types'

export class CriarRelatoDto {
  @ApiProperty({ example: 'Buraco na Rua das Flores há 3 meses sem reparo' })
  @IsString()
  @MinLength(10)
  @MaxLength(120)
  titulo: string

  @ApiProperty({ example: 'O buraco tem aproximadamente 1 metro de diâmetro...' })
  @IsString()
  @MinLength(30)
  @MaxLength(2000)
  descricao: string

  @ApiProperty({ enum: Categoria })
  @IsEnum(Categoria)
  categoria: Categoria

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  anonimo?: boolean

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
  enderecoDigitado?: string

  @ApiPropertyOptional({ enum: DestinatarioTipo })
  @IsEnum(DestinatarioTipo)
  @IsOptional()
  destinatarioTipo?: DestinatarioTipo

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  destinatarioId?: string
}
