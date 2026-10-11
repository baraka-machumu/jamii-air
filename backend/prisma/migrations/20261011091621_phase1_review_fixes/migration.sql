-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "uploaded_at" TIMESTAMPTZ;

-- Media already past PENDING_UPLOAD: best available start of processing.
UPDATE media_assets SET uploaded_at = updated_at WHERE status <> 'PENDING_UPLOAD' AND uploaded_at IS NULL;

-- @function _common/fn__claim_idempotency_key.sql
-- Idempotency-Key handling for retry-safe POSTs (API-08), shared by fn_create_post and
-- fn_add_comment. Claims (user, key) for this request and returns NULL: the caller does the work,
-- then stores its response in idempotency_keys.response_body. If the key was already used,
-- returns the stored response (a parallel duplicate waits for the first to commit). The same key
-- with a different route or request hash is JA409 IDEMPOTENCY_KEY_REUSED (NULL-safe comparison).
CREATE OR REPLACE FUNCTION fn__claim_idempotency_key(p_user_id uuid, p_key text, p_route text, p_request_hash text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows int;
  k      idempotency_keys%ROWTYPE;
BEGIN
  INSERT INTO idempotency_keys (user_id, key, route, request_hash, response_body)
  VALUES (p_user_id, p_key, p_route, p_request_hash, '{}')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 1 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO k FROM idempotency_keys x WHERE x.user_id = p_user_id AND x.key = p_key;
  IF k.route IS DISTINCT FROM p_route OR k.request_hash IS DISTINCT FROM p_request_hash THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'IDEMPOTENCY_KEY_REUSED';
  END IF;
  RETURN k.response_body;
END $$;
-- @end-function

-- @function admin_auth/fn_admin_record_login.sql
-- Records an admin login attempt (AP-07): success resets the failure counter; the 10th
-- consecutive failure locks the account until a super-admin re-activates it. Every attempt is
-- audit-logged; p_admin_id is NULL for an unknown email. Returns instead of raising, so the
-- failure count and the audit row are kept (Schema §6 rule 6). A correct password for a locked or
-- disabled admin is logged as LOGIN_BLOCKED and returns locked = true: the API must refuse it.
CREATE OR REPLACE FUNCTION fn_admin_record_login(p_admin_id uuid, p_success boolean, p_user_agent text)
RETURNS TABLE (failed_login_count int, locked boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  a        admin_users%ROWTYPE;
  v_ua     jsonb := jsonb_build_object('userAgent', left(p_user_agent, 255));
BEGIN
  SELECT * INTO a FROM admin_users x WHERE x.id = p_admin_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM fn__admin_audit(NULL, 'LOGIN_FAILED', NULL, NULL, v_ua || '{"reason": "UNKNOWN_EMAIL"}');
    RETURN QUERY SELECT NULL::int, NULL::boolean; RETURN;
  END IF;

  IF p_success THEN
    IF a.status <> 'ACTIVE' OR a.locked_at IS NOT NULL THEN
      PERFORM fn__admin_audit(a.id, 'LOGIN_BLOCKED', NULL, NULL,
                              v_ua || jsonb_build_object('status', a.status, 'locked', a.locked_at IS NOT NULL));
      RETURN QUERY SELECT a.failed_login_count, true; RETURN;
    END IF;
    UPDATE admin_users x SET failed_login_count = 0, last_login_at = now() WHERE x.id = a.id;
    PERFORM fn__admin_audit(a.id, 'LOGIN_SUCCESS', NULL, NULL, v_ua);
    RETURN QUERY SELECT 0, false; RETURN;
  END IF;

  UPDATE admin_users x
  SET failed_login_count = x.failed_login_count + 1,
      locked_at = CASE WHEN x.failed_login_count + 1 >= 10 THEN COALESCE(x.locked_at, now()) ELSE x.locked_at END
  WHERE x.id = a.id
  RETURNING x.* INTO a;

  PERFORM fn__admin_audit(a.id, 'LOGIN_FAILED', NULL, NULL, v_ua);
  IF a.failed_login_count = 10 THEN
    UPDATE admin_sessions s SET revoked_at = now() WHERE s.admin_id = a.id AND s.revoked_at IS NULL;
    PERFORM fn__admin_audit(a.id, 'ACCOUNT_LOCKED', 'ADMIN', a.id, NULL);
  END IF;

  RETURN QUERY SELECT a.failed_login_count, a.locked_at IS NOT NULL;
END $$;
-- @end-function

-- @function admin/fn_admin_update_admin.sql
-- PATCH /admin/admins/:id (SUPER_ADMIN only): change role and / or status (NULL = unchanged).
-- Re-activating also unlocks the account; disabling ends its sessions. A super-admin cannot
-- disable or demote themselves (App Flow §15.8), and every super-admin row is locked first, so two
-- super-admins demoting each other at once cannot leave none.
-- Audit-logged with the reason.
CREATE OR REPLACE FUNCTION fn_admin_update_admin(
  p_admin_id  uuid,
  p_target_id uuid,
  p_role      admin_role,
  p_status    admin_status,
  p_note      text)
RETURNS TABLE (admin_id uuid, role admin_role, status admin_status, locked boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  t admin_users%ROWTYPE;
BEGIN
  PERFORM 1 FROM admin_users a WHERE a.role = 'SUPER_ADMIN' ORDER BY a.id FOR UPDATE;
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN']::admin_role[]);
  PERFORM fn__require_note(p_note);

  SELECT * INTO t FROM admin_users a WHERE a.id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'ADMIN_NOT_FOUND';
  END IF;
  IF p_target_id = p_admin_id AND (p_status = 'DISABLED' OR p_role = 'MODERATOR') THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
  END IF;

  UPDATE admin_users a SET
    role               = COALESCE(p_role, a.role),
    status             = COALESCE(p_status, a.status),
    locked_at          = CASE WHEN p_status = 'ACTIVE' THEN NULL ELSE a.locked_at END,
    failed_login_count = CASE WHEN p_status = 'ACTIVE' THEN 0 ELSE a.failed_login_count END
  WHERE a.id = p_target_id;

  IF NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.role = 'SUPER_ADMIN' AND a.status = 'ACTIVE' AND a.locked_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
  END IF;

  IF p_status = 'DISABLED' THEN
    UPDATE admin_sessions s SET revoked_at = now() WHERE s.admin_id = p_target_id AND s.revoked_at IS NULL;
  END IF;

  PERFORM fn__admin_audit(p_admin_id, 'ADMIN_UPDATED', 'ADMIN', p_target_id,
    jsonb_build_object('role', p_role, 'status', p_status, 'note', btrim(p_note)));

  RETURN QUERY SELECT a.id, a.role, a.status, a.locked_at IS NOT NULL FROM admin_users a WHERE a.id = p_target_id;
END $$;
-- @end-function

-- @function auth/fn_create_session.sql
-- POST /auth/login, step 2 (story E1-03): new refresh-token family after Node verified the
-- password. With p_cancel_deletion, a login during the 30-day grace period restores the account
-- (BR-AC-08); without it, or once the 30 days are over (purge pending), a pending-deletion
-- account gets JA401 ACCOUNT_NOT_ACTIVE.
CREATE OR REPLACE FUNCTION fn_create_session(
  p_user_id         uuid,
  p_refresh_hash    text,
  p_expires_at      timestamptz,
  p_user_agent      text,
  p_cancel_deletion boolean DEFAULT false)
RETURNS TABLE (family_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_status    user_status;
  v_requested timestamptz;
  v_family_id uuid := uuidv7();
BEGIN
  SELECT u.status, u.deletion_requested_at INTO v_status, v_requested FROM users u WHERE u.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  ELSIF v_status = 'SUSPENDED' THEN
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'ACCOUNT_SUSPENDED';
  ELSIF v_status = 'PENDING_DELETION' THEN
    IF NOT COALESCE(p_cancel_deletion, false) OR v_requested <= now() - INTERVAL '30 days' THEN
      RAISE EXCEPTION USING ERRCODE = 'JA401', MESSAGE = 'ACCOUNT_NOT_ACTIVE';
    END IF;
    UPDATE users u SET status = 'ACTIVE', deletion_requested_at = NULL WHERE u.id = p_user_id;
  END IF;

  INSERT INTO refresh_tokens (user_id, family_id, token_hash, user_agent, expires_at)
  VALUES (p_user_id, v_family_id, p_refresh_hash, left(p_user_agent, 255), p_expires_at);

  UPDATE users u SET last_active_at = now() WHERE u.id = p_user_id;

  RETURN QUERY SELECT v_family_id;
END $$;
-- @end-function

-- @function auth/fn_reset_password.sql
-- POST /auth/password/reset (BR-AC-07, AU-05, story E1-07). Returns an outcome instead of
-- raising so a wrong attempt is counted (Schema §6 rule 6).
--   OK                 password changed, code used, every session and push token removed
--   INVALID_CODE       unknown email, no live code, or wrong code
--   EXPIRED            the latest code is past expires_at
--   TOO_MANY_ATTEMPTS  5 wrong attempts: the code is dead even if the right code follows
CREATE OR REPLACE FUNCTION fn_reset_password(p_email text, p_code_hash text, p_new_password_hash text)
RETURNS TABLE (outcome text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user_id uuid;
  c         password_reset_codes%ROWTYPE;
BEGIN
  SELECT u.id INTO v_user_id FROM users u WHERE u.email = btrim(p_email)::citext AND u.status = 'ACTIVE';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID_CODE'; RETURN;
  END IF;

  SELECT * INTO c FROM password_reset_codes r
  WHERE r.user_id = v_user_id
  ORDER BY r.created_at DESC, r.id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR c.used_at IS NOT NULL THEN
    RETURN QUERY SELECT 'INVALID_CODE'; RETURN;
  ELSIF c.attempts >= 5 THEN
    RETURN QUERY SELECT 'TOO_MANY_ATTEMPTS'; RETURN;
  ELSIF c.expires_at <= now() THEN
    RETURN QUERY SELECT 'EXPIRED'; RETURN;
  END IF;

  IF c.code_hash IS DISTINCT FROM p_code_hash THEN
    UPDATE password_reset_codes r SET attempts = r.attempts + 1 WHERE r.id = c.id;
    RETURN QUERY SELECT CASE WHEN c.attempts + 1 >= 5 THEN 'TOO_MANY_ATTEMPTS' ELSE 'INVALID_CODE' END;
    RETURN;
  END IF;

  UPDATE password_reset_codes r SET used_at = now() WHERE r.id = c.id;
  UPDATE users u SET password_hash = p_new_password_hash, password_changed_at = now() WHERE u.id = v_user_id;
  UPDATE refresh_tokens t SET revoked_at = now() WHERE t.user_id = v_user_id AND t.revoked_at IS NULL;
  DELETE FROM device_push_tokens d WHERE d.user_id = v_user_id;

  RETURN QUERY SELECT 'OK';
END $$;
-- @end-function

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
  v_replay     jsonb;
  v_comment_id uuid;
  v_count      int;
  v_author_id  uuid;
  v_notif_id   uuid;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF p_idempotency_key IS NOT NULL THEN
    v_replay := fn__claim_idempotency_key(p_viewer_id, p_idempotency_key, c_route, p_request_hash);
    IF v_replay IS NOT NULL THEN
      RETURN QUERY
      SELECT c.id, c.post_id, c.body, c.created_at, p.comment_count, NULL::uuid, true
      FROM comments c JOIN posts p ON p.id = c.post_id
      WHERE c.id = (v_replay->>'commentId')::uuid;
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

-- @function maintenance/fn_maint_purge_deleted_accounts.sql
-- Daily 03:30 (BR-AC-08, Schema §11): erases accounts that have been PENDING_DELETION for over
-- 30 days. First fixes the counters the account still contributes to other users and posts
-- (follows, likes, visible comments), queues every object under users/{id}/ for deletion, then
-- deletes the user row; everything that belongs to the user goes with it (foreign keys).
CREATE OR REPLACE FUNCTION fn_maint_purge_deleted_accounts(p_batch int DEFAULT 50)
RETURNS TABLE (processed int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(s.id) INTO v_ids FROM (
    SELECT u.id FROM users u
    WHERE u.status = 'PENDING_DELETION' AND u.deletion_requested_at < now() - INTERVAL '30 days'
    ORDER BY u.deletion_requested_at
    LIMIT GREATEST(p_batch, 1)
    FOR UPDATE SKIP LOCKED
  ) s;

  IF v_ids IS NULL THEN
    RETURN QUERY SELECT 0; RETURN;
  END IF;

  -- Posts first, then users: the lock order every procedure uses (no deadlocks).
  -- Other people's posts lose the deleted users' likes and visible comments.
  UPDATE posts p SET like_count = p.like_count - d.n
  FROM (SELECT l.post_id AS id, count(*)::int AS n FROM likes l JOIN posts x ON x.id = l.post_id
        WHERE l.user_id = ANY (v_ids) AND NOT (x.author_id = ANY (v_ids))
        GROUP BY l.post_id) d
  WHERE p.id = d.id;
  UPDATE posts p SET comment_count = p.comment_count - d.n
  FROM (SELECT k.post_id AS id, count(*)::int AS n FROM comments k JOIN posts x ON x.id = k.post_id
        WHERE k.author_id = ANY (v_ids) AND NOT (x.author_id = ANY (v_ids))
          AND k.deleted_at IS NULL AND k.hidden_at IS NULL
        GROUP BY k.post_id) d
  WHERE p.id = d.id;

  -- People the deleted users followed lose a follower; their followers follow one fewer.
  UPDATE users u SET follower_count = u.follower_count - d.n
  FROM (SELECT f.following_id AS id, count(*)::int AS n FROM follows f
        WHERE f.follower_id = ANY (v_ids) AND NOT (f.following_id = ANY (v_ids))
        GROUP BY f.following_id) d
  WHERE u.id = d.id;
  UPDATE users u SET following_count = u.following_count - d.n
  FROM (SELECT f.follower_id AS id, count(*)::int AS n FROM follows f
        WHERE f.following_id = ANY (v_ids) AND NOT (f.follower_id = ANY (v_ids))
        GROUP BY f.follower_id) d
  WHERE u.id = d.id;

  INSERT INTO pending_object_deletions (object_key, is_prefix)
  SELECT 'users/' || id || '/', true FROM unnest(v_ids) AS id;

  DELETE FROM users u WHERE u.id = ANY (v_ids);

  RETURN QUERY SELECT cardinality(v_ids);
END $$;
-- @end-function

-- @function maintenance/fn_maint_purge_deleted_content.sql
-- Daily 03:00 (Schema §11): permanently removes
--   posts deleted > 30 days ago, failed posts untouched for 30 days, and posts hidden by a
--   moderator > 90 days ago with no open report on them (their photos are queued for deletion);
--   comments deleted > 30 days ago, and hidden > 90 days ago with no open report.
-- Nothing with an OPEN or REVIEWING report is removed, so deleting reported content cannot destroy
-- the evidence before a moderator acts.
-- Likes, comments and notifications of a removed post go with it (foreign keys). Counters need no
-- change: none of this content is counted any more. Returns posts + comments removed.
CREATE OR REPLACE FUNCTION fn_maint_purge_deleted_content(p_batch int DEFAULT 500)
RETURNS TABLE (processed int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_posts    uuid[];
  v_media    uuid[];
  v_requeue  uuid[];
  v_comments int;
BEGIN
  SELECT array_agg(s.id) INTO v_posts FROM (
    SELECT p.id FROM posts p
    WHERE ((p.status = 'DELETED' AND p.deleted_at < now() - INTERVAL '30 days')
        OR (p.status = 'FAILED'  AND p.updated_at < now() - INTERVAL '30 days')
        OR (p.status = 'HIDDEN'  AND p.hidden_at  < now() - INTERVAL '90 days'))
      AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.target_post_id = p.id AND r.status IN ('OPEN', 'REVIEWING'))
    LIMIT GREATEST(p_batch, 1)
    FOR UPDATE SKIP LOCKED
  ) s;

  IF v_posts IS NOT NULL THEN
    SELECT array_agg(pm.media_id), array_agg(pm.media_id) FILTER (WHERE m.status <> 'DELETED')
    INTO v_media, v_requeue
    FROM post_media pm JOIN media_assets m ON m.id = pm.media_id
    WHERE pm.post_id = ANY (v_posts);

    IF v_requeue IS NOT NULL THEN
      PERFORM fn__queue_media_deletion(v_requeue);
    END IF;
    DELETE FROM posts p WHERE p.id = ANY (v_posts);
    DELETE FROM media_assets m WHERE m.id = ANY (COALESCE(v_media, '{}'));
  END IF;

  WITH gone AS (
    SELECT k.id FROM comments k
    WHERE ((k.deleted_at < now() - INTERVAL '30 days')
        OR (k.deleted_at IS NULL AND k.hidden_at < now() - INTERVAL '90 days'))
      AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.target_comment_id = k.id AND r.status IN ('OPEN', 'REVIEWING'))
    LIMIT GREATEST(p_batch, 1)
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM comments k USING gone WHERE k.id = gone.id;
  GET DIAGNOSTICS v_comments = ROW_COUNT;

  RETURN QUERY SELECT COALESCE(cardinality(v_posts), 0) + v_comments;
END $$;
-- @end-function

-- @function maintenance/fn_maint_reconcile_counters.sql
-- Daily 02:00 (Schema §1 "Counters"): recomputes the denormalised counters of rows that changed
-- since p_since and fixes any that drifted. NULL means the last 25 hours (the daily run); pass
-- '-infinity' for a full recount, which locks every post and user row: off-hours only.
-- Returns how many rows were wrong (reported as a metric; it should stay 0).
--   users.follower_count / following_count  rows in follows
--   users.post_count                        PUBLISHED posts
--   posts.like_count                        rows in likes
--   posts.comment_count                     comments neither deleted nor hidden
-- Rows are locked (posts first, then users, the order the procedures use) before counting, so a
-- concurrent like or follow is either fully counted or applies its own +1 / -1 afterwards.
CREATE OR REPLACE FUNCTION fn_maint_reconcile_counters(p_since timestamptz DEFAULT NULL)
RETURNS TABLE (drift int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_since timestamptz := COALESCE(p_since, now() - INTERVAL '25 hours');
  v_posts uuid[];
  v_users uuid[];
  v_drift int := 0;
  v_rows  int;
BEGIN
  SELECT array_agg(c.id ORDER BY c.id) INTO v_posts FROM (
    SELECT p.id FROM posts p WHERE p.updated_at >= v_since OR p.created_at >= v_since
    UNION SELECT l.post_id FROM likes l WHERE l.created_at >= v_since
    UNION SELECT k.post_id FROM comments k WHERE k.created_at >= v_since
  ) c;
  PERFORM 1 FROM posts p WHERE p.id = ANY (COALESCE(v_posts, '{}')) ORDER BY p.id FOR UPDATE;

  UPDATE posts p SET like_count = a.likes, comment_count = a.comments
  FROM (
    SELECT x.id,
           (SELECT count(*)::int FROM likes l WHERE l.post_id = x.id) AS likes,
           (SELECT count(*)::int FROM comments k WHERE k.post_id = x.id AND k.deleted_at IS NULL AND k.hidden_at IS NULL) AS comments
    FROM posts x WHERE x.id = ANY (COALESCE(v_posts, '{}'))
  ) a
  WHERE p.id = a.id AND (p.like_count, p.comment_count) IS DISTINCT FROM (a.likes, a.comments);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_drift := v_drift + v_rows;

  SELECT array_agg(c.id ORDER BY c.id) INTO v_users FROM (
    SELECT u.id FROM users u WHERE u.updated_at >= v_since OR u.created_at >= v_since
    UNION SELECT f.follower_id FROM follows f WHERE f.created_at >= v_since
    UNION SELECT f.following_id FROM follows f WHERE f.created_at >= v_since
    UNION SELECT p.author_id FROM posts p WHERE p.updated_at >= v_since
  ) c;
  PERFORM 1 FROM users u WHERE u.id = ANY (COALESCE(v_users, '{}')) ORDER BY u.id FOR UPDATE;

  UPDATE users u SET follower_count = a.followers, following_count = a.following, post_count = a.posts
  FROM (
    SELECT x.id,
           (SELECT count(*)::int FROM follows f WHERE f.following_id = x.id) AS followers,
           (SELECT count(*)::int FROM follows f WHERE f.follower_id = x.id) AS following,
           (SELECT count(*)::int FROM posts p WHERE p.author_id = x.id AND p.status = 'PUBLISHED') AS posts
    FROM users x WHERE x.id = ANY (COALESCE(v_users, '{}'))
  ) a
  WHERE u.id = a.id
    AND (u.follower_count, u.following_count, u.post_count) IS DISTINCT FROM (a.followers, a.following, a.posts);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_drift := v_drift + v_rows;

  RETURN QUERY SELECT v_drift;
END $$;
-- @end-function

-- @function maintenance/fn_maint_requeue_stuck_media.sql
-- Every 10 min (TRD §9): media stuck in UPLOADED / PROCESSING for over 10 minutes (lost queue job)
-- is returned for re-enqueueing; its updated_at is bumped so it is not returned again for another
-- 10 minutes. Media still unprocessed 24 hours after it was attached (uploaded_at) is given up
-- on: asset and post become FAILED.
CREATE OR REPLACE FUNCTION fn_maint_requeue_stuck_media(p_batch int DEFAULT 500)
RETURNS TABLE (media_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT m.id FROM media_assets m
    WHERE m.status IN ('UPLOADED', 'PROCESSING') AND COALESCE(m.uploaded_at, m.created_at) < now() - INTERVAL '24 hours'
    LIMIT GREATEST(p_batch, 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM fn_fail_media_processing(v_id, 'Processing did not finish within 24 hours');
  END LOOP;

  RETURN QUERY
  WITH stuck AS (
    SELECT m.id FROM media_assets m
    WHERE m.status IN ('UPLOADED', 'PROCESSING') AND m.updated_at < now() - INTERVAL '10 minutes'
    ORDER BY m.updated_at
    LIMIT GREATEST(p_batch, 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE media_assets m SET updated_at = now() FROM stuck WHERE m.id = stuck.id
  RETURNING m.id;
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
  v_replay  jsonb;
  v_post_id uuid;
  v_caption text := NULLIF(btrim(p_caption), '');
  v_media   record;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF p_idempotency_key IS NOT NULL THEN
    v_replay := fn__claim_idempotency_key(p_viewer_id, p_idempotency_key, c_route, p_request_hash);
    IF v_replay IS NOT NULL THEN
      RETURN QUERY
      SELECT p.id, p.status, p.caption, p.created_at, '{}'::uuid[], true
      FROM posts p WHERE p.id = (v_replay->>'postId')::uuid;
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

  UPDATE media_assets m SET status = 'UPLOADED', uploaded_at = now() WHERE m.id = ANY (p_media_ids);

  IF p_idempotency_key IS NOT NULL THEN
    UPDATE idempotency_keys k SET response_body = jsonb_build_object('postId', v_post_id)
    WHERE k.user_id = p_viewer_id AND k.key = p_idempotency_key;
  END IF;

  RETURN QUERY
  SELECT p.id, p.status, p.caption, p.created_at, p_media_ids, false
  FROM posts p WHERE p.id = v_post_id;
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
      UPDATE media_assets a SET status = 'UPLOADED', uploaded_at = now() WHERE a.id = v_new_avatar AND a.status = 'PENDING_UPLOAD';
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
