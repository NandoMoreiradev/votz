import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { Transform } from 'class-transformer'
import { OrgPermission } from '@prisma/client'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string

  @ApiPropertyOptional({ enum: OrgPermission, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(OrgPermission, { each: true })
  permissions?: OrgPermission[]
}
