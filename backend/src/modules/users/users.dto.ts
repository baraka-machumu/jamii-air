// Request / response shapes for /me and /users (TRD §5.1, BR-PR-01..05). camelCase, full media
// URLs, never email (except your own), date of birth or hashes (API-09).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { USERNAME_PATTERN } from '../auth/auth.dto.js';

export class UpdateMeDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 50 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(50)
  displayName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 160 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(160)
  bio?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(USERNAME_PATTERN, { message: 'username must be 3–30 letters, digits, "." or "_"' })
  username?: string;

  @ApiPropertyOptional({ nullable: true, description: 'An AVATAR upload (POST /media/uploads); null removes the avatar' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  avatarMediaId?: string | null;

  @ApiPropertyOptional({ enum: ['en', 'sw'] })
  @IsOptional()
  @IsIn(['en', 'sw'])
  locale?: 'en' | 'sw';
}

export class SearchQuery {
  @ApiPropertyOptional({ description: 'Username or display name; empty = newest users' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  q?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class PageQuery {
  @ApiPropertyOptional({ description: 'nextCursor of the previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class UserSummary {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty({ nullable: true, type: String }) displayName!: string | null;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty() isFollowing!: boolean;
}

export class FollowListItem extends UserSummary {
  @ApiProperty() isMe!: boolean;
  @ApiProperty() followedAt!: string;
}

export class FollowListPage {
  @ApiProperty({ type: [FollowListItem] }) items!: FollowListItem[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

export class Profile {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty({ nullable: true, type: String }) displayName!: string | null;
  @ApiProperty({ nullable: true, type: String }) bio!: string | null;
  @ApiProperty({ nullable: true, type: String, description: '150 px' }) avatarUrl!: string | null;
  @ApiProperty({ nullable: true, type: String, description: '320 px' }) avatarLargeUrl!: string | null;
  @ApiProperty() postCount!: number;
  @ApiProperty() followerCount!: number;
  @ApiProperty() followingCount!: number;
  @ApiProperty() isMe!: boolean;
  @ApiProperty() isFollowing!: boolean;
  @ApiProperty() followsMe!: boolean;
  @ApiProperty({ description: 'You blocked this user: show Unblock; posts and lists stay empty' }) isBlockedByMe!: boolean;
  @ApiProperty() createdAt!: string;
}

export class Me {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ nullable: true, type: String }) displayName!: string | null;
  @ApiProperty({ nullable: true, type: String }) bio!: string | null;
  @ApiProperty({ nullable: true, type: String }) avatarMediaId!: string | null;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) avatarLargeUrl!: string | null;
  @ApiProperty({ enum: ['en', 'sw'] }) locale!: string;
  @ApiProperty() postCount!: number;
  @ApiProperty() followerCount!: number;
  @ApiProperty() followingCount!: number;
}

export class FollowState {
  @ApiProperty() following!: boolean;
  @ApiProperty() followerCount!: number;
}
