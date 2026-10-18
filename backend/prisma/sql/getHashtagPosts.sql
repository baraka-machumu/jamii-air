-- fn_get_hashtag_posts (BR-FD-11): one tag's posts as grid tiles, limit + 1 rows, newest first.
-- @param {String} $1:viewerId
-- @param {String} $2:tag
-- @param {DateTime} $3:cursorTime?
-- @param {String} $4:cursorId?
-- @param {Int} $5:limit
SELECT post_id, status::text AS status, type::text AS type, thumb_key, blurhash, media_count,
       created_at, tag::text AS tag, post_count
FROM fn_get_hashtag_posts($1::uuid, $2::text, $3::timestamptz, $4::uuid, $5::int);
