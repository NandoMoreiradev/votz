import { IsArray, IsEnum, IsString, IsUUID, MaxLength } from 'class-validator'
import { OrgPermission, OrgType } from '@prisma/client'
import { ApiProperty } from '@nestjs/swagger'

export class CreateRoleDto {
  @ApiProperty({ enum: OrgType })
  @IsEnum(OrgType)
  orgType: OrgType

  @ApiProperty()
  @IsUUID()
  orgId: string

  @ApiProperty()
  @IsString()
  @MaxLength(60)
  name: string

  @ApiProperty({ enum: OrgPermission, isArray: true })
  @IsArray()
  @IsEnum(OrgPermission, { each: true })
  permissions: OrgPermission[]
}
