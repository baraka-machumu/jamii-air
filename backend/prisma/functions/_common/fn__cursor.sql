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
