import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'
import {
  AD_CTA_LABELS,
  AD_INTEREST_IDS,
  AD_LIMITS,
  AD_MEDIA_RULES,
  AD_OBJECTIVES,
  AGE_BANDS,
  USER_GENDERS,
  type AdCtaLabel,
  type AdInterestId,
  type AdObjective,
  type AgeBand,
  type UserGender,
} from '@votz/shared-types'
import { PostMediaInputDto } from '../../../media/dto/media.dto'

export class CreateAdAccountDto {
  @ApiProperty({ example: 'Conta principal' })
  @IsString()
  @MinLength(2, { message: 'Dê um nome à conta.' })
  @MaxLength(AD_LIMITS.NAME_MAX)
  name: string
}

export class AdSetInputDto {
  @ApiProperty({ example: 'Bairro Centro, 25 a 44 anos' })
  @IsString()
  @MinLength(2, { message: 'Dê um nome ao público.' })
  @MaxLength(AD_LIMITS.NAME_MAX)
  name: string

  @ApiProperty({ description: 'Orçamento por dia, em centavos', example: 2000 })
  @IsInt()
  @Min(AD_LIMITS.MIN_DAILY_BUDGET_CENTS, { message: 'O orçamento mínimo é R$ 6,00 por dia.' })
  @Max(AD_LIMITS.MAX_DAILY_BUDGET_CENTS, { message: 'O orçamento máximo é R$ 10.000,00 por dia.' })
  dailyBudgetCents: number

  @ApiPropertyOptional({ description: 'Lance máximo em centavos. Vazio: o Votz decide.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  bidCapCents?: number | null

  @ApiProperty({ example: '2026-12-01' })
  @IsISO8601({}, { message: 'Data de início inválida.' })
  startAt: string

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsISO8601({}, { message: 'Data de fim inválida.' })
  endAt?: string | null

  @ApiProperty({ example: ['SP'], description: 'Siglas dos estados. Vazio com cidades vazias: Brasil todo.' })
  @IsArray()
  @ArrayMaxSize(AD_LIMITS.MAX_STATES)
  @ArrayUnique()
  @Matches(/^[A-Z]{2}$/, { each: true, message: 'Use a sigla do estado (ex.: SP).' })
  states: string[]

  @ApiProperty({ example: ['São Paulo'] })
  @IsArray()
  @ArrayMaxSize(AD_LIMITS.MAX_CITIES, { message: `Escolha no máximo ${AD_LIMITS.MAX_CITIES} cidades.` })
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  cities: string[]

  @ApiProperty({ enum: AD_INTEREST_IDS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(AD_INTEREST_IDS as string[], { each: true, message: 'Um dos interesses não existe na lista.' })
  interests: AdInterestId[]

  @ApiProperty({ enum: AGE_BANDS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(AGE_BANDS as readonly string[] as string[], { each: true, message: 'Faixa de idade inválida.' })
  ageBands: AgeBand[]

  @ApiProperty({ enum: USER_GENDERS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(USER_GENDERS as readonly string[] as string[], { each: true, message: 'Gênero inválido.' })
  genders: UserGender[]

  @ApiProperty({ description: 'Público automático: a IA encontra quem tem mais chance de se interessar' })
  @IsBoolean()
  automaticAudience: boolean
}

export class AdCreativeInputDto {
  @ApiProperty({ example: 'Pão quentinho às 7h' })
  @IsString()
  @MinLength(2, { message: 'Escreva o título.' })
  @MaxLength(AD_LIMITS.HEADLINE_MAX, { message: `O título pode ter até ${AD_LIMITS.HEADLINE_MAX} letras.` })
  headline: string

  @ApiProperty({ example: 'Padaria do bairro com entrega em 30 minutos.' })
  @IsString()
  @MinLength(2, { message: 'Escreva o texto do anúncio.' })
  @MaxLength(AD_LIMITS.BODY_MAX, { message: `O texto pode ter até ${AD_LIMITS.BODY_MAX} letras.` })
  body: string

  @ApiProperty({ enum: AD_CTA_LABELS })
  @IsIn(AD_CTA_LABELS as readonly string[] as string[], { message: 'Escolha um texto de botão da lista.' })
  ctaLabel: AdCtaLabel

  @ApiProperty({ example: 'https://minhaempresa.com.br/oferta' })
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'O link precisa começar com https:// e ser um endereço válido.' })
  @MaxLength(AD_LIMITS.URL_MAX)
  destinationUrl: string

  @ApiPropertyOptional({
    type: PostMediaInputDto,
    description: 'Foto ou vídeo do anúncio, enviado em POST /ads/COMPANY/:empresa/media, com a moldura e o enquadramento escolhidos. Sem ele, o anúncio é só texto.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PostMediaInputDto)
  media?: PostMediaInputDto

  @ApiPropertyOptional({
    type: [PostMediaInputDto],
    description: `Carrossel: até ${AD_MEDIA_RULES.MAX_ITEMS} fotos, todas no mesmo formato (ou um vídeo sozinho). Use este campo ou "media", nunca os dois.`,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(AD_MEDIA_RULES.MAX_ITEMS, { message: `O carrossel aceita até ${AD_MEDIA_RULES.MAX_ITEMS} fotos.` })
  @ValidateNested({ each: true })
  @Type(() => PostMediaInputDto)
  mediaItems?: PostMediaInputDto[]
}

export class CreateAdCampaignDto {
  @ApiProperty({ example: 'Promoção de dezembro' })
  @IsString()
  @MinLength(2, { message: 'Dê um nome à campanha.' })
  @MaxLength(AD_LIMITS.NAME_MAX)
  name: string

  @ApiProperty({ enum: AD_OBJECTIVES })
  @IsIn(AD_OBJECTIVES as readonly string[] as string[], { message: 'Escolha um objetivo.' })
  objective: AdObjective

  @ApiProperty({ type: AdSetInputDto })
  @ValidateNested()
  @Type(() => AdSetInputDto)
  adSet: AdSetInputDto

  @ApiProperty({ type: AdCreativeInputDto })
  @ValidateNested()
  @Type(() => AdCreativeInputDto)
  creative: AdCreativeInputDto

  @ApiPropertyOptional({ description: 'Manda o anúncio para revisão ao salvar' })
  @IsOptional()
  @IsBoolean()
  submitForReview?: boolean
}

export class SetAdCampaignStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'] })
  @IsIn(['ACTIVE', 'PAUSED', 'ARCHIVED'], { message: 'Situação inválida.' })
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
}

/** Edição do anúncio: só o que vier no corpo muda. */
export class UpdateAdDto {
  @ApiPropertyOptional({ example: 'Pão quentinho às 7h' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Escreva o título.' })
  @MaxLength(AD_LIMITS.HEADLINE_MAX, { message: `O título pode ter até ${AD_LIMITS.HEADLINE_MAX} letras.` })
  headline?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Escreva o texto do anúncio.' })
  @MaxLength(AD_LIMITS.BODY_MAX, { message: `O texto pode ter até ${AD_LIMITS.BODY_MAX} letras.` })
  body?: string

  @ApiPropertyOptional({ enum: AD_CTA_LABELS })
  @IsOptional()
  @IsIn(AD_CTA_LABELS as readonly string[] as string[], { message: 'Escolha um texto de botão da lista.' })
  ctaLabel?: AdCtaLabel

  @ApiPropertyOptional({ example: 'https://minhaempresa.com.br/oferta' })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'O link precisa começar com https:// e ser um endereço válido.' })
  @MaxLength(AD_LIMITS.URL_MAX)
  destinationUrl?: string
}

/** Edição do público e do orçamento: só o que vier no corpo muda. A data de início não muda. */
export class UpdateAdSetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Dê um nome ao público.' })
  @MaxLength(AD_LIMITS.NAME_MAX)
  name?: string

  @ApiPropertyOptional({ description: 'Orçamento por dia, em centavos' })
  @IsOptional()
  @IsInt()
  @Min(AD_LIMITS.MIN_DAILY_BUDGET_CENTS, { message: 'O orçamento mínimo é R$ 6,00 por dia.' })
  @Max(AD_LIMITS.MAX_DAILY_BUDGET_CENTS, { message: 'O orçamento máximo é R$ 10.000,00 por dia.' })
  dailyBudgetCents?: number

  @ApiPropertyOptional({ description: 'Lance máximo em centavos. null: o Votz decide.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  bidCapCents?: number | null

  @ApiPropertyOptional({ description: 'Data de fim. null: sem data para acabar.' })
  @IsOptional()
  @IsISO8601({}, { message: 'Data de fim inválida.' })
  endAt?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(AD_LIMITS.MAX_STATES)
  @ArrayUnique()
  @Matches(/^[A-Z]{2}$/, { each: true, message: 'Use a sigla do estado (ex.: SP).' })
  states?: string[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(AD_LIMITS.MAX_CITIES, { message: `Escolha no máximo ${AD_LIMITS.MAX_CITIES} cidades.` })
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  cities?: string[]

  @ApiPropertyOptional({ enum: AD_INTEREST_IDS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(AD_INTEREST_IDS as string[], { each: true, message: 'Um dos interesses não existe na lista.' })
  interests?: AdInterestId[]

  @ApiPropertyOptional({ enum: AGE_BANDS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(AGE_BANDS as readonly string[] as string[], { each: true, message: 'Faixa de idade inválida.' })
  ageBands?: AgeBand[]

  @ApiPropertyOptional({ enum: USER_GENDERS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(USER_GENDERS as readonly string[] as string[], { each: true, message: 'Gênero inválido.' })
  genders?: UserGender[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  automaticAudience?: boolean
}

/** Troca (ou tira) a foto ou o vídeo do anúncio. `media` ausente ou nulo tira a mídia: o anúncio passa a ser só texto. */
export class UpdateAdMediaDto {
  @ApiPropertyOptional({
    type: PostMediaInputDto,
    nullable: true,
    description: 'Foto ou vídeo novo, enviado antes em POST /ads/COMPANY/:empresa/media, com a moldura e o enquadramento. Nulo: tira a mídia.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PostMediaInputDto)
  media?: PostMediaInputDto | null

  @ApiPropertyOptional({ type: [PostMediaInputDto], description: `Carrossel novo: até ${AD_MEDIA_RULES.MAX_ITEMS} fotos (ou um vídeo sozinho). Vazio ou ausente, junto com "media" nulo: tira a mídia.` })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(AD_MEDIA_RULES.MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => PostMediaInputDto)
  mediaItems?: PostMediaInputDto[]
}
