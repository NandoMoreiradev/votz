import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator'
import { PageConversationStatus } from '@prisma/client'

export class PageMessageDto {
  @IsString()
  @MaxLength(2000)
  text!: string

  @IsOptional()
  @IsUUID()
  replyToId?: string
}

export class PageMediaDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  caption?: string

  @IsOptional()
  @IsUUID()
  replyToId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  width?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  height?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86_400_000)
  durationMs?: number

  @IsOptional()
  @IsString()
  @MaxLength(24_000)
  thumbnail?: string
}

export class PageStartDto {
  @IsUUID()
  citizenId!: string

  @IsString()
  @MaxLength(2000)
  text!: string
}

export class PageRespondDto {
  @IsBoolean()
  accept!: boolean
}

export class PageFollowersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string
}

export class PageStatusDto {
  @IsEnum(PageConversationStatus)
  status!: PageConversationStatus
}

export class PageListQueryDto {
  @IsOptional()
  @IsEnum(PageConversationStatus)
  status?: PageConversationStatus

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(500)
  page = 1
}
