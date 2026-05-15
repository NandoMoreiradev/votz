import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsString, MinLength, MaxLength } from 'class-validator'

export enum UpdatableStatus {
  UNDER_REVIEW = 'UNDER_REVIEW',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  ARCHIVED = 'ARCHIVED',
}

export class UpdateStatusDto {
  @ApiProperty({ enum: UpdatableStatus })
  @IsEnum(UpdatableStatus)
  status: UpdatableStatus

  @ApiProperty({ example: 'Team dispatched for repair next week' })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  content: string
}
