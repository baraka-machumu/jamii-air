-- GET /feed (BR-FD-01/02, TRD §10; reference implementation Schema §8.1). Fan-out on read:
-- PUBLISHED posts of followed users and the viewer's own, author ACTIVE, no block either way,
-- newest first. One round trip, already joined with author, media variants and liked_by_me.
-- Returns limit + 1 rows; the API builds nextCursor from the extra row.
--
-- `media` is the post's items in carousel order (BR-CT-09). A photo carries feedKey; a video
-- carries videoKey (the 720p MP4), posterKey and durationMs (BR-CT-08). Both carry thumbKey,
-- and width/height describe whichever of the two is there, so the card can reserve its space.
CREATE OR REPLACE FUNCTION fn_get_home_feed(
  p_viewer_id   uuid,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  post_id uuid, created_at timestamptz, type post_type, caption varchar, like_count int,
  comment_count int, liked_by_me boolean, author_id uuid, author_username citext,
  author_display_name varchar, author_avatar_key text, media jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  RETURN QUERY
  WITH authors AS (
    SELECT f.following_id AS id FROM follows f WHERE f.follower_id = p_viewer_id
    UNION ALL
    SELECT p_viewer_id
  ),
  -- Top page_limit posts per author through posts_published_author_created_idx, then the newest
  -- page_limit of those: at most (follows + 1) × page_limit index rows, however long the history.
  page AS (
    SELECT x.id, x.author_id, x.type, x.caption, x.like_count, x.comment_count, x.created_at
    FROM authors a
    JOIN users u ON u.id = a.id AND u.status = 'ACTIVE'
    CROSS JOIN LATERAL (
      SELECT p.id, p.author_id, p.type, p.caption, p.like_count, p.comment_count, p.created_at
      FROM posts p
      WHERE p.author_id = a.id
        AND p.status = 'PUBLISHED'
        AND (p.created_at, p.id) < (c.cursor_time, c.cursor_id)
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT c.page_limit
    ) x
    WHERE NOT EXISTS (SELECT 1 FROM blocks b
                      WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = a.id)
                         OR (b.blocker_id = a.id AND b.blocked_id = p_viewer_id))
    ORDER BY x.created_at DESC, x.id DESC
    LIMIT c.page_limit
  )
  SELECT pg.id, pg.created_at, pg.type, pg.caption, pg.like_count, pg.comment_count,
         EXISTS (SELECT 1 FROM likes l WHERE l.user_id = p_viewer_id AND l.post_id = pg.id),
         u.id, u.username, u.display_name, av.object_key,
         m.media
  FROM page pg
  JOIN users u ON u.id = pg.author_id
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
             'id', ma.id, 'kind', ma.kind, 'blurhash', ma.blurhash,
             'feedKey', fv.object_key, 'thumbKey', tv.object_key,
             'posterKey', pv.object_key, 'videoKey', vv.object_key, 'durationMs', ma.duration_ms,
             'width', COALESCE(fv.width, vv.width), 'height', COALESCE(fv.height, vv.height))
             ORDER BY pm.position) AS media
    FROM post_media pm
    JOIN media_assets ma ON ma.id = pm.media_id
    LEFT JOIN media_variants fv ON fv.media_id = ma.id AND fv.variant = 'FEED'
    LEFT JOIN media_variants tv ON tv.media_id = ma.id AND tv.variant = 'THUMB'
    LEFT JOIN media_variants pv ON pv.media_id = ma.id AND pv.variant = 'POSTER'
    LEFT JOIN media_variants vv ON vv.media_id = ma.id AND vv.variant = 'VIDEO_720'
    WHERE pm.post_id = pg.id
  ) m
  ORDER BY pg.created_at DESC, pg.id DESC;
END $$;
