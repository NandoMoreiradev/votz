import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsString, MinLength, MaxLength } from 'class-validator'
import { REPORT_LIFECYCLE_LIMITS as L } from '@votz/shared-types'

export enum DisputeResolution {
  UPHOLD = 'UPHOLD', // quem resolveu tinha razão → volta para Resolvido (ou Arquivado)
  REOPEN = 'REOPEN', // cidadão tinha razão → volta para Aberto
}

export class ResolveDisputeDto {
  @ApiProperty({ enum: DisputeResolution, description: 'UPHOLD = a resolução vale | REOPEN = o cidadão tem razão e o relato reabre' })
  @IsEnum(DisputeResolution)
  decision: DisputeResolution

  @ApiProperty({ example: 'As fotos do cidadão mostram que o problema continua.', minLength: L.DECISION_MIN, maxLength: 500 })
  @IsString()
  @MinLength(L.DECISION_MIN, { message: `Explique a decisão em pelo menos ${L.DECISION_MIN} caracteres.` })
  @MaxLength(500)
  justification: string
}
