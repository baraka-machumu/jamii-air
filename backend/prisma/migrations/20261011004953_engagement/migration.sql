-- CreateTable
CREATE TABLE "likes" (
    "user_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "likes_pkey" PRIMARY KEY ("user_id","post_id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "post_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "hidden_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "likes_post_id_created_at_idx" ON "likes"("post_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "likes_created_at_idx" ON "likes"("created_at");

-- CreateIndex
CREATE INDEX "comments_author_id_idx" ON "comments"("author_id");

-- CreateIndex
CREATE INDEX "comments_created_at_idx" ON "comments"("created_at");

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Constraints and indexes (Schema §5; raw SQL) ─────────────

ALTER TABLE comments ADD CONSTRAINT comments_body_not_blank CHECK (length(btrim(body)) >= 1);

-- Comments screen: visible comments of a post in time order (read newest page first).
CREATE INDEX comments_visible_post_created_idx
  ON comments (post_id, created_at, id) WHERE deleted_at IS NULL AND hidden_at IS NULL;

-- @function engagement/fn_add_comment.sql
-- POST /posts/:id/comments (BR-FD-04, API-08). The post must be visible to the viewer (else
-- JA404). Idempotency-Key works as in fn_create_post: a repeat returns the original comment.
-- notification_id: the COMMENT notification is added with the notifications migration (task 1.9).
CREATE OR REPLACE FUNCTION fn_add_comment(
  p_viewer_id       uuid,
  p_post_id         uuid,
  p_body            text,
  p_idempotency_key text,
  p_request_hash    text)
RETURNS TABLE (
  comment_id uuid, post_id uuid, body varchar, created_at timestamptz,
  comment_count int, notification_id uuid, replayed boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c_route      constant text := 'POST /posts/:id/comments';
  v_key        idempotency_keys%ROWTYPE;
  v_rows       int;
  v_comment_id uuid;
  v_count      int;
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
      SELECT c.id, c.post_id, c.body, c.created_at, p.comment_count, NULL::uuid, true
      FROM comments c JOIN posts p ON p.id = c.post_id
      WHERE c.id = (v_key.response_body->>'commentId')::uuid;
      RETURN;
    END IF;
  END IF;

  PERFORM fn__assert_post_visible(p_viewer_id, p_post_id);

  INSERT INTO comments (post_id, author_id, body) VALUES (p_post_id, p_viewer_id, btrim(p_body))
  RETURNING id INTO v_comment_id;

  UPDATE posts p SET comment_count = p.comment_count + 1 WHERE p.id = p_post_id
  RETURNING p.comment_count INTO v_count;

  IF p_idempotency_key IS NOT NULL THEN
    UPDATE idempotency_keys k SET response_body = jsonb_build_object('commentId', v_comment_id)
    WHERE k.user_id = p_viewer_id AND k.key = p_idempotency_key;
  END IF;

  RETURN QUERY
  SELECT c.id, c.post_id, c.body, c.created_at, v_count, NULL::uuid, false
  FROM comments c WHERE c.id = v_comment_id;
END $$;
-- @end-function

-- @function engagement/fn_delete_comment.sql
-- DELETE /comments/:id (BR-FD-05): by the comment's author or the post's author. Soft delete,
-- purged after 30 days. A comment the viewer cannot see is JA404; one they see but may not
-- delete is JA403 NOT_OWNER.
CREATE OR REPLACE FUNCTION fn_delete_comment(p_viewer_id uuid, p_comment_id uuid)
RETURNS TABLE (deleted boolean, comment_count int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c              comments%ROWTYPE;
  v_post_author  uuid;
  v_count        int;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  SELECT * INTO c FROM comments k WHERE k.id = p_comment_id FOR UPDATE;
  IF NOT FOUND OR c.deleted_at IS NOT NULL
     OR (c.author_id <> p_viewer_id AND c.hidden_at IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'COMMENT_NOT_FOUND';
  END IF;
  SELECT p.author_id INTO v_post_author FROM posts p WHERE p.id = c.post_id;

  IF p_viewer_id NOT IN (c.author_id, v_post_author) THEN
    -- Reveal nothing about comments on posts the viewer cannot see.
    BEGIN
      PERFORM fn__assert_post_visible(p_viewer_id, c.post_id);
    EXCEPTION WHEN SQLSTATE 'JA404' THEN
      RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'COMMENT_NOT_FOUND';
    END;
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'NOT_OWNER';
  END IF;

  UPDATE comments k SET deleted_at = now() WHERE k.id = p_comment_id;

  IF c.hidden_at IS NULL THEN
    UPDATE posts p SET comment_count = p.comment_count - 1 WHERE p.id = c.post_id
    RETURNING p.comment_count INTO v_count;
  ELSE
    SELECT p.comment_count INTO v_count FROM posts p WHERE p.id = c.post_id;
  END IF;

  RETURN QUERY SELECT true, v_count;
END $$;
-- @end-function

-- @function engagement/fn_get_post_comments.sql
-- GET /posts/:id/comments (BR-FD-04/05). Pages newest first (the app shows them oldest → newest
-- and loads older pages on scroll up); cursor = the last row's (created_at, comment_id).
-- Hides hidden / deleted comments, authors who are not ACTIVE and users blocked either way.
-- can_delete: the viewer wrote the comment or owns the post.
CREATE OR REPLACE FUNCTION fn_get_post_comments(
  p_viewer_id   uuid,
  p_post_id     uuid,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  comment_id uuid, body varchar, created_at timestamptz,
  author_id uuid, author_username citext, author_display_name varchar, author_avatar_key text,
  can_delete boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_post_author uuid;
  c             record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  v_post_author := fn__assert_post_visible(p_viewer_id, p_post_id);

  RETURN QUERY
  SELECT k.id, k.body, k.created_at, u.id, u.username, u.display_name, av.object_key,
         p_viewer_id IN (k.author_id, v_post_author)
  FROM comments k
  JOIN users u ON u.id = k.author_id AND u.status = 'ACTIVE'
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE k.post_id = p_post_id
    AND k.deleted_at IS NULL AND k.hidden_at IS NULL
    AND (k.created_at, k.id) < (c.cursor_time, c.cursor_id)
    AND NOT EXISTS (SELECT 1 FROM blocks b
                    WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = k.author_id)
                       OR (b.blocker_id = k.author_id AND b.blocked_id = p_viewer_id))
  ORDER BY k.created_at DESC, k.id DESC
  LIMIT c.page_limit;
END $$;
-- @end-function

-- @function engagement/fn_like_post.sql
-- PUT /posts/:id/like (BR-FD-03; reference implementation Schema §8.3). Idempotent. The post must
-- be visible to the viewer (PUBLISHED, author ACTIVE, no block either way), else JA404.
-- notification_id: the LIKE notification is added with the notifications migration (task 1.9).
CREATE OR REPLACE FUNCTION fn_like_post(p_viewer_id uuid, p_post_id uuid)
RETURNS TABLE (liked boolean, like_count int, notification_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows  int;
  v_count int;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  PERFORM fn__assert_post_visible(p_viewer_id, p_post_id);

  INSERT INTO likes (user_id, post_id) VALUES (p_viewer_id, p_post_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    UPDATE posts p SET like_count = p.like_count + 1 WHERE p.id = p_post_id
    RETURNING p.like_count INTO v_count;
  ELSE
    SELECT p.like_count INTO v_count FROM posts p WHERE p.id = p_post_id;
  END IF;

  RETURN QUERY SELECT true, v_count, NULL::uuid;
END $$;
-- @end-function

-- @function engagement/fn_unlike_post.sql
-- DELETE /posts/:id/like (BR-FD-03). Idempotent. Same visibility rule and shape as fn_like_post
-- (notification_id is always null).
CREATE OR REPLACE FUNCTION fn_unlike_post(p_viewer_id uuid, p_post_id uuid)
RETURNS TABLE (liked boolean, like_count int, notification_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows  int;
  v_count int;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  PERFORM fn__assert_post_visible(p_viewer_id, p_post_id);

  DELETE FROM likes l WHERE l.user_id = p_viewer_id AND l.post_id = p_post_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    UPDATE posts p SET like_count = p.like_count - 1 WHERE p.id = p_post_id
    RETURNING p.like_count INTO v_count;
  ELSE
    SELECT p.like_count INTO v_count FROM posts p WHERE p.id = p_post_id;
  END IF;

  RETURN QUERY SELECT false, v_count, NULL::uuid;
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
