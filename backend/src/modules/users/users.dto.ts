// Request / response shapes for /me and /users (TRD §5.1, BR-PR-01..05). camelCase, full media
// URLs, never email (except your own), date of birth or hashes (API-09).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { USERNAME_PATTERN } from '../auth/auth.dto.js';

export class UpdateMeDto {
  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 50 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(50)
  displayName?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 160 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(160)
  bio?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(USERNAME_PATTERN, { message: 'username must be 3–30 letters, digits, "." or "_"' })
  username?: string;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'An AVATAR upload (POST /media/uploads); null removes the avatar' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  avatarMediaId?: string | null;

  @ApiPropertyOptional({ enum: ['en', 'sw'] })
  @IsOptional()
  @IsIn(['en', 'sw'])
  locale?: 'en' | 'sw';

  @ApiPropertyOptional({ description: 'Private account (BR-PR-06). Going public accepts every pending follow request' })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
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
  @ApiProperty({ description: 'You asked to follow this private account: the button reads Requested' }) followRequested!: boolean;
}

export class UserSearchResult {
  @ApiProperty({ type: [UserSummary] }) items!: UserSummary[];
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
  @ApiProperty({ description: 'A private account (BR-PR-06)' }) isPrivate!: boolean;
  @ApiProperty({ description: 'false: show "This account is private"; posts and lists come back empty (BR-PR-08)' }) canSeeContent!: boolean;
  @ApiProperty({ description: 'You asked to follow and are waiting: the button reads Requested' }) followRequested!: boolean;
  @ApiProperty({ description: 'People waiting for you to accept; only ever non-zero on your own profile' }) followRequestCount!: number;
  @ApiProperty({ description: '"Copy profile link": opens the profile in the app, else a landing page' }) shareUrl!: string;
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
  @ApiProperty({ description: 'A private account (BR-PR-06)' }) isPrivate!: boolean;
  @ApiProperty({ description: 'People waiting for you to accept (BR-PR-07)' }) followRequestCount!: number;
}

export class FollowState {
  @ApiProperty() following!: boolean;
  @ApiProperty({ description: 'A private account was asked rather than followed (BR-PR-07): the button reads Requested' }) requested!: boolean;
  @ApiProperty() followerCount!: number;
}

export class FollowRequest {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty({ nullable: true, type: String }) displayName!: string | null;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty({ description: 'You already follow them: hide "Follow back" once accepted' }) isFollowing!: boolean;
  @ApiProperty() requestedAt!: string;
}

export class FollowRequestPage {
  @ApiProperty({ type: [FollowRequest] }) items!: FollowRequest[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

export class FollowerCount {
  @ApiProperty() followerCount!: number;
}
