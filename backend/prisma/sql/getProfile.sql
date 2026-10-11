-- fn_get_profile (Schema §7.3): JA404 when unknown, inactive or the viewer is blocked.
-- @param {String} $1:viewerId
-- @param {String} $2:username
SELECT user_id, username::text AS username, display_name, bio, avatar_s_key, avatar_m_key,
       post_count, follower_count, following_count, is_me, is_following, follows_me, is_blocked_by_me, created_at
FROM fn_get_profile($1::uuid, $2::text);
