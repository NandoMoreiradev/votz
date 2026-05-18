import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsString, MinLength, MaxLength } from 'class-validator'

export enum DisputeResolution {
  UPHOLD = 'UPHOLD',   // entidade tinha razão → volta para RESOLVED
  REOPEN  = 'REOPEN',  // cidadão tinha razão  → volta para OPEN
}

export class ResolveDisputeDto {
  @ApiProperty({ enum: DisputeResolution, description: 'UPHOLD = entidade estava certa | REOPEN = cidadão estava certo' })
  @IsEnum(DisputeResolution)
  decision: DisputeResolution

  @ApiProperty({ example: 'Evidências do cidadão comprovam que o problema persiste.', minLength: 20, maxLength: 500 })
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  justification: string
}
