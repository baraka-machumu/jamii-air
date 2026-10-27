-- Increment A 2026-10-27 (BRS §6.2): private accounts (BR-PR-06…09). The notification types
-- were added by the previous migration, because Postgres will not let a value added by
-- ALTER TYPE ... ADD VALUE be used in the transaction that added it.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_private" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "follow_requests" (
    "requester_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_requests_pkey" PRIMARY KEY ("requester_id","target_id")
);

-- CreateIndex
CREATE INDEX "follow_requests_target_id_created_at_idx" ON "follow_requests"("target_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "follow_requests" ADD CONSTRAINT "follow_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_requests" ADD CONSTRAINT "follow_requests_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Constraints, indexes and grants (Schema §5, §9; raw SQL) ─────────────

ALTER TABLE follow_requests ADD CONSTRAINT follow_requests_not_self CHECK (requester_id <> target_id);

-- One pending request per pair is the primary key; one notification per request and one
-- "accepted" per pair, as FOLLOW already has (BR-NT-04: no repeated notifications).
CREATE UNIQUE INDEX notifications_follow_request_dedupe  ON notifications (recipient_id, actor_id) WHERE type = 'FOLLOW_REQUEST';
CREATE UNIQUE INDEX notifications_follow_accepted_dedupe ON notifications (recipient_id, actor_id) WHERE type = 'FOLLOW_ACCEPTED';

-- FOLLOW_REQUEST and FOLLOW_ACCEPTED are about a person, like FOLLOW: no post, no comment.
ALTER TABLE notifications DROP CONSTRAINT notifications_target;
ALTER TABLE notifications ADD CONSTRAINT notifications_target CHECK (
  (type IN ('FOLLOW', 'FOLLOW_REQUEST', 'FOLLOW_ACCEPTED') AND post_id IS NULL AND comment_id IS NULL) OR
  (type = 'LIKE'    AND post_id IS NOT NULL AND comment_id IS NULL) OR
  (type = 'COMMENT' AND post_id IS NOT NULL AND comment_id IS NOT NULL) OR
  (type = 'REPLY'   AND post_id IS NOT NULL AND comment_id IS NOT NULL));

-- GET /me reads its own row through Prisma (TRD §6.1). follow_requests has no grant at all:
-- only procedures read or write it.
GRANT SELECT (is_private) ON users TO jamii_app;

-- These procedures change their result columns, which CREATE OR REPLACE cannot do; drop the
-- old versions first (the new ones are created below).
--   fn_follow_user, fn_unfollow_user                     + requested
--   fn_get_profile                                       + is_private, can_see_content, follow_requested, follow_request_count
--   fn_get_followers, fn_get_following, fn_search_users  + follow_requested
--   fn_get_notifications                                 + actor_follow_requested
--   fn_update_profile, fn_admin_get_user                 + is_private
DROP FUNCTION IF EXISTS fn_follow_user(uuid, uuid);
DROP FUNCTION IF EXISTS fn_unfollow_user(uuid, uuid);
DROP FUNCTION IF EXISTS fn_get_profile(uuid, text);
DROP FUNCTION IF EXISTS fn_get_followers(uuid, text, timestamptz, uuid, int);
DROP FUNCTION IF EXISTS fn_get_following(uuid, text, timestamptz, uuid, int);
DROP FUNCTION IF EXISTS fn_search_users(uuid, text, int);
DROP FUNCTION IF EXISTS fn_get_notifications(uuid, timestamptz, uuid, int);
DROP FUNCTION IF EXISTS fn_update_profile(uuid, jsonb);
DROP FUNCTION IF EXISTS fn_admin_get_user(uuid, uuid);

-- @function _common/fn__assert_post_visible.sql
-- Returns the author of a post the viewer may see and interact with: PUBLISHED, author ACTIVE,
-- no block either way, and the author public or followed by the viewer (BR-PR-08). Anything else
-- raises JA404 POST_NOT_FOUND (AU-08) — a private post looks exactly like a deleted one.
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

  IF NOT FOUND OR fn__is_blocked_either_way(p_viewer_id, v_author_id)
     OR NOT fn__can_see_content(p_viewer_id, v_author_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'POST_NOT_FOUND';
  END IF;
  RETURN v_author_id;
END $$;
-- @end-function

-- @function _common/fn__can_see_content.sql
-- Whether the viewer may see an account's posts and its follower / following lists (BR-PR-08):
-- their own, any public account's, and a private account's once they are an approved follower.
-- Only the private-account rule: status and blocks are checked by the callers, as before.
CREATE OR REPLACE FUNCTION fn__can_see_content(p_viewer_id uuid, p_author_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_viewer_id = p_author_id
      OR NOT COALESCE((SELECT u.is_private FROM users u WHERE u.id = p_author_id), false)
      OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = p_viewer_id AND f.following_id = p_author_id)
$$;
-- @end-function

-- @function admin/fn_admin_get_user.sql
-- GET /admin/users/:id (App Flow §15.5): account, status history fields, recent posts (any status),
-- reports against the user and moderation history. Never the date of birth or hashes.
-- is_private (BR-PR-06) is shown, not enforced: moderators see every account's content.
CREATE OR REPLACE FUNCTION fn_admin_get_user(p_admin_id uuid, p_user_id uuid)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, bio varchar, email citext, status user_status,
  avatar_m_key text, locale varchar, post_count int, follower_count int, following_count int,
  invite_code varchar, suspended_at timestamptz, deletion_requested_at timestamptz,
  last_active_at timestamptz, created_at timestamptz, reports_filed int, active_sessions int,
  recent_posts jsonb, reports_against jsonb, moderation_history jsonb, is_private boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.bio, u.email, u.status, av.object_key, u.locale,
         u.post_count, u.follower_count, u.following_count, i.code,
         u.suspended_at, u.deletion_requested_at, u.last_active_at, u.created_at,
         (SELECT count(*)::int FROM reports r WHERE r.reporter_id = u.id),
         (SELECT count(DISTINCT t.family_id)::int FROM refresh_tokens t
          WHERE t.user_id = u.id AND t.revoked_at IS NULL AND t.expires_at > now()),
         COALESCE((
           SELECT jsonb_agg(x.item ORDER BY x.created_at DESC) FROM (
             SELECT p.created_at, jsonb_build_object('postId', p.id, 'status', p.status, 'caption', left(p.caption, 140),
                      'thumbKey', tv.object_key, 'likeCount', p.like_count, 'commentCount', p.comment_count,
                      'createdAt', p.created_at) AS item
             FROM posts p
             LEFT JOIN post_media pm ON pm.post_id = p.id AND pm.position = 0
             LEFT JOIN media_variants tv ON tv.media_id = pm.media_id AND tv.variant = 'THUMB'
             WHERE p.author_id = u.id
             ORDER BY p.created_at DESC LIMIT 30) x), '[]'::jsonb),
         COALESCE((
           SELECT jsonb_agg(x.item ORDER BY x.created_at DESC) FROM (
             SELECT r.created_at, jsonb_build_object('reportId', r.id, 'status', r.status, 'reason', r.reason,
                      'targetType', r.target_type, 'createdAt', r.created_at) AS item
             FROM reports r WHERE r.reported_user_id = u.id
             ORDER BY r.created_at DESC LIMIT 30) x), '[]'::jsonb),
         COALESCE((
           SELECT jsonb_agg(x.item ORDER BY x.created_at DESC) FROM (
             SELECT m.created_at, jsonb_build_object('action', m.action, 'note', m.note, 'adminName', a.display_name,
                      'postId', m.target_post_id, 'commentId', m.target_comment_id, 'createdAt', m.created_at) AS item
             FROM moderation_actions m JOIN admin_users a ON a.id = m.admin_id
             WHERE m.target_user_id = u.id
             ORDER BY m.created_at DESC LIMIT 30) x), '[]'::jsonb),
         u.is_private
  FROM users u
  LEFT JOIN invite_codes i ON i.id = u.invite_code_id
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_M'
  WHERE u.id = p_user_id;
END $$;
-- @end-function

-- @function feed/fn_get_hashtag_posts.sql
-- GET /tags/:tag/posts (BR-FD-11). The posts carrying one tag, newest first, as grid tiles.
-- Visibility matches the feed and the profile grid: PUBLISHED posts only, author ACTIVE, and
-- nothing either way across a block — so a tag never becomes a way around a block — and nothing
-- from a private account the viewer does not follow (BR-PR-08), counted the same way.
-- Unlike the home feed this is NOT limited to people the viewer follows: a tag is how the pilot
-- finds posts from accounts it does not follow yet.
-- An unknown tag is not an error, it is an empty page, which is also what the screen shows for a
-- tag whose every post is gone. post_count repeats on each row and counts every PUBLISHED post
-- on the tag BEFORE the viewer's own blocks are applied, so the header reads the same for
-- everyone and tells nobody who blocked whom; an empty page carries no count, and the API
-- reports 0.
CREATE OR REPLACE FUNCTION fn_get_hashtag_posts(
  p_viewer_id   uuid,
  p_tag         text,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  post_id uuid, status post_status, type post_type, thumb_key text, blurhash varchar,
  media_count int, created_at timestamptz, tag citext, post_count int)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_tag        citext := NULLIF(btrim(ltrim(btrim(COALESCE(p_tag, '')), '#')), '')::citext;
  v_hashtag_id uuid;
  v_count      int := 0;
  c            record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF v_tag IS NULL OR v_tag !~ '^[[:alnum:]_]{1,64}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'TAG_INVALID';
  END IF;

  SELECT h.id INTO v_hashtag_id FROM hashtags h WHERE h.tag = v_tag;
  IF v_hashtag_id IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM post_hashtags ph
  JOIN posts p ON p.id = ph.post_id AND p.status = 'PUBLISHED'
  JOIN users u ON u.id = p.author_id AND u.status = 'ACTIVE'
  WHERE ph.hashtag_id = v_hashtag_id
    AND fn__can_see_content(p_viewer_id, p.author_id);

  RETURN QUERY
  SELECT p.id, p.status, p.type, tv.object_key, ma.blurhash,
         (SELECT count(*)::int FROM post_media x WHERE x.post_id = p.id),
         p.created_at, v_tag, v_count
  FROM post_hashtags ph
  JOIN posts p ON p.id = ph.post_id AND p.status = 'PUBLISHED'
  JOIN users u ON u.id = p.author_id AND u.status = 'ACTIVE'
  LEFT JOIN post_media pm ON pm.post_id = p.id AND pm.position = 0
  LEFT JOIN media_assets ma ON ma.id = pm.media_id
  LEFT JOIN media_variants tv ON tv.media_id = pm.media_id AND tv.variant = 'THUMB'
  WHERE ph.hashtag_id = v_hashtag_id
    AND (p.created_at, p.id) < (c.cursor_time, c.cursor_id)
    AND fn__can_see_content(p_viewer_id, p.author_id)
    AND NOT EXISTS (SELECT 1 FROM blocks b
                    WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = p.author_id)
                       OR (b.blocker_id = p.author_id AND b.blocked_id = p_viewer_id))
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT c.page_limit;
END $$;
-- @end-function

-- @function feed/fn_get_profile_posts.sql
-- GET /users/:username/posts (profile grid, BR-PR-01). Newest first, keyset paging. Other people
-- see PUBLISHED posts; on their own profile the viewer also sees PROCESSING and FAILED posts, and
-- HIDDEN ones (shown as "Removed for violating Community Guidelines", App Flow §10.3).
-- JA404 under the same rules as fn_get_profile; empty when the viewer blocked the profile, and
-- for a private account the viewer does not follow (BR-PR-08).
-- `type` and `media_count` are what the tile badges are drawn from: a play triangle on a video
-- (BR-CT-07) and a carousel marker when the post holds more than one photo (BR-CT-09).
CREATE OR REPLACE FUNCTION fn_get_profile_posts(
  p_viewer_id   uuid,
  p_username    text,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  post_id uuid, status post_status, type post_type, thumb_key text, blurhash varchar,
  media_count int, created_at timestamptz)
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
  IF t.blocked_by_me OR NOT fn__can_see_content(p_viewer_id, t.target_id) THEN
    RETURN;
  END IF;

  IF t.target_id = p_viewer_id THEN
    RETURN QUERY
    SELECT p.id, p.status, p.type, tv.object_key, ma.blurhash,
           (SELECT count(*)::int FROM post_media x WHERE x.post_id = p.id), p.created_at
    FROM posts p
    LEFT JOIN post_media pm ON pm.post_id = p.id AND pm.position = 0
    LEFT JOIN media_assets ma ON ma.id = pm.media_id
    LEFT JOIN media_variants tv ON tv.media_id = pm.media_id AND tv.variant = 'THUMB'
    WHERE p.author_id = p_viewer_id
      AND p.status IN ('PROCESSING', 'PUBLISHED', 'FAILED', 'HIDDEN')
      AND (p.created_at, p.id) < (c.cursor_time, c.cursor_id)
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT c.page_limit;
  ELSE
    RETURN QUERY
    SELECT p.id, p.status, p.type, tv.object_key, ma.blurhash,
           (SELECT count(*)::int FROM post_media x WHERE x.post_id = p.id), p.created_at
    FROM posts p
    LEFT JOIN post_media pm ON pm.post_id = p.id AND pm.position = 0
    LEFT JOIN media_assets ma ON ma.id = pm.media_id
    LEFT JOIN media_variants tv ON tv.media_id = pm.media_id AND tv.variant = 'THUMB'
    WHERE p.author_id = t.target_id
      AND p.status = 'PUBLISHED'
      AND (p.created_at, p.id) < (c.cursor_time, c.cursor_id)
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT c.page_limit;
  END IF;
END $$;
-- @end-function

-- @function notifications/fn_get_notifications.sql
-- GET /notifications (BR-NT-02, Activity screen). Newest first, keyset paging. Hides actors who
-- are not ACTIVE or blocked either way. A notification whose post or comment was since deleted
-- or hidden stays in the list with target_available = false (the app shows "no longer available")
-- and without thumbnail or excerpt. FOLLOW_REQUEST and FOLLOW_ACCEPTED (BR-PR-07) are about a
-- person, like FOLLOW, so always available; a request that was accepted, declined or cancelled
-- took its notification with it. actor_follow_requested: the viewer has asked to follow the actor.
CREATE OR REPLACE FUNCTION fn_get_notifications(
  p_viewer_id   uuid,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  notification_id uuid, type notification_type, created_at timestamptz, read_at timestamptz,
  actor_id uuid, actor_username citext, actor_display_name varchar, actor_avatar_key text,
  actor_followed_by_me boolean,
  post_id uuid, post_thumb_key text, comment_id uuid, comment_excerpt text, target_available boolean,
  actor_follow_requested boolean)
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
         t.available,
         EXISTS (SELECT 1 FROM follow_requests r WHERE r.requester_id = p_viewer_id AND r.target_id = a.id)
  FROM notifications n
  JOIN users a ON a.id = n.actor_id AND a.status = 'ACTIVE'
  LEFT JOIN media_variants av ON av.media_id = a.avatar_media_id AND av.variant = 'AVATAR_S'
  LEFT JOIN posts p ON p.id = n.post_id
  LEFT JOIN comments k ON k.id = n.comment_id
  LEFT JOIN post_media pm ON pm.post_id = n.post_id AND pm.position = 0
  LEFT JOIN media_variants tv ON tv.media_id = pm.media_id AND tv.variant = 'THUMB'
  CROSS JOIN LATERAL (
    SELECT CASE n.type
             WHEN 'FOLLOW'          THEN true
             WHEN 'FOLLOW_REQUEST'  THEN true
             WHEN 'FOLLOW_ACCEPTED' THEN true
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

-- @function social/fn_accept_follow_request.sql
-- POST /me/follow-requests/:userId/accept (BR-PR-07). The request becomes a follow: counters
-- move, the request's "asked to follow you" notification goes, the viewer's Activity gets the
-- ordinary "started following you" row (already read: it is their own action, so no push), and
-- the requester is told (FOLLOW_ACCEPTED, once per pair, BR-NT-04).
-- Idempotent: accepting someone who already follows changes nothing. No request and no follow:
-- JA404 FOLLOW_REQUEST_NOT_FOUND (a cancelled request, or a requester since suspended).
-- notification_id: the FOLLOW_ACCEPTED notification for the push job, or null.
CREATE OR REPLACE FUNCTION fn_accept_follow_request(p_viewer_id uuid, p_requester_id uuid)
RETURNS TABLE (follower_count int, notification_id uuid)
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

  -- Lock both users in id order, as fn_follow_user does, so the two cannot deadlock.
  PERFORM 1 FROM users u WHERE u.id IN (p_viewer_id, p_requester_id) ORDER BY u.id FOR UPDATE;

  -- A requester who is no longer ACTIVE, or is blocked either way, is not in the list either.
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_requester_id AND u.status = 'ACTIVE')
     OR fn__is_blocked_either_way(p_viewer_id, p_requester_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'FOLLOW_REQUEST_NOT_FOUND';
  END IF;

  DELETE FROM follow_requests r WHERE r.requester_id = p_requester_id AND r.target_id = p_viewer_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    IF NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = p_requester_id AND f.following_id = p_viewer_id) THEN
      RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'FOLLOW_REQUEST_NOT_FOUND';
    END IF;
    SELECT u.follower_count INTO v_count FROM users u WHERE u.id = p_viewer_id;
    RETURN QUERY SELECT v_count, NULL::uuid;
    RETURN;
  END IF;

  DELETE FROM notifications n
  WHERE n.recipient_id = p_viewer_id AND n.actor_id = p_requester_id AND n.type = 'FOLLOW_REQUEST';

  INSERT INTO follows (follower_id, following_id) VALUES (p_requester_id, p_viewer_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 1 THEN
    UPDATE users u SET following_count = u.following_count + 1 WHERE u.id = p_requester_id;
    UPDATE users u SET follower_count = u.follower_count + 1 WHERE u.id = p_viewer_id;
  END IF;
  SELECT u.follower_count INTO v_count FROM users u WHERE u.id = p_viewer_id;

  INSERT INTO notifications (recipient_id, actor_id, type, read_at)
  VALUES (p_viewer_id, p_requester_id, 'FOLLOW', now())
  ON CONFLICT DO NOTHING;

  INSERT INTO notifications (recipient_id, actor_id, type)
  VALUES (p_requester_id, p_viewer_id, 'FOLLOW_ACCEPTED')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_notif_id;

  RETURN QUERY SELECT v_count, v_notif_id;
END $$;
-- @end-function

-- @function social/fn_block_user.sql
-- PUT /users/:id/block (BR-SF-01). Idempotent. Removes follows and follow requests in both
-- directions and fixes the counters. From then on every read hides the two users from each other and follow / like /
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

  DELETE FROM follow_requests r
  WHERE (r.requester_id = p_viewer_id AND r.target_id = p_target_id)
     OR (r.requester_id = p_target_id AND r.target_id = p_viewer_id);

  DELETE FROM follow_requests r
  WHERE (r.requester_id = p_viewer_id AND r.target_id = p_target_id)
     OR (r.requester_id = p_target_id AND r.target_id = p_viewer_id);

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

-- @function social/fn_decline_follow_request.sql
-- DELETE /me/follow-requests/:userId (BR-PR-07). Idempotent. The request and its "asked to
-- follow you" notification go; the requester is not told and may ask again.
CREATE OR REPLACE FUNCTION fn_decline_follow_request(p_viewer_id uuid, p_requester_id uuid)
RETURNS TABLE (declined boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  DELETE FROM follow_requests r WHERE r.requester_id = p_requester_id AND r.target_id = p_viewer_id;
  DELETE FROM notifications n
  WHERE n.recipient_id = p_viewer_id AND n.actor_id = p_requester_id AND n.type = 'FOLLOW_REQUEST';

  RETURN QUERY SELECT true;
END $$;
-- @end-function

-- @function social/fn_follow_user.sql
-- PUT /users/:id/follow (BR-PR-04). Idempotent: following someone twice changes nothing.
-- A PRIVATE account is not followed but asked (BR-PR-07): a follow request and a FOLLOW_REQUEST
-- notification, and requested = true. Asking twice changes nothing.
-- A PRIVATE account is not followed but asked (BR-PR-07): a follow request and a FOLLOW_REQUEST
-- notification, and requested = true. Asking twice changes nothing.
-- The target must be ACTIVE and must not have blocked the viewer (else JA404, the profile is
-- invisible); a viewer who blocked the target gets JA403 BLOCKED (BR-SF-01).
-- notification_id: the new FOLLOW or FOLLOW_REQUEST notification; null when nothing changed or
-- the target was already notified about this viewer (unfollow → follow notifies once, BR-NT-04).
CREATE OR REPLACE FUNCTION fn_follow_user(p_viewer_id uuid, p_target_id uuid)
RETURNS TABLE (following boolean, requested boolean, follower_count int, notification_id uuid)
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

  IF NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = p_viewer_id AND f.following_id = p_target_id)
     AND (SELECT u.is_private FROM users u WHERE u.id = p_target_id) THEN
    INSERT INTO follow_requests (requester_id, target_id) VALUES (p_viewer_id, p_target_id) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 1 THEN
      INSERT INTO notifications (recipient_id, actor_id, type)
      VALUES (p_target_id, p_viewer_id, 'FOLLOW_REQUEST')
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_notif_id;
    END IF;
    SELECT u.follower_count INTO v_count FROM users u WHERE u.id = p_target_id;
    RETURN QUERY SELECT false, true, v_count, v_notif_id;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = p_viewer_id AND f.following_id = p_target_id)
     AND (SELECT u.is_private FROM users u WHERE u.id = p_target_id) THEN
    INSERT INTO follow_requests (requester_id, target_id) VALUES (p_viewer_id, p_target_id) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 1 THEN
      INSERT INTO notifications (recipient_id, actor_id, type)
      VALUES (p_target_id, p_viewer_id, 'FOLLOW_REQUEST')
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_notif_id;
    END IF;
    SELECT u.follower_count INTO v_count FROM users u WHERE u.id = p_target_id;
    RETURN QUERY SELECT false, true, v_count, v_notif_id;
    RETURN;
  END IF;

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

  RETURN QUERY SELECT true, false, v_count, v_notif_id;
END $$;
-- @end-function

-- @function social/fn_get_follow_requests.sql
-- GET /me/follow-requests (BR-PR-07). The people asking to follow the viewer, newest first;
-- cursor = the last row's (requested_at, user_id). Hides requesters who are not ACTIVE or are
-- blocked either way, as every list does. is_following drives "Follow back" once accepted.
CREATE OR REPLACE FUNCTION fn_get_follow_requests(
  p_viewer_id   uuid,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, avatar_s_key text,
  is_following boolean, requested_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, av.object_key,
         EXISTS (SELECT 1 FROM follows mine WHERE mine.follower_id = p_viewer_id AND mine.following_id = u.id),
         r.created_at
  FROM follow_requests r
  JOIN users u ON u.id = r.requester_id AND u.status = 'ACTIVE'
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE r.target_id = p_viewer_id
    AND (r.created_at, r.requester_id) < (c.cursor_time, c.cursor_id)
    AND NOT fn__is_blocked_either_way(p_viewer_id, u.id)
  ORDER BY r.created_at DESC, r.requester_id DESC
  LIMIT c.page_limit;
END $$;
-- @end-function

-- @function social/fn_get_followers.sql
-- GET /users/:username/followers (BR-PR-05, Should). Newest follow first; cursor = the last
-- row's (followed_at, user_id). Hides non-ACTIVE users and users blocked either way with the viewer.
-- Empty for a private account the viewer does not follow (BR-PR-08). follow_requested: the viewer
-- has asked to follow that row's user, so its button reads Requested.
CREATE OR REPLACE FUNCTION fn_get_followers(
  p_viewer_id   uuid,
  p_username    text,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, avatar_s_key text,
  is_following boolean, is_me boolean, followed_at timestamptz, follow_requested boolean)
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
  IF t.blocked_by_me OR NOT fn__can_see_content(p_viewer_id, t.target_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, av.object_key,
         EXISTS (SELECT 1 FROM follows mine WHERE mine.follower_id = p_viewer_id AND mine.following_id = u.id),
         u.id = p_viewer_id,
         f.created_at,
         EXISTS (SELECT 1 FROM follow_requests r WHERE r.requester_id = p_viewer_id AND r.target_id = u.id)
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
-- GET /users/:username/following (BR-PR-05, Should). Same shape and rules as fn_get_followers,
-- including the private-account rule (BR-PR-08).
CREATE OR REPLACE FUNCTION fn_get_following(
  p_viewer_id   uuid,
  p_username    text,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, avatar_s_key text,
  is_following boolean, is_me boolean, followed_at timestamptz, follow_requested boolean)
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
  IF t.blocked_by_me OR NOT fn__can_see_content(p_viewer_id, t.target_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, av.object_key,
         EXISTS (SELECT 1 FROM follows mine WHERE mine.follower_id = p_viewer_id AND mine.following_id = u.id),
         u.id = p_viewer_id,
         f.created_at,
         EXISTS (SELECT 1 FROM follow_requests r WHERE r.requester_id = p_viewer_id AND r.target_id = u.id)
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

-- @function social/fn_remove_follower.sql
-- DELETE /me/followers/:userId (BR-PR-09). Idempotent. The follower stops following the viewer
-- and is not told; on a private account they lose its posts until they ask again and are accepted.
CREATE OR REPLACE FUNCTION fn_remove_follower(p_viewer_id uuid, p_follower_id uuid)
RETURNS TABLE (follower_count int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows  int;
  v_count int;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  PERFORM 1 FROM users u WHERE u.id IN (p_viewer_id, p_follower_id) ORDER BY u.id FOR UPDATE;

  DELETE FROM follows f WHERE f.follower_id = p_follower_id AND f.following_id = p_viewer_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 1 THEN
    UPDATE users u SET following_count = u.following_count - 1 WHERE u.id = p_follower_id;
    UPDATE users u SET follower_count = u.follower_count - 1 WHERE u.id = p_viewer_id;
  END IF;

  SELECT u.follower_count INTO v_count FROM users u WHERE u.id = p_viewer_id;
  RETURN QUERY SELECT v_count;
END $$;
-- @end-function

-- @function social/fn_unfollow_user.sql
-- DELETE /users/:id/follow (BR-PR-04). Idempotent: unfollowing someone you don't follow is fine.
-- Also cancels a pending follow request (BR-PR-07), whose notification goes with it.
-- Also cancels a pending follow request (BR-PR-07), whose notification goes with it.
CREATE OR REPLACE FUNCTION fn_unfollow_user(p_viewer_id uuid, p_target_id uuid)
RETURNS TABLE (following boolean, requested boolean, follower_count int)
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

  DELETE FROM follow_requests r WHERE r.requester_id = p_viewer_id AND r.target_id = p_target_id;
  DELETE FROM notifications n
  WHERE n.recipient_id = p_target_id AND n.actor_id = p_viewer_id AND n.type = 'FOLLOW_REQUEST';

  DELETE FROM follow_requests r WHERE r.requester_id = p_viewer_id AND r.target_id = p_target_id;
  DELETE FROM notifications n
  WHERE n.recipient_id = p_target_id AND n.actor_id = p_viewer_id AND n.type = 'FOLLOW_REQUEST';

  DELETE FROM follows f WHERE f.follower_id = p_viewer_id AND f.following_id = p_target_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    UPDATE users u SET following_count = u.following_count - 1 WHERE u.id = p_viewer_id;
    UPDATE users u SET follower_count = u.follower_count - 1 WHERE u.id = p_target_id
    RETURNING u.follower_count INTO v_count;
  ELSE
    SELECT u.follower_count INTO v_count FROM users u WHERE u.id = p_target_id;
  END IF;

  RETURN QUERY SELECT false, false, v_count;
END $$;
-- @end-function

-- @function users/fn_get_profile.sql
-- GET /users/:username (BR-PR-01, story E1-06). Never returns email, date of birth or hashes.
-- JA404 when the user is unknown, not ACTIVE or has blocked the viewer. When the viewer blocked
-- the user, the header is returned with is_blocked_by_me = true (to offer Unblock) and the grid
-- and lists stay empty.
-- A private account (BR-PR-08) returns its header to everyone; can_see_content says whether the
-- viewer also gets its grid and lists, follow_requested whether the viewer has asked, and
-- follow_request_count (own profile only, else 0) how many people are waiting.
CREATE OR REPLACE FUNCTION fn_get_profile(p_viewer_id uuid, p_username text)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, bio varchar,
  avatar_s_key text, avatar_m_key text,
  post_count int, follower_count int, following_count int,
  is_me boolean, is_following boolean, follows_me boolean, is_blocked_by_me boolean,
  created_at timestamptz,
  is_private boolean, can_see_content boolean, follow_requested boolean, follow_request_count int)
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
         u.created_at,
         u.is_private,
         fn__can_see_content(p_viewer_id, u.id) AND NOT t.blocked_by_me,
         EXISTS (SELECT 1 FROM follow_requests r WHERE r.requester_id = p_viewer_id AND r.target_id = u.id),
         CASE WHEN u.id = p_viewer_id THEN
           (SELECT count(*)::int FROM follow_requests r
            JOIN users q ON q.id = r.requester_id AND q.status = 'ACTIVE'
            WHERE r.target_id = u.id AND NOT fn__is_blocked_either_way(u.id, q.id))
         ELSE 0 END
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
-- non-ACTIVE users and anyone blocked in either direction. Private accounts are found like any
-- other (their header is public, BR-PR-08); follow_requested makes their button read Requested.
-- Each stage reads at most 3 × limit candidates through its own index (btree text_pattern_ops for
-- prefixes, GIN trigram for the rest), so the cost does not grow with the number of users.
CREATE OR REPLACE FUNCTION fn_search_users(p_viewer_id uuid, p_q text, p_limit int DEFAULT 20)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, avatar_s_key text, is_following boolean,
  follow_requested boolean)
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
           EXISTS (SELECT 1 FROM follows fo WHERE fo.follower_id = p_viewer_id AND fo.following_id = u.id),
           EXISTS (SELECT 1 FROM follow_requests r WHERE r.requester_id = p_viewer_id AND r.target_id = u.id)
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
         EXISTS (SELECT 1 FROM follows fo WHERE fo.follower_id = p_viewer_id AND fo.following_id = u.id),
         EXISTS (SELECT 1 FROM follow_requests r WHERE r.requester_id = p_viewer_id AND r.target_id = u.id)
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
-- displayName, bio, username, locale, avatarMediaId (null clears displayName / bio / avatar),
-- isPrivate (BR-PR-06). Going private keeps every current follower; going public accepts every
-- pending follow request at once, silently, and removes their "asked to follow you" rows.
-- Unknown keys are ignored. A new avatar must be the viewer's own media with purpose AVATAR that
-- has not failed; a just-uploaded one is marked UPLOADED and the API enqueues its processing (a
-- no-op for READY media). Avatar keys are null until the worker finishes. The replaced avatar is
-- deleted from storage.
CREATE OR REPLACE FUNCTION fn_update_profile(p_viewer_id uuid, p_patch jsonb)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, bio varchar, avatar_media_id uuid,
  avatar_s_key text, avatar_m_key text, locale varchar,
  post_count int, follower_count int, following_count int, is_private boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_constraint text;
  v_old_avatar uuid;
  v_new_avatar uuid;
  m            media_assets%ROWTYPE;
  v_accepted   int;
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
      avatar_media_id = v_new_avatar,
      is_private      = CASE WHEN p_patch ? 'isPrivate'   THEN (p_patch->>'isPrivate')::boolean          ELSE u.is_private END
    WHERE u.id = p_viewer_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'users_username_key' THEN
      RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'USERNAME_TAKEN';
    END IF;
    RAISE;
  END;

  -- Public now: whoever was waiting is in. The requesters' rows are locked through the follows
  -- insert's foreign key, not FOR UPDATE, so this never waits on a whole list of users.
  IF NOT (SELECT u.is_private FROM users u WHERE u.id = p_viewer_id) THEN
    WITH accepted AS (
      DELETE FROM follow_requests r WHERE r.target_id = p_viewer_id
      RETURNING r.requester_id
    ),
    inserted AS (
      INSERT INTO follows (follower_id, following_id)
      SELECT a.requester_id, p_viewer_id
      FROM accepted a
      JOIN users q ON q.id = a.requester_id AND q.status = 'ACTIVE'
      WHERE NOT fn__is_blocked_either_way(p_viewer_id, a.requester_id)
      ON CONFLICT DO NOTHING
      RETURNING follower_id
    ),
    counted AS (
      UPDATE users u SET following_count = u.following_count + 1
      FROM inserted i WHERE u.id = i.follower_id
      RETURNING u.id
    )
    SELECT count(*)::int INTO v_accepted FROM counted;

    IF v_accepted > 0 THEN
      UPDATE users u SET follower_count = u.follower_count + v_accepted WHERE u.id = p_viewer_id;
    END IF;
    DELETE FROM notifications n WHERE n.recipient_id = p_viewer_id AND n.type = 'FOLLOW_REQUEST';
  END IF;

  IF v_old_avatar IS NOT NULL AND v_old_avatar IS DISTINCT FROM v_new_avatar THEN
    PERFORM fn__queue_media_deletion(ARRAY[v_old_avatar]);
  END IF;

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.bio, u.avatar_media_id, avs.object_key, avm.object_key, u.locale,
         u.post_count, u.follower_count, u.following_count, u.is_private
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
