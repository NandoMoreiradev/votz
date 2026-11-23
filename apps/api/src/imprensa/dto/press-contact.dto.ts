import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator'
import {
  PRESS_CONTACT_DECLINE_REASONS,
  PRESS_CONTACT_LIMITS as L,
  type PressContactDeclineReason,
} from '@votz/shared-types'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

export class CreatePressContactDto {
  @ApiProperty()
  @IsUUID('all', { message: 'Relato inválido.' })
  reportId: string

  @ApiProperty({ description: 'Quem você é, o que quer saber e para quando (de 20 a 500 caracteres).' })
  @Transform(trim)
  @IsString()
  @MinLength(L.MESSAGE_MIN, { message: `Explique o pedido em pelo menos ${L.MESSAGE_MIN} caracteres.` })
  @MaxLength(L.MESSAGE_MAX)
  message: string
}

export class RespondPressContactDto {
  @ApiProperty({ enum: ['accept', 'decline'] })
  @IsIn(['accept', 'decline'], { message: 'Escolha aceitar ou recusar.' })
  action: 'accept' | 'decline'

  @ApiPropertyOptional({ description: 'Ao aceitar: o que você quer compartilhar (como prefere ser contatado). Só o jornalista lê.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(L.REPLY_MAX)
  reply?: string

  @ApiPropertyOptional({ description: 'Ao aceitar: prefere conversar pelas Conversas do Votz.' })
  @IsOptional()
  @IsBoolean()
  viaVotzChat?: boolean

  @ApiPropertyOptional({ enum: PRESS_CONTACT_DECLINE_REASONS })
  @IsOptional()
  @IsIn(PRESS_CONTACT_DECLINE_REASONS as unknown as string[], { message: 'Motivo inválido.' })
  reason?: PressContactDeclineReason

  @ApiPropertyOptional({ description: 'Ao recusar: não receber mais pedidos deste jornalista.' })
  @IsOptional()
  @IsBoolean()
  block?: boolean
}

export class SetPressContactOptInDto {
  @ApiProperty()
  @IsBoolean()
  pressContactOk: boolean
}
