-- R1 scope change 2026-10-16 (BRS §6.1): video posts, multi-photo carousels, one level of
-- comment replies, and hashtags. The enum values these need were added by the previous
-- migration, because Postgres will not let a value added by ALTER TYPE ... ADD VALUE be used
-- in the transaction that added it.

-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "parent_id" UUID,
ADD COLUMN     "reply_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "hashtags" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tag" CITEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hashtags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_hashtags" (
    "post_id" UUID NOT NULL,
    "hashtag_id" UUID NOT NULL,

    CONSTRAINT "post_hashtags_pkey" PRIMARY KEY ("post_id","hashtag_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hashtags_tag_key" ON "hashtags"("tag");

-- CreateIndex
CREATE INDEX "post_hashtags_hashtag_id_post_id_idx" ON "post_hashtags"("hashtag_id", "post_id" DESC);

-- CreateIndex
CREATE INDEX "comments_parent_id_created_at_id_idx" ON "comments"("parent_id", "created_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_hashtags" ADD CONSTRAINT "post_hashtags_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_hashtags" ADD CONSTRAINT "post_hashtags_hashtag_id_fkey" FOREIGN KEY ("hashtag_id") REFERENCES "hashtags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Constraints and indexes (Schema §5, §9; raw SQL) ─────────────

-- MD-01 is now per kind: images stay at JPEG/PNG/HEIC/WebP up to 15 MB; video is MP4 or
-- QuickTime up to 150 MB, which covers 60 s from a mid-range phone before the worker re-encodes
-- it to a single 720p rendition. Written with kind::text so the planner never has to resolve the
-- enum label 'VIDEO' that the previous migration added.
ALTER TABLE media_assets DROP CONSTRAINT media_assets_mime;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_mime CHECK (
  CASE kind::text
    WHEN 'IMAGE' THEN mime_type IN ('image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp')
    WHEN 'VIDEO' THEN mime_type IN ('video/mp4', 'video/quicktime')
    ELSE false
  END);

ALTER TABLE media_assets DROP CONSTRAINT media_assets_byte_size;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_byte_size CHECK (
  byte_size BETWEEN 1 AND CASE kind::text WHEN 'VIDEO' THEN 157286400 ELSE 15728640 END);

-- Only video has a duration, and BR-CT-07 caps it at 60 s. The 65 s ceiling is that cap plus
-- room for container rounding; the worker rejects anything over 61 s with a reason.
ALTER TABLE media_assets ADD CONSTRAINT media_assets_duration CHECK (
  duration_ms IS NULL OR (kind::text = 'VIDEO' AND duration_ms BETWEEN 1 AND 65000));

-- A video post is exactly one video, a photo post is 1-10 photos (BR-CT-10); fn_create_post
-- enforces the mix, these CHECKs guard the shape of a single row.
ALTER TABLE media_assets ADD CONSTRAINT media_assets_video_is_post CHECK (
  kind::text <> 'VIDEO' OR purpose::text = 'POST');

-- Replies are one level deep (BR-FD-09): a row with a parent never has replies of its own, and
-- no comment is its own parent. "A reply's parent is itself top-level" cannot be a CHECK (it
-- reads another row), so fn_add_comment re-points a reply-to-a-reply at its parent instead.
ALTER TABLE comments ADD CONSTRAINT comments_reply_count_nonneg CHECK (reply_count >= 0);
ALTER TABLE comments ADD CONSTRAINT comments_replies_are_flat CHECK (parent_id IS NULL OR reply_count = 0);
ALTER TABLE comments ADD CONSTRAINT comments_parent_not_self CHECK (parent_id IS DISTINCT FROM id);

-- BR-FD-10: tags are stored without the '#', 1-64 of letters, digits and underscore.
ALTER TABLE hashtags ADD CONSTRAINT hashtags_tag_format CHECK (tag ~ '^[[:alnum:]_]{1,64}$');

-- The thread under one comment, and the count of visible replies, both skip hidden and deleted
-- rows; a partial index keeps that the cheap path.
CREATE INDEX comments_visible_parent_idx ON comments (parent_id, created_at DESC, id DESC)
  WHERE parent_id IS NOT NULL AND deleted_at IS NULL AND hidden_at IS NULL;
-- Top-level comments of a post, newest first (fn_get_post_comments).
CREATE INDEX comments_visible_toplevel_idx ON comments (post_id, created_at DESC, id DESC)
  WHERE parent_id IS NULL AND deleted_at IS NULL AND hidden_at IS NULL;
