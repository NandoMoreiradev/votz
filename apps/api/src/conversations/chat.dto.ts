import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { Transform } from 'class-transformer'
export class ChatStorageListQueryDto {
  @IsOptional() @IsIn(['size', 'date']) sort?: 'size' | 'date'
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : Number(value)))
  @IsInt()
  @Min(0)
  skip?: number
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number
}
export class DeleteChatMediaDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids!: string[]
}
export class EnrollChatDeviceDto {
  @IsUUID() id!: string
  @IsString() @MinLength(48) @MaxLength(128) secret!: string
  @IsIn(['android', 'ios', 'web', 'test']) platform!: string
  // Nome mostrado na lista de aparelhos conectados. Texto simples, sem controles.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(/^[^\u0000-\u001f\u007f<>]*$/)
  label?: string
}
export class DecideChatDeviceLinkDto {
  @Transform(({ obj }) => obj.approve)
  @IsBoolean()
  approve!: boolean
}
export class ApproveChatDeviceCodeDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string
  @IsOptional()
  @IsUUID()
  linkId?: string
}
export class SendChatMessageDto {
  @IsInt() @Min(1) revision!: number
  @IsObject() content!: Record<string, unknown>
}
export class ChatPrivacyDto {
  @Transform(({ obj }) => obj.readReceiptsEnabled)
  @IsBoolean()
  readReceiptsEnabled!: boolean
}
export class ChatReceiptQueryDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(200, { each: true })
  eventIds!: string[]
}
export class ChatReceiptDto extends ChatReceiptQueryDto {
  @Transform(({ obj }) => obj.read)
  @IsBoolean()
  read!: boolean
}
export class ResetChatDevicesDto {
  @IsString() @MinLength(1) @MaxLength(200) password!: string
}
export class ChatPushTokenDto {
  @IsString()
  @MaxLength(255)
  @Matches(/^Expo(nent)?PushToken\[[A-Za-z0-9._-]{10,180}\]$/)
  token!: string
}
export class ChatTypingDto {
  @Transform(({ obj }) => obj.typing)
  @IsBoolean()
  typing!: boolean
}
export class ChatKeyVaultDto {
  @IsString()
  @MinLength(40)
  @MaxLength(5 * 1024 * 1024)
  vault!: string
}
