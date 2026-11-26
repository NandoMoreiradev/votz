import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class ChangePasswordDto {
  @ApiPropertyOptional({ description: 'Senha atual (obrigatória se a conta já tem senha configurada)' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  currentPassword?: string

  @ApiProperty({ minLength: 8, maxLength: 128, description: 'Nova senha (mínimo 8 caracteres, com letra e número)' })
  @IsString()
  @MinLength(8, { message: 'A nova senha deve ter pelo menos 8 caracteres.' })
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'A nova senha deve conter pelo menos uma letra e um número.',
  })
  newPassword: string
}
