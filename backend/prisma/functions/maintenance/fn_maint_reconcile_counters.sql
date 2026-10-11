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
