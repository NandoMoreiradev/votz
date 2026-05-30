import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean } from 'class-validator'

export class VotePropostaDto {
  @ApiProperty({ description: 'true = apoia, false = rejeita' })
  @IsBoolean()
  apoio: boolean
}
