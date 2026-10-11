-- GET /posts/:id (post detail, shared links). Feed-item shape plus status and is_mine.
-- Others see PUBLISHED posts only (fn__assert_post_visible); the author also sees their own
-- PROCESSING and FAILED posts. Hidden and deleted posts are JA404 for everyone.
CREATE OR REPLACE FUNCTION fn_get_post(p_viewer_id uuid, p_post_id uuid)
RETURNS TABLE (
  post_id uuid, status post_status, created_at timestamptz, caption varchar,
  like_count int, comment_count int, liked_by_me boolean, is_mine boolean,
  author_id uuid, author_username citext, author_display_name varchar, author_avatar_key text,
  media jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = p_post_id AND p.author_id = p_viewer_id
                 AND p.status IN ('PROCESSING', 'PUBLISHED', 'FAILED')) THEN
    PERFORM fn__assert_post_visible(p_viewer_id, p_post_id);
  END IF;

  RETURN QUERY
  SELECT p.id, p.status, p.created_at, p.caption, p.like_count, p.comment_count,
         EXISTS (SELECT 1 FROM likes l WHERE l.user_id = p_viewer_id AND l.post_id = p.id),
         p.author_id = p_viewer_id,
         u.id, u.username, u.display_name, av.object_key,
         (SELECT jsonb_agg(jsonb_build_object(
                   'id', ma.id, 'kind', ma.kind, 'status', ma.status, 'blurhash', ma.blurhash,
                   'feedKey', fv.object_key, 'thumbKey', tv.object_key,
                   'width', fv.width, 'height', fv.height) ORDER BY pm.position)
          FROM post_media pm
          JOIN media_assets ma ON ma.id = pm.media_id
          LEFT JOIN media_variants fv ON fv.media_id = ma.id AND fv.variant = 'FEED'
          LEFT JOIN media_variants tv ON tv.media_id = ma.id AND tv.variant = 'THUMB'
          WHERE pm.post_id = p.id)
  FROM posts p
  JOIN users u ON u.id = p.author_id
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE p.id = p_post_id;
END $$;
