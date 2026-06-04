import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsUUID } from 'class-validator'
import { RecipientType } from '@votz/shared-types'

export class UpdateRecipientDto {
  @ApiProperty({ enum: RecipientType })
  @IsEnum(RecipientType)
  recipientType: RecipientType

  @ApiProperty()
  @IsUUID()
  recipientId: string
}
