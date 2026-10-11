-- CreateTable
CREATE TABLE "daily_metrics" (
    "day" DATE NOT NULL,
    "metric" VARCHAR(50) NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "daily_metrics_pkey" PRIMARY KEY ("day","metric")
);

-- ───────────── Indexes for the maintenance batches (Schema §7.7, §11; raw SQL) ─────────────

CREATE INDEX media_assets_pending_upload_idx ON media_assets (created_at) WHERE status = 'PENDING_UPLOAD';
CREATE INDEX media_assets_in_progress_idx    ON media_assets (updated_at) WHERE status IN ('UPLOADED', 'PROCESSING');
CREATE INDEX comments_removed_idx            ON comments (COALESCE(deleted_at, hidden_at))
  WHERE deleted_at IS NOT NULL OR hidden_at IS NOT NULL;
CREATE INDEX users_pending_deletion_idx      ON users (deletion_requested_at) WHERE status = 'PENDING_DELETION';
CREATE INDEX refresh_tokens_revoked_idx      ON refresh_tokens (revoked_at) WHERE revoked_at IS NOT NULL;
CREATE INDEX admin_sessions_revoked_idx      ON admin_sessions (revoked_at) WHERE revoked_at IS NOT NULL;
CREATE INDEX pending_object_deletions_done_idx ON pending_object_deletions (done_at) WHERE done_at IS NOT NULL;

-- @function admin/fn_admin_dashboard.sql
-- GET /admin/dashboard (BR-DI-01, App Flow §15.3): live counts plus the daily KPIs between p_from
-- and p_to (at most 366 days) as { "<metric>": [{ "day": "YYYY-MM-DD", "value": n }, ...] }.
CREATE OR REPLACE FUNCTION fn_admin_dashboard(p_admin_id uuid, p_from date, p_to date)
RETURNS TABLE (
  open_reports int, oldest_open_report_at timestamptz, suspended_users int,
  invites_remaining int, registered_users int, metrics jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_from date := COALESCE(p_from, current_date - 30);
  v_to   date := COALESCE(p_to, current_date);
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  v_from := GREATEST(v_from, v_to - 366);

  RETURN QUERY
  SELECT
    (SELECT count(*)::int FROM reports r WHERE r.status IN ('OPEN', 'REVIEWING')),
    (SELECT min(r.created_at) FROM reports r WHERE r.status IN ('OPEN', 'REVIEWING')),
    (SELECT count(*)::int FROM users u WHERE u.status = 'SUSPENDED'),
    (SELECT COALESCE(sum(i.max_uses - i.use_count), 0)::int FROM invite_codes i
     WHERE i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > now())),
    (SELECT count(*)::int FROM users u),
    COALESCE((
      SELECT jsonb_object_agg(s.metric, s.series) FROM (
        SELECT d.metric, jsonb_agg(jsonb_build_object('day', d.day, 'value', d.value) ORDER BY d.day) AS series
        FROM daily_metrics d WHERE d.day BETWEEN v_from AND v_to
        GROUP BY d.metric) s), '{}'::jsonb);
END $$;
-- @end-function

-- @function maintenance/fn_maint_claim_object_deletions.sql
-- Every 5 min (Schema §10): claims a batch of queued object-storage deletions. The worker deletes
-- the objects (a prefix means every object under it), then calls
-- fn_maint_complete_object_deletions. A claim not completed within 15 minutes is handed out again.
CREATE OR REPLACE FUNCTION fn_maint_claim_object_deletions(p_batch int DEFAULT 100)
RETURNS TABLE (deletion_id uuid, object_key text, is_prefix boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH batch AS (
    SELECT d.id FROM pending_object_deletions d
    WHERE d.done_at IS NULL AND (d.claimed_at IS NULL OR d.claimed_at < now() - INTERVAL '15 minutes')
    ORDER BY d.created_at
    LIMIT GREATEST(p_batch, 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE pending_object_deletions d SET claimed_at = now() FROM batch WHERE d.id = batch.id
  RETURNING d.id, d.object_key, d.is_prefix;
END $$;
-- @end-function

-- @function maintenance/fn_maint_cleanup_upload_intents.sql
-- Hourly (MD-07, Schema §11): upload intents never attached to a post or profile within 24 h are
-- marked DELETED and their objects queued for deletion. One batch per call; the worker calls it
-- until it returns 0 (Schema §6 rule 1).
CREATE OR REPLACE FUNCTION fn_maint_cleanup_upload_intents(p_batch int DEFAULT 500)
RETURNS TABLE (processed int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(s.id) INTO v_ids FROM (
    SELECT m.id FROM media_assets m
    WHERE m.status = 'PENDING_UPLOAD' AND m.created_at < now() - INTERVAL '24 hours'
    ORDER BY m.created_at
    LIMIT GREATEST(p_batch, 1)
    FOR UPDATE SKIP LOCKED
  ) s;

  IF v_ids IS NULL THEN
    RETURN QUERY SELECT 0; RETURN;
  END IF;
  PERFORM fn__queue_media_deletion(v_ids);
  RETURN QUERY SELECT cardinality(v_ids);
END $$;
-- @end-function

-- @function maintenance/fn_maint_complete_object_deletions.sql
-- Worker: marks claimed object deletions as done once the objects are gone from storage.
CREATE OR REPLACE FUNCTION fn_maint_complete_object_deletions(p_ids uuid[])
RETURNS TABLE (processed int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  UPDATE pending_object_deletions d SET done_at = now() WHERE d.id = ANY (p_ids) AND d.done_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN QUERY SELECT v_rows;
END $$;
-- @end-function

-- @function maintenance/fn_maint_compute_daily_metrics.sql
-- Daily 00:30 (BR-DI-01, TRD PA-02): KPIs for one calendar day in East Africa Time
-- (Africa/Dar_es_Salaam), upserted into daily_metrics, so it can be re-run for any day.
-- Returns the number of metrics written.
--   registered_users      accounts that exist at the end of the day
--   new_signups           accounts created that day
--   dau                   users active that day: opened the app (refresh-token rotation or new
--                         session) or posted, liked, commented or followed
--   posts, likes, comments, follows   created that day (and still existing)
--   retention_d1 / _d7 / _d30         % of the users who signed up 1 / 7 / 30 days earlier who
--                         were active that day (written only when that cohort is not empty)
--   new_user_follow_pct / new_user_post_pct   % of the users who signed up in the 7 days ending
--                         that day who follow someone / have posted (only when there are any)
CREATE OR REPLACE FUNCTION fn_maint_compute_daily_metrics(p_day date)
RETURNS TABLE (metrics int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c_tz    constant text := 'Africa/Dar_es_Salaam';
  v_from  timestamptz := p_day::timestamp AT TIME ZONE c_tz;
  v_to    timestamptz := (p_day + 1)::timestamp AT TIME ZONE c_tz;
  v_rows  int;
BEGIN
  WITH active AS (
    SELECT t.user_id AS id FROM refresh_tokens t WHERE t.created_at >= v_from AND t.created_at < v_to
    UNION SELECT u.id FROM users u WHERE u.last_active_at >= v_from AND u.last_active_at < v_to
    UNION SELECT p.author_id FROM posts p WHERE p.created_at >= v_from AND p.created_at < v_to
    UNION SELECT l.user_id FROM likes l WHERE l.created_at >= v_from AND l.created_at < v_to
    UNION SELECT k.author_id FROM comments k WHERE k.created_at >= v_from AND k.created_at < v_to
    UNION SELECT f.follower_id FROM follows f WHERE f.created_at >= v_from AND f.created_at < v_to
  ),
  counts(metric, value) AS (
    SELECT 'registered_users', count(*)::numeric FROM users u WHERE u.created_at < v_to
    UNION ALL SELECT 'new_signups', count(*) FROM users u WHERE u.created_at >= v_from AND u.created_at < v_to
    UNION ALL SELECT 'dau', count(*) FROM active
    UNION ALL SELECT 'posts', count(*) FROM posts p WHERE p.created_at >= v_from AND p.created_at < v_to AND p.status <> 'FAILED'
    UNION ALL SELECT 'likes', count(*) FROM likes l WHERE l.created_at >= v_from AND l.created_at < v_to
    UNION ALL SELECT 'comments', count(*) FROM comments k WHERE k.created_at >= v_from AND k.created_at < v_to
    UNION ALL SELECT 'follows', count(*) FROM follows f WHERE f.created_at >= v_from AND f.created_at < v_to
  ),
  retention(metric, value) AS (
    SELECT 'retention_d' || n,
           round(100.0 * count(a.id) / count(*), 4)
    FROM unnest(ARRAY[1, 7, 30]) AS n
    JOIN users u ON u.created_at >= v_from - make_interval(days => n) AND u.created_at < v_to - make_interval(days => n)
    LEFT JOIN active a ON a.id = u.id
    GROUP BY n
  ),
  new_users AS (
    SELECT u.id FROM users u WHERE u.created_at >= v_from - INTERVAL '6 days' AND u.created_at < v_to
  ),
  activation(metric, value) AS (
    SELECT 'new_user_follow_pct',
           round(100.0 * count(*) FILTER (WHERE EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = nu.id)) / count(*), 4)
    FROM new_users nu HAVING count(*) > 0
    UNION ALL
    SELECT 'new_user_post_pct',
           round(100.0 * count(*) FILTER (WHERE EXISTS (SELECT 1 FROM posts p WHERE p.author_id = nu.id AND p.status <> 'FAILED')) / count(*), 4)
    FROM new_users nu HAVING count(*) > 0
  )
  INSERT INTO daily_metrics (day, metric, value)
  SELECT p_day, m.metric, m.value FROM (
    SELECT * FROM counts UNION ALL SELECT * FROM retention UNION ALL SELECT * FROM activation
  ) m
  ON CONFLICT (day, metric) DO UPDATE SET value = EXCLUDED.value;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN QUERY SELECT v_rows;
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
    WHERE (p.status = 'DELETED' AND p.deleted_at < now() - INTERVAL '30 days')
       OR (p.status = 'FAILED'  AND p.updated_at < now() - INTERVAL '30 days')
       OR (p.status = 'HIDDEN'  AND p.hidden_at  < now() - INTERVAL '90 days'
           AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.target_post_id = p.id AND r.status IN ('OPEN', 'REVIEWING')))
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
    WHERE (k.deleted_at < now() - INTERVAL '30 days')
       OR (k.deleted_at IS NULL AND k.hidden_at < now() - INTERVAL '90 days'
           AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.target_comment_id = k.id AND r.status IN ('OPEN', 'REVIEWING')))
    LIMIT GREATEST(p_batch, 1)
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM comments k USING gone WHERE k.id = gone.id;
  GET DIAGNOSTICS v_comments = ROW_COUNT;

  RETURN QUERY SELECT COALESCE(cardinality(v_posts), 0) + v_comments;
END $$;
-- @end-function

-- @function maintenance/fn_maint_purge_expired_tokens.sql
-- Daily (Schema §11): refresh tokens and admin sessions 7 days after expiry or revocation,
-- password-reset codes after 24 hours, finished object deletions after 7 days.
-- Up to p_batch rows of each kind per call; returns the rows removed.
CREATE OR REPLACE FUNCTION fn_maint_purge_expired_tokens(p_batch int DEFAULT 1000)
RETURNS TABLE (processed int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_total int := 0;
  v_rows  int;
  v_limit int := GREATEST(p_batch, 1);
BEGIN
  DELETE FROM refresh_tokens t WHERE t.id IN (
    SELECT x.id FROM refresh_tokens x
    WHERE x.revoked_at < now() - INTERVAL '7 days' OR x.expires_at < now() - INTERVAL '7 days'
    LIMIT v_limit);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  DELETE FROM admin_sessions s WHERE s.id IN (
    SELECT x.id FROM admin_sessions x
    WHERE x.revoked_at < now() - INTERVAL '7 days' OR x.absolute_expires_at < now() - INTERVAL '7 days'
    LIMIT v_limit);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  DELETE FROM password_reset_codes c WHERE c.id IN (
    SELECT x.id FROM password_reset_codes x WHERE x.created_at < now() - INTERVAL '24 hours' LIMIT v_limit);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  DELETE FROM pending_object_deletions d WHERE d.id IN (
    SELECT x.id FROM pending_object_deletions x WHERE x.done_at < now() - INTERVAL '7 days' LIMIT v_limit);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  RETURN QUERY SELECT v_total;
END $$;
-- @end-function

-- @function maintenance/fn_maint_purge_idempotency_keys.sql
-- Hourly (API-08, Schema §11): Idempotency-Keys older than 24 hours.
CREATE OR REPLACE FUNCTION fn_maint_purge_idempotency_keys(p_batch int DEFAULT 5000)
RETURNS TABLE (processed int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  DELETE FROM idempotency_keys k WHERE (k.user_id, k.key) IN (
    SELECT x.user_id, x.key FROM idempotency_keys x
    WHERE x.created_at < now() - INTERVAL '24 hours'
    LIMIT GREATEST(p_batch, 1));
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN QUERY SELECT v_rows;
END $$;
-- @end-function

-- @function maintenance/fn_maint_purge_old_notifications.sql
-- Daily (Schema §11): notifications older than 90 days.
CREATE OR REPLACE FUNCTION fn_maint_purge_old_notifications(p_batch int DEFAULT 5000)
RETURNS TABLE (processed int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  DELETE FROM notifications n WHERE n.id IN (
    SELECT x.id FROM notifications x
    WHERE x.created_at < now() - INTERVAL '90 days'
    LIMIT GREATEST(p_batch, 1));
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN QUERY SELECT v_rows;
END $$;
-- @end-function

-- @function maintenance/fn_maint_reconcile_counters.sql
-- Daily 02:00 (Schema §1 "Counters"): recomputes the denormalised counters of rows that changed
-- since p_since (NULL = every row) and fixes any that drifted. Returns how many rows were wrong
-- (reported as a metric; it should stay 0).
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
  v_since timestamptz := COALESCE(p_since, '-infinity');
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
-- 10 minutes. Media stuck for over 24 hours is given up on: asset and post become FAILED.
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
    WHERE m.status IN ('UPLOADED', 'PROCESSING') AND m.created_at < now() - INTERVAL '24 hours'
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

-- @function _common/fn__assert_admin.sql
-- Raises JA403 ADMIN_FORBIDDEN unless the admin exists, is ACTIVE, is not locked (AP-07) and has
-- one of p_roles (Schema §7.1). Defense in depth: the API's admin guards check roles first, and a
-- lock takes effect at once, even while an access token is still valid.
CREATE OR REPLACE FUNCTION fn__assert_admin(p_admin_id uuid, p_roles admin_role[])
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role   admin_role;
  v_status admin_status;
  v_locked boolean;
BEGIN
  SELECT a.role, a.status, a.locked_at IS NOT NULL INTO v_role, v_status, v_locked
  FROM admin_users a WHERE a.id = p_admin_id;

  IF NOT FOUND OR v_status <> 'ACTIVE' OR v_locked OR NOT (v_role = ANY (p_roles)) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'ADMIN_FORBIDDEN';
  END IF;
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
