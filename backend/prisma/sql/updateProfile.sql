-- fn_update_profile (Schema §7.2): only keys present in the patch change.
-- @param {String} $1:viewerId
-- @param {Json} $2:patch
SELECT user_id, username::text AS username, display_name, bio, avatar_media_id, avatar_s_key, avatar_m_key, locale,
       post_count, follower_count, following_count
FROM fn_update_profile($1::uuid, $2::jsonb);
