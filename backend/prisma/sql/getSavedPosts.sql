-- fn_get_saved_posts (BR-FD-13): the viewer's Saved grid, limit + 1 rows, most recently saved first.
-- @param {String} $1:viewerId
-- @param {DateTime} $2:cursorTime?
-- @param {String} $3:cursorId?
-- @param {Int} $4:limit
SELECT post_id, status::text AS status, type::text AS type, thumb_key, blurhash, media_count, created_at, saved_at
FROM fn_get_saved_posts($1::uuid, $2::timestamptz, $3::uuid, $4::int);
