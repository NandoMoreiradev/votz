import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'

export class SetChatStorageDto {
  @ApiProperty({
    minimum: 1,
    maximum: 102400,
    description: 'Espaço de arquivos das conversas liberado para a pessoa, em MB (substitui a cota padrão)',
  })
  @IsInt()
  @Min(1)
  @Max(102400)
  quotaMb: number

  @ApiProperty({ minLength: 10, maxLength: 500, description: 'Motivo da liberação (entre 10 e 500 caracteres)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string
}
