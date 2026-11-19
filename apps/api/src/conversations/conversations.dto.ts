import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

export class DirectConversationDto {
  @IsUUID() targetUserId!: string
}
export class GroupConversationDto {
  @IsUUID() clientRequestId!: string
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().normalize('NFC') : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[^\u0000-\u001f\u007f]+$/u)
  title!: string
  @IsArray()
  @ArrayUnique()
  @ArrayMinSize(1)
  @ArrayMaxSize(99)
  @IsUUID('all', { each: true })
  memberIds!: string[]
}
export class InviteConversationDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  memberIds!: string[]
}
export class RespondConversationDto {
  // Global implicit conversion turns the string "false" into true. Require a JSON boolean.
  @Transform(({ obj }) => obj.accept)
  @IsBoolean()
  accept!: boolean
}
export class RoleConversationDto {
  @IsIn(['ADMIN', 'MEMBER']) role!: 'ADMIN' | 'MEMBER'
}
export class ConversationPaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20
}
export class ConversationListDto extends ConversationPaginationDto {
  @IsOptional() @IsIn(['active', 'requests']) folder: 'active' | 'requests' = 'active'
}
export class ConversationContactsDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().normalize('NFC') : value))
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  q!: string
}
export class MuteConversationDto {
  @IsIn(['8h', '1w', 'forever', 'off'])
  duration!: '8h' | '1w' | 'forever' | 'off'
}
export class PinConversationDto {
  @Transform(({ obj }) => obj.pinned)
  @IsBoolean()
  pinned!: boolean
}
export class ReportConversationDto {
  @IsIn(['OFFENSIVE', 'SPAM_OR_ADS', 'SEXUAL_OR_VIOLENT', 'FAKE_PROFILE', 'PERSONAL_DATA', 'OTHER'])
  reason!: 'OFFENSIVE' | 'SPAM_OR_ADS' | 'SEXUAL_OR_VIOLENT' | 'FAKE_PROFILE' | 'PERSONAL_DATA' | 'OTHER'

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().normalize('NFC') : value))
  @IsString()
  @MaxLength(500)
  details?: string
}
export class UpdateConversationSettingsDto {
  @IsOptional()
  @Transform(({ obj }) => obj.readReceiptsEnabled)
  @IsBoolean()
  readReceiptsEnabled?: boolean

  @IsOptional()
  @IsIn(['EVERYONE', 'CONTACTS', 'NOBODY'])
  lastSeenVisibility?: 'EVERYONE' | 'CONTACTS' | 'NOBODY'

  @IsOptional()
  @IsIn(['EVERYONE', 'CONTACTS', 'NOBODY'])
  groupInvitePolicy?: 'EVERYONE' | 'CONTACTS' | 'NOBODY'

  @IsOptional()
  @IsIn(['EVERYONE', 'NOBODY'])
  directRequestPolicy?: 'EVERYONE' | 'NOBODY'

  @IsOptional()
  @Transform(({ obj }) => obj.notifySound)
  @IsBoolean()
  notifySound?: boolean

  @IsOptional()
  @Transform(({ obj }) => obj.notifyVibration)
  @IsBoolean()
  notifyVibration?: boolean

  @IsOptional()
  @Transform(({ obj }) => obj.notifyPreview)
  @IsBoolean()
  notifyPreview?: boolean

  @IsOptional()
  @Transform(({ obj }) => obj.securityAlertsEnabled)
  @IsBoolean()
  securityAlertsEnabled?: boolean

  @IsOptional()
  @Transform(({ obj }) => obj.keyBackupEnabled)
  @IsBoolean()
  keyBackupEnabled?: boolean

  @IsOptional()
  @IsIn(['WIFI_ONLY', 'ALWAYS', 'NEVER'])
  mediaAutoDownload?: 'WIFI_ONLY' | 'ALWAYS' | 'NEVER'

  @IsOptional()
  @IsIn(['SMALL', 'MEDIUM', 'LARGE'])
  fontScale?: 'SMALL' | 'MEDIUM' | 'LARGE'

  @IsOptional()
  @IsIn(['DEFAULT', 'SOFT', 'PLAIN'])
  wallpaper?: 'DEFAULT' | 'SOFT' | 'PLAIN'
}
