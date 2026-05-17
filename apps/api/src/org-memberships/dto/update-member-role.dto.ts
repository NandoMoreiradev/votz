import { IsUUID } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class UpdateMemberRoleDto {
  @ApiProperty()
  @IsUUID()
  roleId: string
}
