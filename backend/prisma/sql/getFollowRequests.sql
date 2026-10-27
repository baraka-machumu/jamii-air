-- fn_get_follow_requests (Schema §7.3): limit + 1 rows, newest request first.
-- @param {String} $1:viewerId
-- @param {DateTime} $2:cursorTime?
-- @param {String} $3:cursorId?
-- @param {Int} $4:limit
SELECT user_id, username::text AS username, display_name, avatar_s_key, is_following, requested_at
FROM fn_get_follow_requests($1::uuid, $2::timestamptz, $3::uuid, $4::int);
