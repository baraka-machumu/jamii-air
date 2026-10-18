// Request / response shapes for /posts, /feed and the profile grid (TRD §5.1, §10, BR-CT, BR-FD).
// One Post shape everywhere (feed card, post detail, create / edit result); full media URLs.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export const MAX_CAPTION = 2200;

export const MAX_POST_MEDIA = 10;

export class CreatePostDto {
  @ApiProperty({
    type: [String], minItems: 1, maxItems: MAX_POST_MEDIA,
    description: 'POST uploads (POST /media/uploads), in the order they should appear: 1-10 photos as a carousel, or exactly one video. A post never mixes the two (BR-CT-09/10)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_POST_MEDIA)
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
  @ApiProperty({ enum: ['IMAGE', 'VIDEO'] }) kind!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Placeholder while the image or poster loads' }) blurhash!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'What to show: the feed image (≤ 1080 wide) for IMAGE, the 720p MP4 for VIDEO. Null until processed' }) url!: string | null;
  @ApiProperty({ nullable: true, type: String, description: '320 × 320' }) thumbUrl!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'VIDEO only: the still to show before playback (BR-CT-08)' }) posterUrl!: string | null;
  @ApiProperty({ nullable: true, type: Number, description: 'VIDEO only: length in milliseconds (≤ 60 s)' }) durationMs!: number | null;
  @ApiProperty({ nullable: true, type: Number, description: 'Of the image or video: reserve the aspect ratio' }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
}

/**
 * A post as every screen sees it. The caption's hashtags are deliberately NOT a field: the app
 * has to find them inside the caption text to make them tappable anyway, so it applies the same
 * rule the server stores by (BR-FD-10, fn__sync_post_hashtags) rather than reconciling two lists.
 */
export class Post {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['PROCESSING', 'PUBLISHED', 'FAILED'], description: 'Only the author ever sees PROCESSING or FAILED' }) status!: string;
  @ApiProperty({ enum: ['PHOTO', 'VIDEO'], description: 'PHOTO covers one photo and a carousel; media.length says which' }) type!: string;
  @ApiProperty({ nullable: true, type: String }) caption!: string | null;
  @ApiProperty() likeCount!: number;
  @ApiProperty() commentCount!: number;
  @ApiProperty() likedByMe!: boolean;
  @ApiProperty() isMine!: boolean;
  @ApiProperty({ type: PostAuthor }) author!: PostAuthor;
  @ApiProperty({ type: [PostMedia], description: 'In carousel order' }) media!: PostMedia[];
  @ApiProperty({ description: 'Opens the post in the app, else a landing page with store links' }) shareUrl!: string;
  @ApiProperty() createdAt!: string;
}

export class FeedPage {
  @ApiProperty({ type: [Post] }) items!: Post[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

export class GridItem {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['PHOTO', 'VIDEO'], description: 'VIDEO shows a play badge on the tile' }) type!: string;
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

export class TagPage {
  @ApiProperty({ description: 'The tag as stored: lower case, without the "#"' }) tag!: string;
  @ApiProperty({ description: "Published posts on this tag, before the viewer's own blocks" }) postCount!: number;
  @ApiProperty({ type: [GridItem] }) items!: GridItem[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}
