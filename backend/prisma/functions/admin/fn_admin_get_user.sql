-- GET /admin/users/:id (App Flow §15.5): account, status history fields, recent posts (any status),
-- reports against the user and moderation history. Never the date of birth or hashes.
CREATE OR REPLACE FUNCTION fn_admin_get_user(p_admin_id uuid, p_user_id uuid)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, bio varchar, email citext, status user_status,
  avatar_m_key text, locale varchar, post_count int, follower_count int, following_count int,
  invite_code varchar, suspended_at timestamptz, deletion_requested_at timestamptz,
  last_active_at timestamptz, created_at timestamptz, reports_filed int,
  recent_posts jsonb, reports_against jsonb, moderation_history jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.bio, u.email, u.status, av.object_key, u.locale,
         u.post_count, u.follower_count, u.following_count, i.code,
         u.suspended_at, u.deletion_requested_at, u.last_active_at, u.created_at,
         (SELECT count(*)::int FROM reports r WHERE r.reporter_id = u.id),
         COALESCE((
           SELECT jsonb_agg(x.item ORDER BY x.created_at DESC) FROM (
             SELECT p.created_at, jsonb_build_object('postId', p.id, 'status', p.status, 'caption', left(p.caption, 140),
                      'thumbKey', tv.object_key, 'likeCount', p.like_count, 'commentCount', p.comment_count,
                      'createdAt', p.created_at) AS item
             FROM posts p
             LEFT JOIN post_media pm ON pm.post_id = p.id AND pm.position = 0
             LEFT JOIN media_variants tv ON tv.media_id = pm.media_id AND tv.variant = 'THUMB'
             WHERE p.author_id = u.id
             ORDER BY p.created_at DESC LIMIT 30) x), '[]'::jsonb),
         COALESCE((
           SELECT jsonb_agg(x.item ORDER BY x.created_at DESC) FROM (
             SELECT r.created_at, jsonb_build_object('reportId', r.id, 'status', r.status, 'reason', r.reason,
                      'targetType', r.target_type, 'createdAt', r.created_at) AS item
             FROM reports r WHERE r.reported_user_id = u.id
             ORDER BY r.created_at DESC LIMIT 30) x), '[]'::jsonb),
         COALESCE((
           SELECT jsonb_agg(x.item ORDER BY x.created_at DESC) FROM (
             SELECT m.created_at, jsonb_build_object('action', m.action, 'note', m.note, 'adminName', a.display_name,
                      'postId', m.target_post_id, 'commentId', m.target_comment_id, 'createdAt', m.created_at) AS item
             FROM moderation_actions m JOIN admin_users a ON a.id = m.admin_id
             WHERE m.target_user_id = u.id
             ORDER BY m.created_at DESC LIMIT 30) x), '[]'::jsonb)
  FROM users u
  LEFT JOIN invite_codes i ON i.id = u.invite_code_id
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_M'
  WHERE u.id = p_user_id;
END $$;
