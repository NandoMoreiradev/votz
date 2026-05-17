import { IsEmail, IsEnum, IsUUID } from 'class-validator'
import { OrgType } from '@prisma/client'
import { ApiProperty } from '@nestjs/swagger'

export class InviteMemberDto {
  @ApiProperty({ enum: OrgType })
  @IsEnum(OrgType)
  orgType: OrgType

  @ApiProperty()
  @IsUUID()
  orgId: string

  @ApiProperty()
  @IsEmail()
  email: string

  @ApiProperty()
  @IsUUID()
  roleId: string
}
