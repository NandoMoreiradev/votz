import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator'
import { PropostaStatus } from '@votz/shared-types'

export class UpdatePropostaStatusDto {
  @ApiProperty({ enum: PropostaStatus })
  @IsEnum(PropostaStatus)
  status: PropostaStatus

  @ApiProperty({ example: 'Proposta formalmente apresentada na Câmara em sessão de 15/06/2026.' })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  conteudo: string
}
