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
