import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateNested } from 'class-validator'
import { AD_ADJACENCY, AD_EVENTS_MAX_BATCH, AD_SURFACES, type AdSurface } from '@votz/shared-types'

/** Lista no endereço: ids separados por vírgula (ex.: nearPostIds=a,b,c). */
const commaList = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').map((item) => item.trim()).filter(Boolean) : value

const CLIENT_EVENT_TYPES = ['IMPRESSION', 'VIEWABLE_IMPRESSION', 'CLICK', 'HIDE', 'HIDE_ADVERTISER', 'REPORT'] as const

/** Contexto da tela: a cidade e o estado que o feed está mostrando (sinal de contexto, vale sem aceite). */
export class NextAdQueryDto {
  @ApiProperty({ enum: AD_SURFACES })
  @IsIn(AD_SURFACES as unknown as string[])
  surface!: AdSurface

  @ApiPropertyOptional({ description: 'Posição do espaço no feed, a partir de 0' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  position?: number

  @ApiPropertyOptional({ description: 'UF da tela, ex.: SP' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string

  @ApiPropertyOptional({ description: 'Cidade da tela' })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  city?: string

  @ApiPropertyOptional({ description: 'Publicações em volta do espaço, separadas por vírgula (até 8). Anúncio de empresa alvo de relato citado ali não entra.' })
  @IsOptional()
  @Transform(commaList)
  @IsArray()
  @ArrayMaxSize(AD_ADJACENCY.MAX_IDS)
  @IsUUID('all', { each: true })
  nearPostIds?: string[]

  @ApiPropertyOptional({ description: 'Relatos em volta do espaço, separados por vírgula (até 8)' })
  @IsOptional()
  @Transform(commaList)
  @IsArray()
  @ArrayMaxSize(AD_ADJACENCY.MAX_IDS)
  @IsUUID('all', { each: true })
  nearReportIds?: string[]
}

export class AdClientEventDto {
  @ApiProperty({ description: 'Gerado no aparelho; repetir o mesmo não conta de novo' })
  @IsUUID()
  eventId!: string

  @ApiProperty({ enum: CLIENT_EVENT_TYPES })
  @IsIn(CLIENT_EVENT_TYPES as unknown as string[])
  type!: (typeof CLIENT_EVENT_TYPES)[number]

  @ApiProperty()
  @IsUUID()
  impressionId!: string

  @ApiProperty()
  @IsUUID()
  adId!: string

  @ApiProperty({ enum: AD_SURFACES })
  @IsIn(AD_SURFACES as unknown as string[])
  surface!: AdSurface

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(1000)
  position!: number

  @ApiProperty({ description: 'Hora no aparelho (ISO)' })
  @IsDateString()
  occurredAt!: string

  @ApiPropertyOptional({ description: 'Só em VIEWABLE_IMPRESSION: quanto tempo ficou visível' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  visibleMs?: number
}

export class AdEventsBatchDto {
  @ApiProperty({ type: [AdClientEventDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(AD_EVENTS_MAX_BATCH)
  @ValidateNested({ each: true })
  @Type(() => AdClientEventDto)
  events!: AdClientEventDto[]
}

export class AdStatsQueryDto {
  @ApiPropertyOptional({ description: 'Quantos dias para trás (padrão 7, até 90)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number
}
