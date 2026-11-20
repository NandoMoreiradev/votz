import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator'
import { PageConversationStatus } from '@prisma/client'

export class PageMessageDto {
  @ApiProperty({ example: 'Boa tarde! A rua do meu bairro está sem iluminação.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string
}

export class PageStartDto {
  @ApiProperty()
  @IsUUID()
  citizenId: string

  @ApiProperty({ example: 'Olá! Queríamos falar sobre o seu relato.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string
}

export class PageRespondDto {
  @ApiProperty()
  @IsBoolean()
  accept: boolean
}

export class PageFollowersQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string
}

export class PageListQueryDto {
  @ApiPropertyOptional({ enum: PageConversationStatus })
  @IsOptional()
  @IsEnum(PageConversationStatus)
  status?: PageConversationStatus

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number
}

export class PageStatusDto {
  @ApiProperty({ enum: PageConversationStatus })
  @IsEnum(PageConversationStatus)
  status: PageConversationStatus
}
