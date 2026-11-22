import { ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsOptional, IsString, IsUrl, MaxLength, MinLength,
  Matches, IsNumber, Min, Max, IsIn, ValidateIf,
} from 'class-validator'
import { USER_GENDERS, type UserGender } from '@votz/shared-types'
import { IsAdultBirthDate } from '../../common/validators/birth-date.validator'
import { Transform } from 'class-transformer'
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js'

function normalizePhone(value: unknown): string {
  const raw = String(value ?? '').trim()
  try {
    if (raw.startsWith('+') && isValidPhoneNumber(raw)) {
      return parsePhoneNumber(raw).format('E.164')
    }
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

  @ApiPropertyOptional({ example: 'joao_silva' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value
    const clean = value.trim().replace(/^@+/, '').toLowerCase()
    return clean === '' ? undefined : clean
  })
  @Matches(/^[a-z0-9_]{3,30}$/, {
    message: 'Nome de usuário deve ter 3 a 30 caracteres (apenas letras minúsculas, números e _)',
  })
  username?: string

  @ApiPropertyOptional({ example: 'Ativista cívico de São Paulo.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio?: string

  @ApiPropertyOptional({ example: 'https://cdn.votz.app/avatars/avatar.jpg' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  avatarUrl?: string

  @ApiPropertyOptional({ description: 'Capa do perfil (ideal 1500x500, proporção 3:1). Envie antes por POST /storage/upload/cover.' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  @MaxLength(500)
  coverUrl?: string

  @ApiPropertyOptional({ example: '+5511999999999' })
  @IsOptional()
  @Transform(({ value }) => normalizePhone(value))
  @Matches(/^\+\d{7,15}$/, { message: 'Telefone inválido. Envie no formato E.164, ex: +5511999999999' })
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

  @ApiPropertyOptional({ example: '1990-05-17', nullable: true, description: 'Opcional; `null` apaga. Nunca aparece no perfil público.' })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsAdultBirthDate()
  birthDate?: string | null

  @ApiPropertyOptional({ enum: USER_GENDERS, nullable: true, description: 'Opcional; `null` apaga. Nunca aparece no perfil público.' })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsIn(USER_GENDERS as unknown as string[], { message: 'Gênero inválido.' })
  gender?: UserGender | null
}
