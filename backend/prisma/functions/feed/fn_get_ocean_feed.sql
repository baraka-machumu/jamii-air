-- GET /ocean (BR-OC-01, Kidili K2.1, ADR-016): The Ocean, the video posts R1 already makes, full
-- screen one at a time. Every PUBLISHED video the viewer may see, newest first, with no ranking
-- (D-4; Q-K1): unlike the home feed it is NOT limited to people the viewer follows.
-- Visibility is the hashtag grid's: author ACTIVE, nothing either way across a block, and nothing
-- from a private account the viewer does not follow (BR-PR-08). The viewer's own videos are in it,
-- as fn__can_see_content allows; their PROCESSING ones are not (the home feed shows those).
-- Returns limit + 1 rows; the API builds nextCursor from the extra row.
--
-- Reads newest first through posts_published_video_created_idx and drops what the viewer may not
-- see as it goes; private accounts the viewer does not follow are skipped row by row, which is
-- fine at the pilot's size.
--
-- Feed-item shape (media as in fn_get_home_feed: one VIDEO item), plus view_count (BR-OC-04) and
-- following_author for the Follow button on the rail (BR-OC-03); false on the viewer's own videos.
CREATE OR REPLACE FUNCTION fn_get_ocean_feed(
  p_viewer_id   uuid,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  post_id uuid, created_at timestamptz, caption varchar, like_count int, comment_count int,
  view_count int, liked_by_me boolean, saved_by_me boolean, author_id uuid, author_username citext,
  author_display_name varchar, author_avatar_key text, following_author boolean, media jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  RETURN QUERY
  WITH page AS (
    SELECT p.id, p.author_id, p.caption, p.like_count, p.comment_count, p.view_count, p.created_at
    FROM posts p
    JOIN users u ON u.id = p.author_id AND u.status = 'ACTIVE'
    WHERE p.status = 'PUBLISHED' AND p.type = 'VIDEO'
      AND (p.created_at, p.id) < (c.cursor_time, c.cursor_id)
      AND fn__can_see_content(p_viewer_id, p.author_id)
      AND NOT EXISTS (SELECT 1 FROM blocks b
                      WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = p.author_id)
                         OR (b.blocker_id = p.author_id AND b.blocked_id = p_viewer_id))
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT c.page_limit
  )
  SELECT pg.id, pg.created_at, pg.caption, pg.like_count, pg.comment_count, pg.view_count,
         EXISTS (SELECT 1 FROM likes l WHERE l.user_id = p_viewer_id AND l.post_id = pg.id),
         EXISTS (SELECT 1 FROM saved_posts s WHERE s.user_id = p_viewer_id AND s.post_id = pg.id),
         u.id, u.username, u.display_name, av.object_key,
         EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = p_viewer_id AND f.following_id = pg.author_id),
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
