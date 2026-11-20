import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsString, Matches } from 'class-validator'

export class SetOrgHandleDto {
  @ApiProperty({ example: 'prefeitura_sp' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/^@+/, '').toLowerCase() : value))
  @Matches(/^[a-z0-9_]{3,30}$/, {
    message: 'Nome de usuário deve ter 3 a 30 caracteres (apenas letras minúsculas, números e _)',
  })
  username: string
}
