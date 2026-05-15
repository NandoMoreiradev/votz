import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsString, MinLength, MaxLength } from 'class-validator'

export enum StatusAtualizavel {
  EM_ANALISE = 'EM_ANALISE',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  RESOLVIDO = 'RESOLVIDO',
  ARQUIVADO = 'ARQUIVADO',
}

export class AtualizarStatusDto {
  @ApiProperty({ enum: StatusAtualizavel })
  @IsEnum(StatusAtualizavel)
  status: StatusAtualizavel

  @ApiProperty({ example: 'Equipe acionada para reparo na próxima semana' })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  descricao: string
}
