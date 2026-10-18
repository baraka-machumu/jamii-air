// Request / response shapes for likes and comments (TRD §5.1, BR-FD-03..05).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PostAuthor } from '../posts/posts.dto.js';

export const MAX_COMMENT = 1000;

export class CreateCommentDto {
  @ApiProperty({ minLength: 1, maxLength: MAX_COMMENT })
  @IsString()
  @MaxLength(MAX_COMMENT)
  @Matches(/\S/, { message: 'body must not be blank' })
  body!: string;

  @ApiPropertyOptional({
    description: 'The comment being answered (BR-FD-08). Replies are one level deep: passing a reply answers its parent instead (BR-FD-09)',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class LikeState {
  @ApiProperty() liked!: boolean;
  @ApiProperty() likeCount!: number;
}

export class Comment {
  @ApiProperty() id!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ type: PostAuthor }) author!: PostAuthor;
  @ApiProperty({ description: 'You wrote it or own the post' }) canDelete!: boolean;
  @ApiProperty({ description: "Visible replies under this comment. It ignores the viewer's blocks, so the thread can open shorter than this" })
  replyCount!: number;
  @ApiProperty() createdAt!: string;
}

/** A reply never has replies of its own (BR-FD-09), so it carries no replyCount. */
export class Reply {
  @ApiProperty() id!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ type: PostAuthor }) author!: PostAuthor;
  @ApiProperty({ description: 'You wrote it or own the post' }) canDelete!: boolean;
  @ApiProperty() createdAt!: string;
}

export class ReplyPage {
  @ApiProperty({ type: [Reply], description: 'OLDEST first — a thread reads as a conversation — and pages forwards' })
  items!: Reply[];

  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

export class CommentPage {
  @ApiProperty({ type: [Comment], description: 'Newest first; the app shows them oldest → newest and loads older pages on scroll up' })
  items!: Comment[];

  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

export class CreatedComment {
  @ApiProperty() id!: string;
  @ApiProperty() postId!: string;
  @ApiProperty({ nullable: true, type: String, description: 'The comment this answers; null for a top-level comment' })
  parentId!: string | null;

  @ApiProperty() body!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ description: "The post's new comment count, replies included" }) commentCount!: number;
  @ApiProperty({ description: "On a reply, the parent's new replyCount; 0 otherwise" }) parentReplyCount!: number;
}

export class DeletedComment {
  @ApiProperty() deleted!: boolean;
  @ApiProperty({ description: 'Replies are counted too, and deleting a comment deletes its thread' }) commentCount!: number;
  @ApiProperty({ description: "On a reply, the parent's new replyCount; 0 otherwise" }) parentReplyCount!: number;
}
