import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength, MinLength } from 'class-validator'
import { REPORT_LIFECYCLE_LIMITS as L } from '@votz/shared-types'

export class WithdrawAdvocacyDto {
  @ApiProperty({ description: 'Motivo público da desistência', minLength: L.WITHDRAW_MIN, maxLength: 500 })
  @IsString()
  @MinLength(L.WITHDRAW_MIN, { message: `Explique o motivo em pelo menos ${L.WITHDRAW_MIN} caracteres.` })
  @MaxLength(500)
  reason: string
}
