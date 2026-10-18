// Request / response shapes for the Activity tab and push registration (TRD §5.1, BR-NT-01..04).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class MarkReadDto {
  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids?: string[];

  @ApiPropertyOptional({ description: 'Mark every notification read (Activity tab opened)' })
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}

/** expo-notifications getExpoPushTokenAsync(): `ExponentPushToken[…]` (older: `ExpoPushToken[…]`). */
export const EXPO_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/;
export const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export class RegisterDeviceDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @Matches(EXPO_TOKEN_PATTERN, { message: 'token must be an Expo push token' })
  token!: string;

  @ApiProperty({ enum: ['ANDROID', 'IOS'] })
  @IsIn(['ANDROID', 'IOS'])
  platform!: 'ANDROID' | 'IOS';

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  appVersion?: string;

  @ApiPropertyOptional({ enum: ['en', 'sw'], description: 'The app language on this phone: push text uses it' })
  @IsOptional()
  @IsIn(['en', 'sw'])
  locale?: 'en' | 'sw';
}

export class NotificationActor {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty({ nullable: true, type: String }) displayName!: string | null;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty({ description: 'Hide "Follow back" when true' }) isFollowing!: boolean;
}

export class Notification {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['FOLLOW', 'LIKE', 'COMMENT', 'REPLY'], description: 'REPLY: someone answered your comment (BR-FD-08). Its commentId is the reply' }) type!: string;
  @ApiProperty({ type: NotificationActor }) actor!: NotificationActor;
  @ApiProperty({ nullable: true, type: String }) postId!: string | null;
  @ApiProperty({ nullable: true, type: String, description: '320 × 320; null when the post is gone' }) postThumbUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) commentId!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'First 100 characters of the comment' }) commentExcerpt!: string | null;
  @ApiProperty({ description: 'false: the post or comment was deleted or hidden ("no longer available")' }) targetAvailable!: boolean;
  @ApiProperty() read!: boolean;
  @ApiProperty() createdAt!: string;
}

export class NotificationPage {
  @ApiProperty({ type: [Notification] }) items!: Notification[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

export class UnreadCount {
  @ApiProperty({ maximum: 100, description: 'Capped at 100: show "99+"' }) count!: number;
}

export class MarkReadResult {
  @ApiProperty() updated!: number;
}
