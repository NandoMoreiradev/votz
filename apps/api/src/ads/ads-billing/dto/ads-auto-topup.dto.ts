import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator'
import { AD_AUTO_TOPUP_LIMITS } from '@votz/shared-types'

export class SetAdAutoTopUpDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean

  @ApiProperty({ description: 'Recarrega quando o saldo ficar abaixo disto (centavos)', example: 5000 })
  @IsInt()
  @Min(1)
  @Max(AD_AUTO_TOPUP_LIMITS.MAX_THRESHOLD_CENTS * 2)
  thresholdCents: number

  @ApiProperty({ description: 'Valor de cada recarga (centavos)', example: 10000 })
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountCents: number

  @ApiProperty({ description: 'Teto de recargas automáticas por mês (centavos)', example: 50000 })
  @IsInt()
  @Min(1)
  @Max(AD_AUTO_TOPUP_LIMITS.MAX_MONTHLY_LIMIT_CENTS * 2)
  monthlyLimitCents: number

  @ApiPropertyOptional({ description: 'Aceita que o cartão seja cobrado sozinho (obrigatório para ligar)' })
  @IsOptional()
  @IsBoolean()
  acceptCharges?: boolean
}
