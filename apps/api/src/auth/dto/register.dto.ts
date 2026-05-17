import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsEmail, IsString, MinLength, Matches, IsOptional,
  IsNumber, Min, Max, MaxLength,
} from 'class-validator'
import { Transform } from 'class-transformer'
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js'

function normalizePhone(value: unknown): string {
  const raw = String(value ?? '').trim()
  try {
    if (isValidPhoneNumber(raw, 'BR')) {
      return parsePhoneNumber(raw, 'BR').format('E.164')
    }
  } catch { /* deixa passar para o @IsPhoneNumber rejeitar */ }
  return raw
}

export class RegisterDto {
  @ApiProperty({ example: 'João Silva' })
  @IsString()
  @MinLength(2)
  name: string

  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail()
  @Transform(({ value }) => value?.trim().toLowerCase())
  email: string

  @ApiProperty({ example: 'Senha@123' })
  @IsString()
  @MinLength(8)
  @Matches(/[A-Z]/, { message: 'Deve conter ao menos uma letra maiúscula' })
  @Matches(/[0-9]/, { message: 'Deve conter ao menos um número' })
  @Matches(/[^A-Za-z0-9]/, { message: 'Deve conter ao menos um caractere especial' })
  password: string

  @ApiProperty({ example: '11999999999' })
  @Transform(({ value }) => normalizePhone(value))
  @Matches(/^\+\d{10,15}$/, { message: 'Telefone inválido. Use o formato (11) 99999-9999' })
  phone: string

  @ApiProperty({ example: '01310100' })
  @Transform(({ value }) => String(value ?? '').replace(/\D/g, ''))
  @Matches(/^\d{8}$/, { message: 'CEP inválido. Use 8 dígitos' })
  zipCode: string

  @ApiProperty({ example: '1000' })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  streetNumber: string

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
