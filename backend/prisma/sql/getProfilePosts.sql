-- fn_get_profile_posts (Schema §7.4): profile grid, limit + 1 rows, newest first.
-- @param {String} $1:viewerId
-- @param {String} $2:username
-- @param {DateTime} $3:cursorTime?
-- @param {String} $4:cursorId?
-- @param {Int} $5:limit
SELECT post_id, status::text AS status, type::text AS type, thumb_key, blurhash, media_count, created_at
FROM fn_get_profile_posts($1::uuid, $2::text, $3::timestamptz, $4::uuid, $5::int);
