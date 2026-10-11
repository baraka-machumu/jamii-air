-- fn_get_following (Schema §7.3): limit + 1 rows, newest follow first.
-- @param {String} $1:viewerId
-- @param {String} $2:username
-- @param {DateTime} $3:cursorTime?
-- @param {String} $4:cursorId?
-- @param {Int} $5:limit
SELECT user_id, username::text AS username, display_name, avatar_s_key, is_following, is_me, followed_at
FROM fn_get_following($1::uuid, $2::text, $3::timestamptz, $4::uuid, $5::int);
