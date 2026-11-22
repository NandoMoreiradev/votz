import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsInt, Max, Min } from 'class-validator'
import { AD_BILLING_LIMITS, AD_TOPUP_METHODS, type AdTopUpMethod } from '@votz/shared-types'

export class CreateAdTopUpDto {
  @ApiProperty({ description: 'Valor da recarga em centavos', example: 5000 })
  @IsInt({ message: 'Informe o valor da recarga em reais.' })
  @Min(AD_BILLING_LIMITS.MIN_TOPUP_CENTS, { message: 'A recarga mínima é de R$ 20,00.' })
  @Max(AD_BILLING_LIMITS.MAX_TOPUP_CENTS, { message: 'A recarga máxima por pedido é de R$ 10.000,00.' })
  amountCents: number

  @ApiProperty({ enum: AD_TOPUP_METHODS })
  @IsIn(AD_TOPUP_METHODS, { message: 'Escolha Pix, boleto ou cartão.' })
  method: AdTopUpMethod
}
