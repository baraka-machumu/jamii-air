-- GET /users/:username (BR-PR-01, story E1-06). Never returns email, date of birth or hashes.
-- JA404 when the user is unknown, not ACTIVE or has blocked the viewer. When the viewer blocked
-- the user, the header is returned with is_blocked_by_me = true (to offer Unblock) and the grid
-- and lists stay empty.
CREATE OR REPLACE FUNCTION fn_get_profile(p_viewer_id uuid, p_username text)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, bio varchar,
  avatar_s_key text, avatar_m_key text,
  post_count int, follower_count int, following_count int,
  is_me boolean, is_following boolean, follows_me boolean, is_blocked_by_me boolean,
  created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  t record;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  t := fn__resolve_profile(p_viewer_id, p_username);

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.bio, avs.object_key, avm.object_key,
         u.post_count, u.follower_count, u.following_count,
         u.id = p_viewer_id,
         EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = p_viewer_id AND f.following_id = u.id),
         EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = u.id AND f.following_id = p_viewer_id),
         t.blocked_by_me,
         u.created_at
  FROM users u
  LEFT JOIN media_variants avs ON avs.media_id = u.avatar_media_id AND avs.variant = 'AVATAR_S'
  LEFT JOIN media_variants avm ON avm.media_id = u.avatar_media_id AND avm.variant = 'AVATAR_M'
  WHERE u.id = t.target_id;
END $$;
