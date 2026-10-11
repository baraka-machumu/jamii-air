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
