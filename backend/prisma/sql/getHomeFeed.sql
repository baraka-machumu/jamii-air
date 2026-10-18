-- fn_get_home_feed (Schema §8.1): limit + 1 rows, already joined with author, media and liked_by_me.
-- @param {String} $1:viewerId
-- @param {DateTime} $2:cursorTime?
-- @param {String} $3:cursorId?
-- @param {Int} $4:limit
SELECT post_id, created_at, type::text AS type, caption, like_count, comment_count, liked_by_me,
       author_id, author_username::text AS author_username, author_display_name, author_avatar_key, media
FROM fn_get_home_feed($1::uuid, $2::timestamptz, $3::uuid, $4::int);
