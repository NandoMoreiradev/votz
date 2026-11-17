import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength, MinLength } from 'class-validator'

export class MobileRefreshDto {
  @ApiProperty({ description: 'Opaque refresh token stored in the native secure store' })
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  refreshToken: string
}
