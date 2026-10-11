-- fn_admin_get_user (Schema §7.9): never the date of birth or hashes.
-- @param {String} $1:adminId
-- @param {String} $2:userId
SELECT user_id, username::text AS username, display_name, bio, email::text AS email, status::text AS status, avatar_m_key,
       locale, post_count, follower_count, following_count, invite_code, suspended_at, deletion_requested_at,
       last_active_at, created_at, reports_filed, recent_posts, reports_against, moderation_history
FROM fn_admin_get_user($1::uuid, $2::uuid);
