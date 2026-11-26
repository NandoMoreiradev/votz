import { IsIn } from 'class-validator'
import { MembershipStatus } from '@prisma/client'
import { ApiProperty } from '@nestjs/swagger'

export class UpdateMemberStatusDto {
  @ApiProperty({ enum: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED] })
  @IsIn([MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED])
  status: MembershipStatus
}
