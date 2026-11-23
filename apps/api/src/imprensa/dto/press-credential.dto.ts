import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength,
} from 'class-validator'
import {
  PRESS_CREDENTIAL_LIMITS as L, PRESS_OUTLET_TYPES, PRESS_PLANS, type PressOutletType, type PressPlan,
} from '@votz/shared-types'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)
const trimEach = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim() : v)) : value
// Só http e https: o link aparece para o moderador e nunca é aberto pelo servidor.
const URL_OPTS = { protocols: ['http', 'https'], require_protocol: true, require_tld: true }

export class CreatePressCredentialDto {
  @ApiProperty({ example: 'Gazeta do Interior' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o nome do veículo (ou o seu nome, se for freelancer).' })
  @MaxLength(L.OUTLET_NAME_MAX)
  outletName: string

  @ApiProperty({ enum: PRESS_OUTLET_TYPES })
  @IsIn(PRESS_OUTLET_TYPES as unknown as string[], { message: 'Escolha o tipo de veículo.' })
  outletType: PressOutletType

  @ApiPropertyOptional({ example: 'Repórter de cidades' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(L.JOB_TITLE_MAX)
  jobTitle?: string

  @ApiProperty({ example: 'https://gazetadointerior.com.br' })
  @Transform(trim)
  @IsUrl(URL_OPTS, { message: 'Informe o endereço do site com https://' })
  @MaxLength(L.WEBSITE_MAX)
  website: string

  @ApiProperty({ example: 'redacao@gazetadointerior.com.br' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Informe um e-mail válido da redação.' })
  @MaxLength(L.EMAIL_MAX)
  newsroomEmail: string

  @ApiPropertyOptional({ example: 'Saúde e transporte na região de Campinas' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(L.COVERAGE_MAX)
  coverageArea?: string

  @ApiProperty({ type: [String], description: `De ${L.PORTFOLIO_MIN} a ${L.PORTFOLIO_MAX} links de matérias que você assinou ou publicou` })
  @Transform(trimEach)
  @IsArray()
  @ArrayMinSize(L.PORTFOLIO_MIN, { message: 'Coloque ao menos 1 link de matéria publicada.' })
  @ArrayMaxSize(L.PORTFOLIO_MAX, { message: `No máximo ${L.PORTFOLIO_MAX} links.` })
  @IsUrl(URL_OPTS, { each: true, message: 'Cada link de matéria precisa começar com https://' })
  @MaxLength(L.WEBSITE_MAX, { each: true })
  portfolioUrls: string[]

  @ApiPropertyOptional({ description: 'Recado para o moderador' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(L.NOTE_MAX)
  note?: string
}

export class ConfirmPressEmailDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string
}

export class SetPressPlanDto {
  @ApiProperty({ enum: PRESS_PLANS })
  @IsIn(PRESS_PLANS as unknown as string[], { message: 'Plano inválido.' })
  plan: PressPlan

  @ApiProperty({ description: 'Motivo da troca (10 a 500 caracteres)' })
  @Transform(trim)
  @IsString()
  @MinLength(10, { message: 'Escreva o motivo (pelo menos 10 caracteres).' })
  @MaxLength(L.REVIEW_NOTE_MAX)
  reason: string
}

export class ReviewPressCredentialDto {
  @ApiPropertyOptional({ description: 'Obrigatório ao recusar ou cancelar (mínimo 10 caracteres)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(L.REVIEW_NOTE_MAX)
  reviewNote?: string
}
