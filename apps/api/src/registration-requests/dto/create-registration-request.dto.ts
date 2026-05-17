import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator'

export enum RegistrationRequestType {
  ENTITY = 'ENTITY',
  POLITICIAN = 'POLITICIAN',
  COMPANY = 'COMPANY',
}

export class CreateRegistrationRequestDto {
  @ApiProperty({ enum: RegistrationRequestType })
  @IsEnum(RegistrationRequestType)
  type: RegistrationRequestType

  @ApiProperty({
    description: 'Dados do cadastro solicitado',
    example: { legalName: 'Prefeitura de Recife', cnpj: '09.168.704/0001-42', city: 'Recife', state: 'PE' },
  })
  @IsObject()
  payload: Record<string, unknown>

  @ApiPropertyOptional({ description: 'Contexto adicional do solicitante' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string
}
