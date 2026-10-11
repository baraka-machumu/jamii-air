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
