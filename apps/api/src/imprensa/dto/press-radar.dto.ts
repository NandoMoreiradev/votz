import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator'
import {
  Category,
  PRESS_RADAR_FREQUENCIES,
  PRESS_RADAR_KINDS,
  PRESS_RADAR_LIMITS as L,
  type PressRadarFrequency,
  type PressRadarKind,
} from '@votz/shared-types'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)
const upperEach = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v)) : value
const trimEach = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim() : v)).filter((v) => v !== '') : value

export class CreatePressRadarRuleDto {
  @ApiProperty({ example: 'Saúde em Campinas' })
  @Transform(trim)
  @IsString()
  @MinLength(L.NAME_MIN, { message: 'Dê um nome para o aviso.' })
  @MaxLength(L.NAME_MAX)
  name: string

  @ApiProperty({ enum: PRESS_RADAR_KINDS })
  @IsIn(PRESS_RADAR_KINDS as unknown as string[], { message: 'Escolha o tipo de aviso.' })
  kind: PressRadarKind

  @ApiPropertyOptional({ type: [String], description: 'Siglas de estado (UF). Vazio = qualquer estado.' })
  @IsOptional()
  @Transform(upperEach)
  @IsArray()
  @ArrayMaxSize(L.MAX_STATES, { message: `No máximo ${L.MAX_STATES} estados.` })
  @Matches(/^[A-Z]{2}$/, { each: true, message: 'Estado inválido. Use a sigla com 2 letras.' })
  states?: string[]

  @ApiPropertyOptional({ type: [String], description: 'Nomes de cidade. Vazio = qualquer cidade.' })
  @IsOptional()
  @Transform(trimEach)
  @IsArray()
  @ArrayMaxSize(L.MAX_CITIES, { message: `No máximo ${L.MAX_CITIES} cidades.` })
  @IsString({ each: true })
  @MaxLength(L.CITY_MAX, { each: true })
  cities?: string[]

  @ApiPropertyOptional({ enum: Category, isArray: true, description: 'Temas. Vazio = qualquer tema.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.values(Category).length)
  @IsIn(Object.values(Category), { each: true, message: 'Tema inválido.' })
  categories?: Category[]

  @ApiPropertyOptional({ description: 'Pressão mínima (obrigatória em "Relato com muita pressão").' })
  @IsOptional()
  @IsNumber()
  @Min(L.MIN_PRESSURE_MIN)
  @Max(L.MIN_PRESSURE_MAX)
  minPressure?: number

  @ApiPropertyOptional({ description: 'Dias sem resposta (obrigatório em "Relato sem resposta da entidade").' })
  @IsOptional()
  @IsInt()
  @Min(L.STALLED_DAYS_MIN)
  @Max(L.STALLED_DAYS_MAX)
  stalledDays?: number

  @ApiPropertyOptional({ enum: PRESS_RADAR_FREQUENCIES })
  @IsOptional()
  @IsIn(PRESS_RADAR_FREQUENCIES as unknown as string[])
  frequency?: PressRadarFrequency
}

export class UpdatePressRadarRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(L.NAME_MIN)
  @MaxLength(L.NAME_MAX)
  name?: string

  @ApiPropertyOptional({ enum: PRESS_RADAR_FREQUENCIES })
  @IsOptional()
  @IsIn(PRESS_RADAR_FREQUENCIES as unknown as string[])
  frequency?: PressRadarFrequency
}
