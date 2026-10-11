-- GET /admin/posts/:id: any post including hidden and deleted (AP-08), with its author, media,
-- reports and moderation history.
CREATE OR REPLACE FUNCTION fn_admin_get_post(p_admin_id uuid, p_post_id uuid)
RETURNS TABLE (
  post_id uuid, status post_status, caption varchar, like_count int, comment_count int,
  created_at timestamptz, published_at timestamptz, hidden_at timestamptz, deleted_at timestamptz,
  author_id uuid, author_username citext, author_status user_status,
  media jsonb, reports jsonb, moderation_history jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  IF NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = p_post_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'POST_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT p.id, p.status, p.caption, p.like_count, p.comment_count,
         p.created_at, p.published_at, p.hidden_at, p.deleted_at,
         u.id, u.username, u.status,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object('id', ma.id, 'status', ma.status, 'blurhash', ma.blurhash,
                    'feedKey', fv.object_key, 'thumbKey', tv.object_key, 'width', fv.width, 'height', fv.height)
                  ORDER BY pm.position)
           FROM post_media pm
           JOIN media_assets ma ON ma.id = pm.media_id
           LEFT JOIN media_variants fv ON fv.media_id = ma.id AND fv.variant = 'FEED'
           LEFT JOIN media_variants tv ON tv.media_id = ma.id AND tv.variant = 'THUMB'
           WHERE pm.post_id = p.id), '[]'::jsonb),
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object('reportId', r.id, 'status', r.status, 'reason', r.reason,
                    'reporterUsername', ru.username, 'createdAt', r.created_at) ORDER BY r.created_at DESC)
           FROM reports r JOIN users ru ON ru.id = r.reporter_id
           WHERE r.target_post_id = p.id), '[]'::jsonb),
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object('action', m.action, 'note', m.note, 'adminName', a.display_name,
                    'createdAt', m.created_at) ORDER BY m.created_at DESC)
           FROM moderation_actions m JOIN admin_users a ON a.id = m.admin_id
           WHERE m.target_post_id = p.id), '[]'::jsonb)
  FROM posts p
  JOIN users u ON u.id = p.author_id
  WHERE p.id = p_post_id;
END $$;
