import { IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'
import { OrgPermission } from '@prisma/client'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string

  @ApiPropertyOptional({ enum: OrgPermission, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(OrgPermission, { each: true })
  permissions?: OrgPermission[]
}
