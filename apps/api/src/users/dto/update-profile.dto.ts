import { ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsOptional, IsString, IsUrl, MaxLength, MinLength,
  Matches, IsNumber, Min, Max,
} from 'class-validator'
import { Transform } from 'class-transformer'
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js'

function normalizePhone(value: unknown): string {
  const raw = String(value ?? '').trim()
  try {
    if (isValidPhoneNumber(raw, 'BR')) {
      return parsePhoneNumber(raw, 'BR').format('E.164')
    }
  } catch { /* deixa passar para o validator rejeitar */ }
  return raw
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'João Silva' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string

  @ApiPropertyOptional({ example: 'Ativista cívico de São Paulo.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio?: string

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.jpg' })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string

  @ApiPropertyOptional({ example: '+5511999999999' })
  @IsOptional()
  @Transform(({ value }) => normalizePhone(value))
  @Matches(/^\+\d{10,15}$/, { message: 'Telefone inválido. Use o formato (11) 99999-9999' })
  phone?: string

  @ApiPropertyOptional({ example: '01310100' })
  @IsOptional()
  @Transform(({ value }) => String(value ?? '').replace(/\D/g, ''))
  @Matches(/^\d{8}$/, { message: 'CEP inválido. Use 8 dígitos' })
  zipCode?: string

  @ApiPropertyOptional({ example: '1000' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  streetNumber?: string

  @ApiPropertyOptional({ example: 'Apto 42' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  complement?: string

  @ApiPropertyOptional({ example: 'Avenida Paulista' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string

  @ApiPropertyOptional({ example: 'Bela Vista' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  neighborhood?: string

  @ApiPropertyOptional({ example: 'São Paulo' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: 'Estado deve ter 2 letras maiúsculas (ex: SP)' })
  state?: string

  @ApiPropertyOptional({ example: -23.5614 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number

  @ApiPropertyOptional({ example: -46.6527 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number
}
