-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "recipient_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "post_id" UUID,
    "comment_id" UUID,
    "read_at" TIMESTAMPTZ,
    "pushed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_recipient_id_created_at_id_idx" ON "notifications"("recipient_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Constraints and indexes (Schema §5; raw SQL) ─────────────

-- BR-NT-04 / NT-02: never notify people about their own actions.
ALTER TABLE notifications ADD CONSTRAINT notifications_no_self CHECK (recipient_id <> actor_id);
ALTER TABLE notifications ADD CONSTRAINT notifications_target CHECK (
  (type = 'FOLLOW'  AND post_id IS NULL AND comment_id IS NULL) OR
  (type = 'LIKE'    AND post_id IS NOT NULL AND comment_id IS NULL) OR
  (type = 'COMMENT' AND post_id IS NOT NULL AND comment_id IS NOT NULL));

-- Like → unlike → like (or unfollow → follow) notifies once (used with ON CONFLICT DO NOTHING).
CREATE UNIQUE INDEX notifications_like_dedupe   ON notifications (recipient_id, actor_id, post_id) WHERE type = 'LIKE';
CREATE UNIQUE INDEX notifications_follow_dedupe ON notifications (recipient_id, actor_id)          WHERE type = 'FOLLOW';

-- Unread badge.
CREATE INDEX notifications_unread_idx ON notifications (recipient_id) WHERE read_at IS NULL;

-- @function engagement/fn_add_comment.sql
-- POST /posts/:id/comments (BR-FD-04, API-08). The post must be visible to the viewer (else
-- JA404). Idempotency-Key works as in fn_create_post: a repeat returns the original comment.
-- notification_id: the COMMENT notification for the post's author (null on an own post).
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
  v_author_id  uuid;
  v_notif_id   uuid;
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

  v_author_id := fn__assert_post_visible(p_viewer_id, p_post_id);

  INSERT INTO comments (post_id, author_id, body) VALUES (p_post_id, p_viewer_id, btrim(p_body))
  RETURNING id INTO v_comment_id;

  UPDATE posts p SET comment_count = p.comment_count + 1 WHERE p.id = p_post_id
  RETURNING p.comment_count INTO v_count;

  IF v_author_id <> p_viewer_id THEN
    INSERT INTO notifications (recipient_id, actor_id, type, post_id, comment_id)
    VALUES (v_author_id, p_viewer_id, 'COMMENT', p_post_id, v_comment_id)
    RETURNING id INTO v_notif_id;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    UPDATE idempotency_keys k SET response_body = jsonb_build_object('commentId', v_comment_id)
    WHERE k.user_id = p_viewer_id AND k.key = p_idempotency_key;
  END IF;

  RETURN QUERY
  SELECT c.id, c.post_id, c.body, c.created_at, v_count, v_notif_id, false
  FROM comments c WHERE c.id = v_comment_id;
END $$;
-- @end-function

-- @function engagement/fn_like_post.sql
-- PUT /posts/:id/like (BR-FD-03; reference implementation Schema §8.3). Idempotent. The post must
-- be visible to the viewer (PUBLISHED, author ACTIVE, no block either way), else JA404.
-- notification_id: the new LIKE notification; null for an own post, a repeated like, or when the
-- author was already notified (like → unlike → like notifies once, BR-NT-04).
CREATE OR REPLACE FUNCTION fn_like_post(p_viewer_id uuid, p_post_id uuid)
RETURNS TABLE (liked boolean, like_count int, notification_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_author_id uuid;
  v_rows      int;
  v_count     int;
  v_notif_id  uuid;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  v_author_id := fn__assert_post_visible(p_viewer_id, p_post_id);

  INSERT INTO likes (user_id, post_id) VALUES (p_viewer_id, p_post_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    UPDATE posts p SET like_count = p.like_count + 1 WHERE p.id = p_post_id
    RETURNING p.like_count INTO v_count;

    IF v_author_id <> p_viewer_id THEN
      INSERT INTO notifications (recipient_id, actor_id, type, post_id)
      VALUES (v_author_id, p_viewer_id, 'LIKE', p_post_id)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_notif_id;
    END IF;
  ELSE
    SELECT p.like_count INTO v_count FROM posts p WHERE p.id = p_post_id;
  END IF;

  RETURN QUERY SELECT true, v_count, v_notif_id;
END $$;
-- @end-function

-- @function notifications/fn_delete_device_tokens.sql
-- Push worker (NT-03): removes tokens Expo reported as invalid (DeviceNotRegistered).
CREATE OR REPLACE FUNCTION fn_delete_device_tokens(p_tokens text[])
RETURNS TABLE (deleted int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  DELETE FROM device_push_tokens d WHERE d.expo_push_token = ANY (p_tokens);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN QUERY SELECT v_rows;
END $$;
-- @end-function

-- @function notifications/fn_get_notifications.sql
-- GET /notifications (BR-NT-02, Activity screen). Newest first, keyset paging. Hides actors who
-- are not ACTIVE or blocked either way. A notification whose post or comment was since deleted
-- or hidden stays in the list with target_available = false (the app shows "no longer available")
-- and without thumbnail or excerpt.
CREATE OR REPLACE FUNCTION fn_get_notifications(
  p_viewer_id   uuid,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  notification_id uuid, type notification_type, created_at timestamptz, read_at timestamptz,
  actor_id uuid, actor_username citext, actor_display_name varchar, actor_avatar_key text,
  actor_followed_by_me boolean,
  post_id uuid, post_thumb_key text, comment_id uuid, comment_excerpt text, target_available boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  RETURN QUERY
  SELECT n.id, n.type, n.created_at, n.read_at,
         a.id, a.username, a.display_name, av.object_key,
         EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = p_viewer_id AND f.following_id = a.id),
         n.post_id,
         CASE WHEN t.available THEN tv.object_key END,
         n.comment_id,
         CASE WHEN t.available THEN left(k.body, 100) END,
         t.available
  FROM notifications n
  JOIN users a ON a.id = n.actor_id AND a.status = 'ACTIVE'
  LEFT JOIN media_variants av ON av.media_id = a.avatar_media_id AND av.variant = 'AVATAR_S'
  LEFT JOIN posts p ON p.id = n.post_id
  LEFT JOIN comments k ON k.id = n.comment_id
  LEFT JOIN post_media pm ON pm.post_id = n.post_id AND pm.position = 0
  LEFT JOIN media_variants tv ON tv.media_id = pm.media_id AND tv.variant = 'THUMB'
  CROSS JOIN LATERAL (
    SELECT CASE n.type
             WHEN 'FOLLOW'  THEN true
             WHEN 'LIKE'    THEN p.status = 'PUBLISHED'
             ELSE p.status = 'PUBLISHED' AND k.deleted_at IS NULL AND k.hidden_at IS NULL
           END AS available
  ) t
  WHERE n.recipient_id = p_viewer_id
    AND (n.created_at, n.id) < (c.cursor_time, c.cursor_id)
    AND NOT EXISTS (SELECT 1 FROM blocks b
                    WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = n.actor_id)
                       OR (b.blocker_id = n.actor_id AND b.blocked_id = p_viewer_id))
  ORDER BY n.created_at DESC, n.id DESC
  LIMIT c.page_limit;
END $$;
-- @end-function

-- @function notifications/fn_get_push_payload.sql
-- Push worker (BR-NT-03, NT-03): one row per device of the recipient, with what the localised
-- text needs. No rows — nothing to send — when the notification was already pushed or read, is
-- older than 24 hours, the recipient or actor is not ACTIVE, they block each other, or the post /
-- comment is no longer available.
CREATE OR REPLACE FUNCTION fn_get_push_payload(p_notification_id uuid)
RETURNS TABLE (
  recipient_id uuid, recipient_locale varchar, type notification_type, actor_username citext,
  post_id uuid, comment_id uuid,
  installation_id varchar, expo_push_token varchar, platform platform, device_locale varchar)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT r.id, r.locale, n.type, a.username, n.post_id, n.comment_id,
         d.installation_id, d.expo_push_token, d.platform, d.locale
  FROM notifications n
  JOIN users r ON r.id = n.recipient_id AND r.status = 'ACTIVE'
  JOIN users a ON a.id = n.actor_id AND a.status = 'ACTIVE'
  JOIN device_push_tokens d ON d.user_id = n.recipient_id
  LEFT JOIN posts p ON p.id = n.post_id
  LEFT JOIN comments k ON k.id = n.comment_id
  WHERE n.id = p_notification_id
    AND n.pushed_at IS NULL
    AND n.read_at IS NULL
    AND n.created_at > now() - INTERVAL '24 hours'
    AND (n.post_id IS NULL OR p.status = 'PUBLISHED')
    AND (n.comment_id IS NULL OR (k.deleted_at IS NULL AND k.hidden_at IS NULL))
    AND NOT fn__is_blocked_either_way(n.recipient_id, n.actor_id)
  ORDER BY d.installation_id;
END $$;
-- @end-function

-- @function notifications/fn_get_unread_count.sql
-- GET /notifications/unread-count (BR-NT-02 badge, NT-04). Capped at 100 ("99+" in the app).
-- Counts the same notifications fn_get_notifications shows.
CREATE OR REPLACE FUNCTION fn_get_unread_count(p_viewer_id uuid)
RETURNS TABLE (unread_count int)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  RETURN QUERY
  SELECT count(*)::int FROM (
    SELECT 1
    FROM notifications n
    JOIN users a ON a.id = n.actor_id AND a.status = 'ACTIVE'
    WHERE n.recipient_id = p_viewer_id AND n.read_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM blocks b
                      WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = n.actor_id)
                         OR (b.blocker_id = n.actor_id AND b.blocked_id = p_viewer_id))
    LIMIT 100
  ) unread;
END $$;
-- @end-function

-- @function notifications/fn_mark_notification_pushed.sql
-- Push worker: records that the push was handed to Expo, so a retried job does not send twice.
CREATE OR REPLACE FUNCTION fn_mark_notification_pushed(p_notification_id uuid)
RETURNS TABLE (updated boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  UPDATE notifications n SET pushed_at = now() WHERE n.id = p_notification_id AND n.pushed_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN QUERY SELECT v_rows = 1;
END $$;
-- @end-function

-- @function notifications/fn_mark_notifications_read.sql
-- POST /notifications/read { ids?, all? }. Only the viewer's own notifications change.
CREATE OR REPLACE FUNCTION fn_mark_notifications_read(p_viewer_id uuid, p_ids uuid[], p_mark_all boolean DEFAULT false)
RETURNS TABLE (updated int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  UPDATE notifications n SET read_at = now()
  WHERE n.recipient_id = p_viewer_id
    AND n.read_at IS NULL
    AND (COALESCE(p_mark_all, false) OR n.id = ANY (COALESCE(p_ids, '{}')));
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN QUERY SELECT v_rows;
END $$;
-- @end-function

-- @function notifications/fn_remove_device_token.sql
-- DELETE /me/devices/:installationId: push turned off on this phone. Only the viewer's own row.
CREATE OR REPLACE FUNCTION fn_remove_device_token(p_viewer_id uuid, p_installation_id text)
RETURNS TABLE (removed boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  DELETE FROM device_push_tokens d WHERE d.installation_id = p_installation_id AND d.user_id = p_viewer_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN QUERY SELECT v_rows = 1;
END $$;
-- @end-function

-- @function notifications/fn_upsert_device_token.sql
-- PUT /me/devices/:installationId (BR-NT-03). One row per app installation; a phone that
-- switches accounts moves to the new user. The same Expo token under an older installation id
-- (reinstall) is removed so nobody gets duplicate pushes.
CREATE OR REPLACE FUNCTION fn_upsert_device_token(
  p_viewer_id       uuid,
  p_installation_id text,
  p_token           text,
  p_platform        platform,
  p_app_version     text,
  p_locale          text)
RETURNS TABLE (installation_id varchar)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  DELETE FROM device_push_tokens d WHERE d.expo_push_token = p_token AND d.installation_id <> p_installation_id;

  INSERT INTO device_push_tokens AS d (installation_id, user_id, expo_push_token, platform, app_version, locale)
  VALUES (p_installation_id, p_viewer_id, p_token, p_platform, p_app_version, p_locale)
  ON CONFLICT (installation_id) DO UPDATE
    SET user_id = EXCLUDED.user_id, expo_push_token = EXCLUDED.expo_push_token, platform = EXCLUDED.platform,
        app_version = EXCLUDED.app_version, locale = EXCLUDED.locale, last_seen_at = now();

  RETURN QUERY SELECT p_installation_id::varchar;
END $$;
-- @end-function

-- @function social/fn_follow_user.sql
-- PUT /users/:id/follow (BR-PR-04). Idempotent: following someone twice changes nothing.
-- The target must be ACTIVE and must not have blocked the viewer (else JA404, the profile is
-- invisible); a viewer who blocked the target gets JA403 BLOCKED (BR-SF-01).
-- notification_id: the new FOLLOW notification; null when nothing changed or the target was
-- already notified about this viewer (unfollow → follow notifies once, BR-NT-04).
CREATE OR REPLACE FUNCTION fn_follow_user(p_viewer_id uuid, p_target_id uuid)
RETURNS TABLE (following boolean, follower_count int, notification_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows     int;
  v_count    int;
  v_notif_id uuid;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF p_target_id = p_viewer_id THEN
    RAISE EXCEPTION USING ERRCODE = 'JA422', MESSAGE = 'CANNOT_FOLLOW_SELF';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_target_id AND u.status = 'ACTIVE')
     OR EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = p_target_id AND b.blocked_id = p_viewer_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;
  IF EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = p_viewer_id AND b.blocked_id = p_target_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'BLOCKED';
  END IF;

  -- Lock both users in id order so crossing follows (A→B, B→A) cannot deadlock.
  PERFORM 1 FROM users u WHERE u.id IN (p_viewer_id, p_target_id) ORDER BY u.id FOR UPDATE;

  INSERT INTO follows (follower_id, following_id) VALUES (p_viewer_id, p_target_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    UPDATE users u SET following_count = u.following_count + 1 WHERE u.id = p_viewer_id;
    UPDATE users u SET follower_count = u.follower_count + 1 WHERE u.id = p_target_id
    RETURNING u.follower_count INTO v_count;

    INSERT INTO notifications (recipient_id, actor_id, type)
    VALUES (p_target_id, p_viewer_id, 'FOLLOW')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_notif_id;
  ELSE
    SELECT u.follower_count INTO v_count FROM users u WHERE u.id = p_target_id;
  END IF;

  RETURN QUERY SELECT true, v_count, v_notif_id;
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
