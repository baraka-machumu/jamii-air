-- CreateTable
CREATE TABLE "follows" (
    "follower_id" UUID NOT NULL,
    "following_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id","following_id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateIndex
CREATE INDEX "follows_following_id_created_at_idx" ON "follows"("following_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "follows_follower_id_created_at_idx" ON "follows"("follower_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "blocks_blocked_id_idx" ON "blocks"("blocked_id");

-- CreateIndex
CREATE INDEX "blocks_blocker_id_created_at_idx" ON "blocks"("blocker_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Constraints and search indexes (Schema §5; raw SQL) ─────────────

ALTER TABLE follows ADD CONSTRAINT follows_no_self CHECK (follower_id <> following_id);
ALTER TABLE blocks  ADD CONSTRAINT blocks_no_self  CHECK (blocker_id  <> blocked_id);

-- fn_search_users (TRD SR-01): gin_trgm_ops is defined for text, so index text expressions.
CREATE INDEX users_username_trgm_idx     ON users USING gin ((lower(username::text)) gin_trgm_ops);
CREATE INDEX users_display_name_trgm_idx ON users USING gin ((lower(display_name)) gin_trgm_ops);
-- Prefix matches (ranked first, any query length) read a btree in order.
CREATE INDEX users_username_prefix_idx     ON users ((lower(username::text)) text_pattern_ops);
CREATE INDEX users_display_name_prefix_idx ON users ((lower(display_name)) text_pattern_ops);

-- @function _common/fn__cursor.sql
-- Keyset cursor for newest-first lists (Schema §6 rule 7, TRD SP-08): a missing cursor becomes
-- the sentinel ('infinity', 'ffffffff-…') so one predicate `(created_at, id) < (cursor)` serves
-- every page. Also clamps the page size to 1–50 (default 20) and adds 1 for the has-next-page row.
CREATE OR REPLACE FUNCTION fn__cursor(
  p_time  timestamptz,
  p_id    uuid,
  p_limit int,
  OUT cursor_time timestamptz,
  OUT cursor_id   uuid,
  OUT page_limit  int)
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(p_time, 'infinity'::timestamptz),
         COALESCE(p_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid),
         LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50) + 1
$$;
-- @end-function

-- @function _common/fn__is_blocked_either_way.sql
-- True when a or b has blocked the other (Schema §7.1, AU-08).
CREATE OR REPLACE FUNCTION fn__is_blocked_either_way(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = p_a AND b.blocked_id = p_b)
       OR (b.blocker_id = p_b AND b.blocked_id = p_a))
$$;
-- @end-function

-- @function social/fn_block_user.sql
-- PUT /users/:id/block (BR-SF-01). Idempotent. Removes follows in both directions and fixes
-- the counters. From then on every read hides the two users from each other and follow / like /
-- comment between them is rejected.
CREATE OR REPLACE FUNCTION fn_block_user(p_viewer_id uuid, p_target_id uuid)
RETURNS TABLE (blocked boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF p_target_id = p_viewer_id THEN
    RAISE EXCEPTION USING ERRCODE = 'JA422', MESSAGE = 'CANNOT_BLOCK_SELF';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_target_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;

  PERFORM 1 FROM users u WHERE u.id IN (p_viewer_id, p_target_id) ORDER BY u.id FOR UPDATE;

  INSERT INTO blocks (blocker_id, blocked_id) VALUES (p_viewer_id, p_target_id) ON CONFLICT DO NOTHING;

  WITH removed AS (
    DELETE FROM follows f
    WHERE (f.follower_id = p_viewer_id AND f.following_id = p_target_id)
       OR (f.follower_id = p_target_id AND f.following_id = p_viewer_id)
    RETURNING f.follower_id, f.following_id
  ),
  deltas AS (
    SELECT r.follower_id AS id, -1 AS following_delta, 0 AS follower_delta FROM removed r
    UNION ALL
    SELECT r.following_id, 0, -1 FROM removed r
  )
  UPDATE users u
  SET following_count = u.following_count + d.following_delta,
      follower_count  = u.follower_count + d.follower_delta
  FROM (SELECT id, sum(following_delta)::int AS following_delta, sum(follower_delta)::int AS follower_delta
        FROM deltas GROUP BY id) d
  WHERE u.id = d.id;

  RETURN QUERY SELECT true;
END $$;
-- @end-function

-- @function social/fn_follow_user.sql
-- PUT /users/:id/follow (BR-PR-04). Idempotent: following someone twice changes nothing.
-- The target must be ACTIVE and must not have blocked the viewer (else JA404, the profile is
-- invisible); a viewer who blocked the target gets JA403 BLOCKED (BR-SF-01).
-- notification_id: the FOLLOW notification is added with the notifications migration (task 1.9).
CREATE OR REPLACE FUNCTION fn_follow_user(p_viewer_id uuid, p_target_id uuid)
RETURNS TABLE (following boolean, follower_count int, notification_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows  int;
  v_count int;
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
  ELSE
    SELECT u.follower_count INTO v_count FROM users u WHERE u.id = p_target_id;
  END IF;

  RETURN QUERY SELECT true, v_count, NULL::uuid;
END $$;
-- @end-function

-- @function social/fn_unblock_user.sql
-- DELETE /users/:id/block (BR-SF-01). Idempotent. Follows removed by the block stay removed.
CREATE OR REPLACE FUNCTION fn_unblock_user(p_viewer_id uuid, p_target_id uuid)
RETURNS TABLE (blocked boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_target_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;

  DELETE FROM blocks b WHERE b.blocker_id = p_viewer_id AND b.blocked_id = p_target_id;

  RETURN QUERY SELECT false;
END $$;
-- @end-function

-- @function social/fn_unfollow_user.sql
-- DELETE /users/:id/follow (BR-PR-04). Idempotent: unfollowing someone you don't follow is fine.
CREATE OR REPLACE FUNCTION fn_unfollow_user(p_viewer_id uuid, p_target_id uuid)
RETURNS TABLE (following boolean, follower_count int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows  int;
  v_count int;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_target_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;

  PERFORM 1 FROM users u WHERE u.id IN (p_viewer_id, p_target_id) ORDER BY u.id FOR UPDATE;

  DELETE FROM follows f WHERE f.follower_id = p_viewer_id AND f.following_id = p_target_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    UPDATE users u SET following_count = u.following_count - 1 WHERE u.id = p_viewer_id;
    UPDATE users u SET follower_count = u.follower_count - 1 WHERE u.id = p_target_id
    RETURNING u.follower_count INTO v_count;
  ELSE
    SELECT u.follower_count INTO v_count FROM users u WHERE u.id = p_target_id;
  END IF;

  RETURN QUERY SELECT false, v_count;
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
