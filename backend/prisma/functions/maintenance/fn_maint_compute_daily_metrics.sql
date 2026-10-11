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
