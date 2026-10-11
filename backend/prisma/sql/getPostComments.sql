-- fn_get_post_comments (Schema §7.5): limit + 1 rows, newest first.
-- @param {String} $1:viewerId
-- @param {String} $2:postId
-- @param {DateTime} $3:cursorTime?
-- @param {String} $4:cursorId?
-- @param {Int} $5:limit
SELECT comment_id, body, created_at, author_id, author_username::text AS author_username, author_display_name,
       author_avatar_key, can_delete
FROM fn_get_post_comments($1::uuid, $2::uuid, $3::timestamptz, $4::uuid, $5::int);
