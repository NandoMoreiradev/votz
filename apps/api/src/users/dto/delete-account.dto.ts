import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class DeleteAccountDto {
  @ApiPropertyOptional({ description: 'Senha atual (obrigatória para contas com senha)' })
  @IsOptional()
  @IsString()
  password?: string

  @ApiPropertyOptional({ description: 'E-mail cadastrado (obrigatório para contas apenas Google)' })
  @IsOptional()
  @IsString()
  confirmEmail?: string
}
