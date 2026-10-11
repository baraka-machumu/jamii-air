-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "owner_id" UUID NOT NULL,
    "kind" "media_kind" NOT NULL,
    "purpose" "media_purpose" NOT NULL,
    "status" "media_status" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "original_key" TEXT NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "blurhash" VARCHAR(64),
    "failure_reason" VARCHAR(255),
    "processed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_variants" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "media_id" UUID NOT NULL,
    "variant" "media_variant_type" NOT NULL,
    "object_key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "author_id" UUID NOT NULL,
    "type" "post_type" NOT NULL DEFAULT 'PHOTO',
    "caption" VARCHAR(2200),
    "status" "post_status" NOT NULL DEFAULT 'PROCESSING',
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ,
    "hidden_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_media" (
    "post_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "post_media_pkey" PRIMARY KEY ("post_id","position")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "user_id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "route" VARCHAR(100) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("user_id","key")
);

-- CreateTable
CREATE TABLE "pending_object_deletions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "object_key" TEXT NOT NULL,
    "is_prefix" BOOLEAN NOT NULL DEFAULT false,
    "claimed_at" TIMESTAMPTZ,
    "done_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_object_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_original_key_key" ON "media_assets"("original_key");

-- CreateIndex
CREATE INDEX "media_assets_owner_id_created_at_idx" ON "media_assets"("owner_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "media_assets_status_updated_at_idx" ON "media_assets"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_variants_object_key_key" ON "media_variants"("object_key");

-- CreateIndex
CREATE UNIQUE INDEX "media_variants_media_id_variant_key" ON "media_variants"("media_id", "variant");

-- CreateIndex
CREATE INDEX "posts_author_id_created_at_id_idx" ON "posts"("author_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "posts_status_updated_at_idx" ON "posts"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "post_media_media_id_key" ON "post_media"("media_id");

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- CreateIndex
CREATE INDEX "pending_object_deletions_done_at_created_at_idx" ON "pending_object_deletions"("done_at", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_media_id_fkey" FOREIGN KEY ("avatar_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Constraints, indexes, triggers, grants (Schema §5, §9, §10; raw SQL) ─────────────

-- MD-01: JPEG, PNG, HEIC/HEIF, WebP up to 15 MB.
ALTER TABLE media_assets ADD CONSTRAINT media_assets_mime CHECK (
  mime_type IN ('image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'));
ALTER TABLE media_assets ADD CONSTRAINT media_assets_byte_size CHECK (byte_size BETWEEN 1 AND 15728640);
ALTER TABLE media_assets ADD CONSTRAINT media_assets_dimensions CHECK (
  (width IS NULL OR width > 0) AND (height IS NULL OR height > 0));
-- MD-06 / Schema §10: object keys are built server-side and follow one layout.
ALTER TABLE media_assets ADD CONSTRAINT media_assets_original_key CHECK (
  original_key = 'users/' || owner_id || '/media/' || id || '/original');
ALTER TABLE media_variants ADD CONSTRAINT media_variants_sizes CHECK (width > 0 AND height > 0 AND byte_size > 0);

ALTER TABLE posts ADD CONSTRAINT posts_counts_nonneg CHECK (like_count >= 0 AND comment_count >= 0);
ALTER TABLE posts ADD CONSTRAINT posts_status_dates CHECK (
  (status <> 'PUBLISHED' OR published_at IS NOT NULL) AND
  (status <> 'HIDDEN'    OR hidden_at IS NOT NULL) AND
  (status <> 'DELETED'   OR deleted_at IS NOT NULL));
ALTER TABLE post_media ADD CONSTRAINT post_media_position CHECK (position BETWEEN 0 AND 9);

ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_hash_format CHECK (request_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE pending_object_deletions ADD CONSTRAINT pending_object_deletions_key CHECK (
  object_key LIKE 'users/%' AND (NOT is_prefix OR object_key LIKE '%/'));

-- Hot paths: other people's grids and the home feed see PUBLISHED posts only.
CREATE INDEX posts_published_author_created_idx
  ON posts (author_id, created_at DESC, id DESC) WHERE status = 'PUBLISHED';
-- Object-deletion queue: unfinished rows in arrival order.
CREATE INDEX pending_object_deletions_open_idx ON pending_object_deletions (created_at) WHERE done_at IS NULL;

CREATE TRIGGER media_assets_touch_updated_at BEFORE UPDATE ON media_assets
  FOR EACH ROW EXECUTE FUNCTION fn__touch_updated_at();
CREATE TRIGGER posts_touch_updated_at BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION fn__touch_updated_at();

-- Simple Prisma read (GET /media/:id, owner checks in the API).
GRANT SELECT (id, owner_id, kind, purpose, status, width, height, blurhash, failure_reason, created_at)
  ON media_assets TO jamii_app;

-- @function _common/fn__assert_post_visible.sql
-- Returns the author of a post the viewer may see and interact with: PUBLISHED, author ACTIVE,
-- no block either way. Anything else raises JA404 POST_NOT_FOUND (AU-08).
CREATE OR REPLACE FUNCTION fn__assert_post_visible(p_viewer_id uuid, p_post_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_author_id uuid;
BEGIN
  SELECT p.author_id INTO v_author_id
  FROM posts p JOIN users u ON u.id = p.author_id
  WHERE p.id = p_post_id AND p.status = 'PUBLISHED' AND u.status = 'ACTIVE';

  IF NOT FOUND OR fn__is_blocked_either_way(p_viewer_id, v_author_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'POST_NOT_FOUND';
  END IF;
  RETURN v_author_id;
END $$;
-- @end-function

-- @function _common/fn__queue_media_deletion.sql
-- Marks media assets DELETED and queues their object prefixes (original + every variant) for the
-- worker (Schema §10: deletions flow through pending_object_deletions). Returns the rows queued.
CREATE OR REPLACE FUNCTION fn__queue_media_deletion(p_media_ids uuid[])
RETURNS int
LANGUAGE plpgsql VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE media_assets m SET status = 'DELETED' WHERE m.id = ANY (p_media_ids) AND m.status <> 'DELETED';

  INSERT INTO pending_object_deletions (object_key, is_prefix)
  SELECT 'users/' || m.owner_id || '/media/' || m.id || '/', true
  FROM media_assets m WHERE m.id = ANY (p_media_ids);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END $$;
-- @end-function

-- @function _common/fn__resolve_profile.sql
-- Resolves a username for a profile read (AU-08). Raises JA404 USER_NOT_FOUND when the user does
-- not exist, is not ACTIVE, or has blocked the viewer. blocked_by_me tells the caller the viewer
-- blocked the target: the profile header stays visible (to unblock), its content does not.
CREATE OR REPLACE FUNCTION fn__resolve_profile(
  p_viewer_id uuid,
  p_username  text,
  OUT target_id     uuid,
  OUT blocked_by_me boolean)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  SELECT u.id INTO target_id
  FROM users u
  WHERE u.username = btrim(p_username)::citext
    AND u.status = 'ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = u.id AND b.blocked_id = p_viewer_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;

  blocked_by_me := EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = p_viewer_id AND b.blocked_id = target_id);
END $$;
-- @end-function

-- @function media/fn_complete_media_processing.sql
-- Media worker, after sharp produced the variants (TRD §9). Stores the variants, marks the asset
-- READY and publishes its post once every media item of the post is READY (post_count + 1).
-- p_variants: [{ "variant": "FEED", "objectKey": "...", "width": 1080, "height": 1350,
--                "mimeType": "image/webp", "byteSize": 123456 }, ...]
-- Safe to retry: a READY asset returns post_published = false. If the post was deleted while
-- processing, the variants just written are queued for deletion and nothing is published.
CREATE OR REPLACE FUNCTION fn_complete_media_processing(
  p_media_id uuid,
  p_width    int,
  p_height   int,
  p_blurhash text,
  p_variants jsonb)
RETURNS TABLE (post_id uuid, post_published boolean, author_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  m         media_assets%ROWTYPE;
  v_post_id uuid;
  v_prefix  text;
  v_rows    int;
BEGIN
  SELECT * INTO m FROM media_assets a WHERE a.id = p_media_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'MEDIA_NOT_FOUND';
  END IF;

  SELECT pm.post_id INTO v_post_id FROM post_media pm WHERE pm.media_id = p_media_id;

  IF m.status = 'DELETED' THEN
    PERFORM fn__queue_media_deletion(ARRAY[p_media_id]);
    RETURN QUERY SELECT v_post_id, false, m.owner_id; RETURN;
  ELSIF m.status = 'READY' THEN
    RETURN QUERY SELECT v_post_id, false, m.owner_id; RETURN;
  ELSIF m.status NOT IN ('UPLOADED', 'PROCESSING') THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
  END IF;

  v_prefix := 'users/' || m.owner_id || '/media/' || m.id || '/';
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_variants) v WHERE NOT starts_with(v->>'objectKey', v_prefix)) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'INVALID_VARIANT_KEY';
  END IF;

  INSERT INTO media_variants (media_id, variant, object_key, width, height, mime_type, byte_size)
  SELECT p_media_id, v.variant::media_variant_type, v."objectKey", v.width, v.height, v."mimeType", v."byteSize"
  FROM jsonb_to_recordset(p_variants)
    AS v(variant text, "objectKey" text, width int, height int, "mimeType" text, "byteSize" int)
  ON CONFLICT (media_id, variant) DO UPDATE
    SET object_key = EXCLUDED.object_key, width = EXCLUDED.width, height = EXCLUDED.height,
        mime_type = EXCLUDED.mime_type, byte_size = EXCLUDED.byte_size;

  UPDATE media_assets a
  SET status = 'READY', width = p_width, height = p_height, blurhash = p_blurhash,
      failure_reason = NULL, processed_at = now()
  WHERE a.id = p_media_id;

  IF v_post_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, false, m.owner_id; RETURN;
  END IF;

  UPDATE posts p SET status = 'PUBLISHED', published_at = now()
  WHERE p.id = v_post_id AND p.status = 'PROCESSING'
    AND NOT EXISTS (SELECT 1 FROM post_media pm JOIN media_assets a ON a.id = pm.media_id
                    WHERE pm.post_id = v_post_id AND a.status <> 'READY');
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    UPDATE users u SET post_count = u.post_count + 1 WHERE u.id = m.owner_id;
  END IF;

  RETURN QUERY SELECT v_post_id, v_rows = 1, m.owner_id;
END $$;
-- @end-function

-- @function media/fn_create_upload_intent.sql
-- POST /media/uploads (TRD §9, MD-01/06). Creates the PENDING_UPLOAD asset and builds its object
-- key in SQL; Node presigns a PUT to that key. Type and size limits are CHECK constraints.
CREATE OR REPLACE FUNCTION fn_create_upload_intent(
  p_viewer_id uuid,
  p_kind      media_kind,
  p_purpose   media_purpose,
  p_mime_type text,
  p_byte_size bigint)
RETURNS TABLE (media_id uuid, original_key text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_id  uuid := uuidv7();
  v_key text := 'users/' || p_viewer_id || '/media/' || v_id || '/original';
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  INSERT INTO media_assets (id, owner_id, kind, purpose, original_key, mime_type, byte_size)
  VALUES (v_id, p_viewer_id, p_kind, p_purpose, v_key, lower(p_mime_type), p_byte_size);

  RETURN QUERY SELECT v_id, v_key;
END $$;
-- @end-function

-- @function media/fn_fail_media_processing.sql
-- Media worker, when the decoded file is not a valid image or processing gave up (MD-03):
-- asset FAILED, and its post (if still PROCESSING) FAILED. Returns who to tell.
CREATE OR REPLACE FUNCTION fn_fail_media_processing(p_media_id uuid, p_reason text)
RETURNS TABLE (post_id uuid, author_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  m         media_assets%ROWTYPE;
  v_post_id uuid;
BEGIN
  SELECT * INTO m FROM media_assets a WHERE a.id = p_media_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'MEDIA_NOT_FOUND';
  END IF;

  SELECT pm.post_id INTO v_post_id FROM post_media pm WHERE pm.media_id = p_media_id;

  IF m.status IN ('PENDING_UPLOAD', 'UPLOADED', 'PROCESSING') THEN
    UPDATE media_assets a SET status = 'FAILED', failure_reason = left(p_reason, 255) WHERE a.id = p_media_id;
    UPDATE posts p SET status = 'FAILED' WHERE p.id = v_post_id AND p.status = 'PROCESSING';
  END IF;

  RETURN QUERY SELECT v_post_id, m.owner_id;
END $$;
-- @end-function

-- @function posts/fn_create_post.sql
-- POST /posts (BR-CT-01, TRD §9, API-08). Creates the post as PROCESSING with its media; the API
-- enqueues media_to_process after commit. R1 posts have exactly one photo (carousel: R1.1).
-- Idempotency-Key: a repeat with the same key and request hash returns the original post
-- (replayed = true, nothing to process); the same key with a different request is JA409.
CREATE OR REPLACE FUNCTION fn_create_post(
  p_viewer_id       uuid,
  p_media_ids       uuid[],
  p_caption         text,
  p_idempotency_key text,
  p_request_hash    text)
RETURNS TABLE (
  post_id uuid, status post_status, caption varchar, created_at timestamptz,
  media_to_process uuid[], replayed boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c_route   constant text := 'POST /posts';
  v_key     idempotency_keys%ROWTYPE;
  v_rows    int;
  v_post_id uuid;
  v_caption text := NULLIF(btrim(p_caption), '');
  v_media   record;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO idempotency_keys (user_id, key, route, request_hash, response_body)
    VALUES (p_viewer_id, p_idempotency_key, c_route, p_request_hash, '{}')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      SELECT * INTO v_key FROM idempotency_keys k WHERE k.user_id = p_viewer_id AND k.key = p_idempotency_key;
      IF v_key.route <> c_route OR v_key.request_hash <> p_request_hash THEN
        RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'IDEMPOTENCY_KEY_REUSED';
      END IF;
      RETURN QUERY
      SELECT p.id, p.status, p.caption, p.created_at, '{}'::uuid[], true
      FROM posts p WHERE p.id = (v_key.response_body->>'postId')::uuid;
      RETURN;
    END IF;
  END IF;

  IF length(v_caption) > 2200 THEN
    RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'CAPTION_TOO_LONG';
  END IF;
  IF cardinality(p_media_ids) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'MEDIA_NOT_ATTACHABLE';
  END IF;

  FOR v_media IN
    SELECT m.id, m.owner_id, m.purpose, m.status FROM media_assets m
    WHERE m.id = ANY (p_media_ids) ORDER BY m.id FOR UPDATE
  LOOP
    IF v_media.owner_id <> p_viewer_id THEN
      RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'MEDIA_NOT_FOUND';
    END IF;
    IF v_media.purpose <> 'POST' OR v_media.status <> 'PENDING_UPLOAD'
       OR EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = v_media.id) THEN
      RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'MEDIA_NOT_ATTACHABLE';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM media_assets m WHERE m.id = ANY (p_media_ids)) <> cardinality(p_media_ids) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'MEDIA_NOT_FOUND';
  END IF;

  INSERT INTO posts (author_id, caption) VALUES (p_viewer_id, v_caption) RETURNING id INTO v_post_id;

  INSERT INTO post_media (post_id, media_id, position)
  SELECT v_post_id, ids.media_id, (ids.ord - 1)::smallint
  FROM unnest(p_media_ids) WITH ORDINALITY AS ids(media_id, ord);

  UPDATE media_assets m SET status = 'UPLOADED' WHERE m.id = ANY (p_media_ids);

  IF p_idempotency_key IS NOT NULL THEN
    UPDATE idempotency_keys k SET response_body = jsonb_build_object('postId', v_post_id)
    WHERE k.user_id = p_viewer_id AND k.key = p_idempotency_key;
  END IF;

  RETURN QUERY
  SELECT p.id, p.status, p.caption, p.created_at, p_media_ids, false
  FROM posts p WHERE p.id = v_post_id;
END $$;
-- @end-function

-- @function posts/fn_delete_post.sql
-- DELETE /posts/:id (BR-CT-04). Author only. The post disappears at once (soft delete, purged
-- after 30 days); its photos are queued for deletion from object storage. Idempotent for the
-- author. Someone else's visible post → JA403 NOT_OWNER; an invisible one → JA404.
CREATE OR REPLACE FUNCTION fn_delete_post(p_viewer_id uuid, p_post_id uuid)
RETURNS TABLE (deleted boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_author_id uuid;
  v_status    post_status;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  SELECT p.author_id, p.status INTO v_author_id, v_status FROM posts p WHERE p.id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'POST_NOT_FOUND';
  END IF;
  IF v_author_id <> p_viewer_id THEN
    PERFORM fn__assert_post_visible(p_viewer_id, p_post_id);
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'NOT_OWNER';
  END IF;
  IF v_status = 'DELETED' THEN
    RETURN QUERY SELECT true; RETURN;
  END IF;

  UPDATE posts p SET status = 'DELETED', deleted_at = now() WHERE p.id = p_post_id;
  IF v_status = 'PUBLISHED' THEN
    UPDATE users u SET post_count = u.post_count - 1 WHERE u.id = p_viewer_id;
  END IF;

  PERFORM fn__queue_media_deletion(ARRAY(SELECT pm.media_id FROM post_media pm WHERE pm.post_id = p_post_id));

  RETURN QUERY SELECT true;
END $$;
-- @end-function

-- @function posts/fn_update_post_caption.sql
-- PATCH /posts/:id (BR-CT-05, Could). Author only; hidden and deleted posts are not editable.
CREATE OR REPLACE FUNCTION fn_update_post_caption(p_viewer_id uuid, p_post_id uuid, p_caption text)
RETURNS TABLE (post_id uuid, caption varchar, updated_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_author_id uuid;
  v_status    post_status;
  v_caption   text := NULLIF(btrim(p_caption), '');
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  SELECT p.author_id, p.status INTO v_author_id, v_status FROM posts p WHERE p.id = p_post_id FOR UPDATE;
  IF NOT FOUND OR v_status IN ('HIDDEN', 'DELETED') THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'POST_NOT_FOUND';
  END IF;
  IF v_author_id <> p_viewer_id THEN
    PERFORM fn__assert_post_visible(p_viewer_id, p_post_id);
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'NOT_OWNER';
  END IF;
  IF length(v_caption) > 2200 THEN
    RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'CAPTION_TOO_LONG';
  END IF;

  RETURN QUERY
  WITH updated AS (
    UPDATE posts p SET caption = v_caption WHERE p.id = p_post_id
    RETURNING p.id, p.caption, p.updated_at
  )
  SELECT * FROM updated;
END $$;
-- @end-function

-- @function social/fn_get_blocked_users.sql
-- GET /me/blocks (BR-SF-01): the viewer's blocked accounts, most recently blocked first.
CREATE OR REPLACE FUNCTION fn_get_blocked_users(
  p_viewer_id   uuid,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (user_id uuid, username citext, display_name varchar, avatar_s_key text, blocked_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, av.object_key, b.created_at
  FROM blocks b
  JOIN users u ON u.id = b.blocked_id
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE b.blocker_id = p_viewer_id
    AND (b.created_at, b.blocked_id) < (c.cursor_time, c.cursor_id)
  ORDER BY b.created_at DESC, b.blocked_id DESC
  LIMIT c.page_limit;
END $$;
-- @end-function

-- @function social/fn_get_followers.sql
-- GET /users/:username/followers (BR-PR-05, Should). Newest follow first; cursor = the last
-- row's (followed_at, user_id). Hides non-ACTIVE users and users blocked either way with the viewer.
CREATE OR REPLACE FUNCTION fn_get_followers(
  p_viewer_id   uuid,
  p_username    text,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, avatar_s_key text,
  is_following boolean, is_me boolean, followed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  t record;
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  t := fn__resolve_profile(p_viewer_id, p_username);
  IF t.blocked_by_me THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, av.object_key,
         EXISTS (SELECT 1 FROM follows mine WHERE mine.follower_id = p_viewer_id AND mine.following_id = u.id),
         u.id = p_viewer_id,
         f.created_at
  FROM follows f
  JOIN users u ON u.id = f.follower_id AND u.status = 'ACTIVE'
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE f.following_id = t.target_id
    AND (f.created_at, f.follower_id) < (c.cursor_time, c.cursor_id)
    AND NOT fn__is_blocked_either_way(p_viewer_id, u.id)
  ORDER BY f.created_at DESC, f.follower_id DESC
  LIMIT c.page_limit;
END $$;
-- @end-function

-- @function social/fn_get_following.sql
-- GET /users/:username/following (BR-PR-05, Should). Same shape and rules as fn_get_followers.
CREATE OR REPLACE FUNCTION fn_get_following(
  p_viewer_id   uuid,
  p_username    text,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, avatar_s_key text,
  is_following boolean, is_me boolean, followed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  t record;
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  t := fn__resolve_profile(p_viewer_id, p_username);
  IF t.blocked_by_me THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, av.object_key,
         EXISTS (SELECT 1 FROM follows mine WHERE mine.follower_id = p_viewer_id AND mine.following_id = u.id),
         u.id = p_viewer_id,
         f.created_at
  FROM follows f
  JOIN users u ON u.id = f.following_id AND u.status = 'ACTIVE'
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE f.follower_id = t.target_id
    AND (f.created_at, f.following_id) < (c.cursor_time, c.cursor_id)
    AND NOT fn__is_blocked_either_way(p_viewer_id, u.id)
  ORDER BY f.created_at DESC, f.following_id DESC
  LIMIT c.page_limit;
END $$;
-- @end-function

-- @function users/fn_get_profile.sql
-- GET /users/:username (BR-PR-01, story E1-06). Never returns email, date of birth or hashes.
-- JA404 when the user is unknown, not ACTIVE or has blocked the viewer. When the viewer blocked
-- the user, the header is returned with is_blocked_by_me = true (to offer Unblock) and the grid
-- and lists stay empty.
CREATE OR REPLACE FUNCTION fn_get_profile(p_viewer_id uuid, p_username text)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, bio varchar,
  avatar_s_key text, avatar_m_key text,
  post_count int, follower_count int, following_count int,
  is_me boolean, is_following boolean, follows_me boolean, is_blocked_by_me boolean,
  created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  t record;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  t := fn__resolve_profile(p_viewer_id, p_username);

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.bio, avs.object_key, avm.object_key,
         u.post_count, u.follower_count, u.following_count,
         u.id = p_viewer_id,
         EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = p_viewer_id AND f.following_id = u.id),
         EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = u.id AND f.following_id = p_viewer_id),
         t.blocked_by_me,
         u.created_at
  FROM users u
  LEFT JOIN media_variants avs ON avs.media_id = u.avatar_media_id AND avs.variant = 'AVATAR_S'
  LEFT JOIN media_variants avm ON avm.media_id = u.avatar_media_id AND avm.variant = 'AVATAR_M'
  WHERE u.id = t.target_id;
END $$;
-- @end-function

-- @function users/fn_search_users.sql
-- GET /users/search?q= (BR-PR-03, TRD SR-01). Ranking: username prefix, then display-name prefix,
-- then (for queries of 3+ characters) substring and pg_trgm similarity matches, closest first.
-- An empty query lists the newest users (onboarding "Find people"). Excludes the viewer,
-- non-ACTIVE users and anyone blocked in either direction.
-- Each stage reads at most 3 × limit candidates through its own index (btree text_pattern_ops for
-- prefixes, GIN trigram for the rest), so the cost does not grow with the number of users.
CREATE OR REPLACE FUNCTION fn_search_users(p_viewer_id uuid, p_q text, p_limit int DEFAULT 20)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, avatar_s_key text, is_following boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_q     text := lower(btrim(COALESCE(p_q, '')));
  v_like  text;
  v_limit int  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  -- LIKE treats '_' and '%' as wildcards; usernames may contain '_'.
  v_like := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  IF v_q = '' THEN
    RETURN QUERY
    SELECT u.id, u.username, u.display_name, av.object_key,
           EXISTS (SELECT 1 FROM follows fo WHERE fo.follower_id = p_viewer_id AND fo.following_id = u.id)
    FROM users u
    LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
    WHERE u.status = 'ACTIVE' AND u.id <> p_viewer_id
      AND NOT EXISTS (SELECT 1 FROM blocks b
                      WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = u.id)
                         OR (b.blocker_id = u.id AND b.blocked_id = p_viewer_id))
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT v_limit;
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    (SELECT u.id, 1 AS rank, 0::real AS dist FROM users u
     WHERE lower(u.username::text) LIKE v_like || '%'
     ORDER BY lower(u.username::text) LIMIT v_limit * 3)
    UNION ALL
    (SELECT u.id, 2, 0::real FROM users u
     WHERE lower(u.display_name) LIKE v_like || '%'
     ORDER BY lower(u.display_name) LIMIT v_limit * 3)
    UNION ALL
    (SELECT u.id, 3, lower(u.username::text) <-> v_q FROM users u
     WHERE length(v_q) >= 3
       AND (lower(u.username::text) LIKE '%' || v_like || '%'
            OR lower(u.display_name) LIKE '%' || v_like || '%'
            OR lower(u.username::text) % v_q)
     ORDER BY 3 LIMIT v_limit * 3)
  ),
  best AS (
    SELECT c.id, min(c.rank) AS rank, min(c.dist) AS dist FROM candidates c GROUP BY c.id
  )
  SELECT u.id, u.username, u.display_name, av.object_key,
         EXISTS (SELECT 1 FROM follows fo WHERE fo.follower_id = p_viewer_id AND fo.following_id = u.id)
  FROM best
  JOIN users u ON u.id = best.id AND u.status = 'ACTIVE' AND u.id <> p_viewer_id
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE NOT EXISTS (SELECT 1 FROM blocks b
                    WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = u.id)
                       OR (b.blocker_id = u.id AND b.blocked_id = p_viewer_id))
  ORDER BY best.rank, best.dist, lower(u.username::text)
  LIMIT v_limit;
END $$;
-- @end-function

-- @function users/fn_update_profile.sql
-- PATCH /me (BR-PR-02, story E1-06). Only keys present in p_patch change:
-- displayName, bio, username, locale, avatarMediaId (null clears displayName / bio / avatar).
-- Unknown keys are ignored. A new avatar must be the viewer's own media with purpose AVATAR that
-- has not failed; a just-uploaded one is marked UPLOADED and the API enqueues its processing (a
-- no-op for READY media). Avatar keys are null until the worker finishes. The replaced avatar is
-- deleted from storage.
CREATE OR REPLACE FUNCTION fn_update_profile(p_viewer_id uuid, p_patch jsonb)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, bio varchar, avatar_media_id uuid,
  avatar_s_key text, avatar_m_key text, locale varchar,
  post_count int, follower_count int, following_count int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_constraint text;
  v_old_avatar uuid;
  v_new_avatar uuid;
  m            media_assets%ROWTYPE;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  SELECT u.avatar_media_id INTO v_old_avatar FROM users u WHERE u.id = p_viewer_id FOR UPDATE;
  v_new_avatar := v_old_avatar;

  IF p_patch ? 'avatarMediaId' THEN
    v_new_avatar := (p_patch->>'avatarMediaId')::uuid;
    IF v_new_avatar IS NOT NULL AND v_new_avatar IS DISTINCT FROM v_old_avatar THEN
      SELECT * INTO m FROM media_assets a WHERE a.id = v_new_avatar FOR UPDATE;
      IF NOT FOUND OR m.owner_id <> p_viewer_id THEN
        RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'MEDIA_NOT_FOUND';
      END IF;
      IF m.purpose <> 'AVATAR' OR m.status IN ('FAILED', 'DELETED') THEN
        RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'MEDIA_NOT_ATTACHABLE';
      END IF;
      UPDATE media_assets a SET status = 'UPLOADED' WHERE a.id = v_new_avatar AND a.status = 'PENDING_UPLOAD';
    END IF;
  END IF;

  BEGIN
    UPDATE users u SET
      display_name    = CASE WHEN p_patch ? 'displayName' THEN NULLIF(btrim(p_patch->>'displayName'), '') ELSE u.display_name END,
      bio             = CASE WHEN p_patch ? 'bio'         THEN NULLIF(btrim(p_patch->>'bio'), '')         ELSE u.bio END,
      username        = CASE WHEN p_patch ? 'username'    THEN btrim(p_patch->>'username')               ELSE u.username END,
      locale          = CASE WHEN p_patch ? 'locale'      THEN p_patch->>'locale'                        ELSE u.locale END,
      avatar_media_id = v_new_avatar
    WHERE u.id = p_viewer_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'users_username_key' THEN
      RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'USERNAME_TAKEN';
    END IF;
    RAISE;
  END;

  IF v_old_avatar IS NOT NULL AND v_old_avatar IS DISTINCT FROM v_new_avatar THEN
    PERFORM fn__queue_media_deletion(ARRAY[v_old_avatar]);
  END IF;

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.bio, u.avatar_media_id, avs.object_key, avm.object_key, u.locale,
         u.post_count, u.follower_count, u.following_count
  FROM users u
  LEFT JOIN media_variants avs ON avs.media_id = u.avatar_media_id AND avs.variant = 'AVATAR_S'
  LEFT JOIN media_variants avm ON avm.media_id = u.avatar_media_id AND avm.variant = 'AVATAR_M'
  WHERE u.id = p_viewer_id;
END $$;
-- @end-function

-- @grants (prisma/grants.sql)
-- Runtime-role grants (Schema §9, TRD SP-05 / SR-01). Idempotent: appended to every
-- migration that adds functions. Table column grants live in the migration that adds the table.

-- Only jamii_app (and the owner) may use the schema.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO jamii_app;

-- New functions are not executable by PUBLIC. Extension functions (citext, pg_trgm) keep
-- their PUBLIC grant: jamii_app's simple reads need the citext operators.
ALTER DEFAULT PRIVILEGES FOR ROLE jamii_owner IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- fn_*: EXECUTE for jamii_app. fn__* (internal helpers): nobody but the owner.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'fn\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    IF f.proname LIKE 'fn\_\_%' THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM jamii_app', f.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO jamii_app', f.sig);
    END IF;
  END LOOP;
END $$;
-- @end-grants
