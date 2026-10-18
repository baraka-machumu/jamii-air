-- Rewrites a post's hashtags from its caption (BR-FD-10). Called by fn_create_post and
-- fn_update_post_caption, so a post's tags always match the caption that is stored.
--
-- A tag is '#' followed by 1-64 letters, digits or underscores, and the '#' must not sit right
-- after one of those characters: "(#dar)" and "#dar_es" are tags, "C#" and "a#b" are not. Tags
-- are stored lower-cased and without the '#', and compared case-insensitively (the column is
-- citext), so "#DAR #dar" in one caption is one tag on the post and every post reaches the same
-- tag row whatever case it was typed in. A run longer than 64 characters is not skipped, its
-- first 64 characters are the tag. At most 30 distinct tags are kept, in alphabetical order; a
-- caption stuffed with more is not an error, the rest are ignored.
CREATE OR REPLACE FUNCTION fn__sync_post_hashtags(p_post_id uuid, p_caption text)
RETURNS void
LANGUAGE sql VOLATILE
SET search_path = public, pg_temp
AS $$
  WITH wanted AS (
    SELECT DISTINCT lower(m[1])::citext AS tag
    FROM regexp_matches(COALESCE(p_caption, ''), '(?:^|[^[:alnum:]_])#([[:alnum:]_]{1,64})', 'g') AS m
    ORDER BY tag
    LIMIT 30
  ),
  -- A tag row is created the first time anyone uses it and never removed: it costs a few bytes
  -- and keeps older /t/<tag> links working. ON CONFLICT makes two posts introducing the same new
  -- tag in the same instant safe.
  created AS (
    INSERT INTO hashtags (tag) SELECT w.tag FROM wanted w
    ON CONFLICT (tag) DO NOTHING
    RETURNING id
  ),
  -- This statement's snapshot predates `created`, so the tags it just inserted have to be
  -- unioned in rather than read back from the table.
  ids AS MATERIALIZED (
    SELECT h.id FROM hashtags h JOIN wanted w ON w.tag = h.tag
    UNION
    SELECT c.id FROM created c
  ),
  dropped AS (
    DELETE FROM post_hashtags ph
    WHERE ph.post_id = p_post_id AND ph.hashtag_id NOT IN (SELECT i.id FROM ids i)
  )
  INSERT INTO post_hashtags (post_id, hashtag_id)
  SELECT p_post_id, i.id FROM ids i
  ON CONFLICT DO NOTHING;
$$;
