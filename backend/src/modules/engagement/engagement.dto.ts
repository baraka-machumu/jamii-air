// Request / response shapes for likes and comments (TRD §5.1, BR-FD-03..05).
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import { PostAuthor } from '../posts/posts.dto.js';

export const MAX_COMMENT = 1000;

export class CreateCommentDto {
  @ApiProperty({ minLength: 1, maxLength: MAX_COMMENT })
  @IsString()
  @MaxLength(MAX_COMMENT)
  @Matches(/\S/, { message: 'body must not be blank' })
  body!: string;
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
  @ApiProperty() createdAt!: string;
}

export class CommentPage {
  @ApiProperty({ type: [Comment], description: 'Newest first; the app shows them oldest → newest and loads older pages on scroll up' })
  items!: Comment[];

  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

export class CreatedComment {
  @ApiProperty() id!: string;
  @ApiProperty() postId!: string;
  @ApiProperty() body!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ description: "The post's new comment count" }) commentCount!: number;
}

export class DeletedComment {
  @ApiProperty() deleted!: boolean;
  @ApiProperty() commentCount!: number;
}
