// Request / response shapes for /posts, /feed and the profile grid (TRD §5.1, §10, BR-CT, BR-FD).
// One Post shape everywhere (feed card, post detail, create / edit result); full media URLs.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export const MAX_CAPTION = 2200;

export class CreatePostDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 10, description: 'POST uploads (POST /media/uploads). R1 posts take exactly one photo' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  mediaIds!: string[];

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: MAX_CAPTION })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(MAX_CAPTION)
  caption?: string | null;
}

export class UpdatePostDto {
  @ApiProperty({ nullable: true, type: String, maxLength: MAX_CAPTION, description: 'null or empty removes the caption' })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(MAX_CAPTION)
  caption!: string | null;
}

export class PostAuthor {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty({ nullable: true, type: String }) displayName!: string | null;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
}

export class PostMedia {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['IMAGE'] }) kind!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Placeholder while the image loads' }) blurhash!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Feed image (≤ 1080 wide); null until processed' }) url!: string | null;
  @ApiProperty({ nullable: true, type: String, description: '320 × 320' }) thumbUrl!: string | null;
  @ApiProperty({ nullable: true, type: Number, description: 'Of the feed image: reserve the aspect ratio' }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
}

export class Post {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['PROCESSING', 'PUBLISHED', 'FAILED'], description: 'Only the author ever sees PROCESSING or FAILED' }) status!: string;
  @ApiProperty({ nullable: true, type: String }) caption!: string | null;
  @ApiProperty() likeCount!: number;
  @ApiProperty() commentCount!: number;
  @ApiProperty() likedByMe!: boolean;
  @ApiProperty() isMine!: boolean;
  @ApiProperty({ type: PostAuthor }) author!: PostAuthor;
  @ApiProperty({ type: [PostMedia] }) media!: PostMedia[];
  @ApiProperty({ description: 'Opens the post in the app, else a landing page with store links' }) shareUrl!: string;
  @ApiProperty() createdAt!: string;
}

export class FeedPage {
  @ApiProperty({ type: [Post] }) items!: Post[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

export class GridItem {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['PROCESSING', 'PUBLISHED', 'FAILED', 'HIDDEN'], description: 'Your own grid only: PROCESSING, FAILED, and HIDDEN ("Removed for violating Community Guidelines")' })
  status!: string;
  @ApiProperty({ nullable: true, type: String }) thumbUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) blurhash!: string | null;
  @ApiProperty({ description: '> 1 shows the carousel badge' }) mediaCount!: number;
  @ApiProperty() createdAt!: string;
}

export class GridPage {
  @ApiProperty({ type: [GridItem] }) items!: GridItem[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}
