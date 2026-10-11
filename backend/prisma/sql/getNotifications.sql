-- fn_get_notifications (Schema §7.6): limit + 1 rows, newest first.
-- @param {String} $1:viewerId
-- @param {DateTime} $2:cursorTime?
-- @param {String} $3:cursorId?
-- @param {Int} $4:limit
SELECT notification_id, type::text AS type, created_at, read_at, actor_id, actor_username::text AS actor_username,
       actor_display_name, actor_avatar_key, actor_followed_by_me, post_id, post_thumb_key, comment_id, comment_excerpt,
       target_available
FROM fn_get_notifications($1::uuid, $2::timestamptz, $3::uuid, $4::int);
