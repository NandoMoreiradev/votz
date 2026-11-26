import { IsArray, IsEnum, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator'
import { Transform } from 'class-transformer'
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
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string

  @ApiProperty({ enum: OrgPermission, isArray: true })
  @IsArray()
  @IsEnum(OrgPermission, { each: true })
  permissions: OrgPermission[]
}
