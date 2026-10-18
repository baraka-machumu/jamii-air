-- GET /posts/:id/comments (BR-FD-04/05). The post's TOP-LEVEL comments, newest first (the app
-- shows them newest first too); cursor = the last row's (created_at, comment_id). Replies are
-- not in this list: they are fetched per comment by fn_get_comment_replies (BR-FD-08).
-- Hides hidden / deleted comments, authors who are not ACTIVE and users blocked either way.
-- can_delete: the viewer wrote the comment or owns the post.
-- reply_count is the stored counter, which does not know the viewer's blocks, so a thread can
-- open with fewer replies than the count promised. It is a count, not a guarantee.
CREATE OR REPLACE FUNCTION fn_get_post_comments(
  p_viewer_id   uuid,
  p_post_id     uuid,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  comment_id uuid, body varchar, created_at timestamptz, reply_count int,
  author_id uuid, author_username citext, author_display_name varchar, author_avatar_key text,
  can_delete boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_post_author uuid;
  c             record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  v_post_author := fn__assert_post_visible(p_viewer_id, p_post_id);

  RETURN QUERY
  SELECT k.id, k.body, k.created_at, k.reply_count,
         u.id, u.username, u.display_name, av.object_key,
         p_viewer_id IN (k.author_id, v_post_author)
  FROM comments k
  JOIN users u ON u.id = k.author_id AND u.status = 'ACTIVE'
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE k.post_id = p_post_id
    AND k.parent_id IS NULL
    AND k.deleted_at IS NULL AND k.hidden_at IS NULL
    AND (k.created_at, k.id) < (c.cursor_time, c.cursor_id)
    AND NOT EXISTS (SELECT 1 FROM blocks b
                    WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = k.author_id)
                       OR (b.blocker_id = k.author_id AND b.blocked_id = p_viewer_id))
  ORDER BY k.created_at DESC, k.id DESC
  LIMIT c.page_limit;
END $$;
