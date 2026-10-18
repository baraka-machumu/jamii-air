-- GET /tags/:tag/posts (BR-FD-11). The posts carrying one tag, newest first, as grid tiles.
-- Visibility matches the feed and the profile grid: PUBLISHED posts only, author ACTIVE, and
-- nothing either way across a block — so a tag never becomes a way around a block.
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
  WHERE ph.hashtag_id = v_hashtag_id;

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
    AND NOT EXISTS (SELECT 1 FROM blocks b
                    WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = p.author_id)
                       OR (b.blocker_id = p.author_id AND b.blocked_id = p_viewer_id))
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT c.page_limit;
END $$;
