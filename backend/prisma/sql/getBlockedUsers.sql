-- fn_get_blocked_users (Schema §7.3): limit + 1 rows, most recently blocked first.
-- @param {String} $1:viewerId
-- @param {DateTime} $2:cursorTime?
-- @param {String} $3:cursorId?
-- @param {Int} $4:limit
SELECT user_id, username::text AS username, display_name, avatar_s_key, blocked_at
FROM fn_get_blocked_users($1::uuid, $2::timestamptz, $3::uuid, $4::int);
