import { ApiProperty } from '@nestjs/swagger'
import { IsEnum } from 'class-validator'
import { VoteType } from '@votz/shared-types'

export class CastVoteDto {
  @ApiProperty({ enum: VoteType })
  @IsEnum(VoteType)
  type: VoteType
}
