import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateNested } from 'class-validator'
import { AD_CONVERSIONS, AD_CONVERSION_EVENT_NAMES, type AdConversionEventName } from '@votz/shared-types'

export class AdConversionEventDto {
  @ApiProperty({ description: 'O `votz_click_id` que veio no link do anúncio' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{22}$/, { message: 'clickId inválido' })
  clickId!: string

  @ApiProperty({ enum: AD_CONVERSION_EVENT_NAMES })
  @IsIn(AD_CONVERSION_EVENT_NAMES as unknown as string[])
  eventName!: AdConversionEventName

  @ApiPropertyOptional({ description: 'Valor em centavos (inteiro, zero ou mais)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(AD_CONVERSIONS.MAX_VALUE_CENTS)
  valueCents?: number

  @ApiProperty({ description: 'Quando aconteceu (ISO 8601)' })
  @IsDateString()
  occurredAt!: string

  @ApiProperty({ description: 'Identificador seu para esta conversão. Mandar de novo o mesmo não conta duas vezes.' })
  @IsString()
  @Length(1, 128)
  dedupeKey!: string
}

export class AdConversionsBatchDto {
  @ApiProperty({ type: [AdConversionEventDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(AD_CONVERSIONS.MAX_BATCH)
  @ValidateNested({ each: true })
  @Type(() => AdConversionEventDto)
  events!: AdConversionEventDto[]
}

export class CreateConversionKeyDto {
  @ApiProperty({ example: 'Loja virtual', description: 'Para você reconhecer a chave depois' })
  @IsString()
  @Length(2, 60)
  name!: string
}
