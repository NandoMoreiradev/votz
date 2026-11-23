import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator'
import { AD_REFUND_LIMITS } from '@votz/shared-types'

export class RequestAdRefundDto {
  @ApiProperty({ description: 'Quanto quer de volta, em centavos', example: 5000 })
  @IsInt({ message: 'Informe o valor em reais.' })
  @Min(1, { message: 'Informe quanto quer de volta.' })
  @Max(100_000_000)
  amountCents: number

  @ApiPropertyOptional({ description: 'Por que está pedindo (opcional)' })
  @IsOptional()
  @IsString()
  @MaxLength(AD_REFUND_LIMITS.REASON_MAX, { message: `Escreva no máximo ${AD_REFUND_LIMITS.REASON_MAX} letras.` })
  reason?: string
}

export class ResolveAdRefundDto {
  @ApiProperty({ enum: ['PAID', 'REJECTED'] })
  @IsIn(['PAID', 'REJECTED'], { message: 'Escolha devolvido ou recusado.' })
  decision: 'PAID' | 'REJECTED'

  /** Recusar exige explicar: o anunciante lê. */
  @ApiPropertyOptional({ description: 'Motivo da recusa (obrigatório ao recusar)' })
  @ValidateIf((dto: ResolveAdRefundDto) => dto.decision === 'REJECTED' || dto.note !== undefined)
  @IsString()
  @MinLength(10, { message: 'Explique o motivo em pelo menos 10 letras.' })
  @MaxLength(AD_REFUND_LIMITS.NOTE_MAX)
  note?: string

  @ApiPropertyOptional({ description: 'Identificador da devolução no banco ou no Pix (quando paga)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalId?: string
}
