import { IsEmail, IsEnum, IsUUID } from 'class-validator'
import { Transform } from 'class-transformer'
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
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string

  @ApiProperty()
  @IsUUID()
  roleId: string
}
