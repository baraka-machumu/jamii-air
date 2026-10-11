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
